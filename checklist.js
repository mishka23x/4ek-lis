'use strict';

(() => {
  const STORAGE_KEY = 'ljMarathonState_v1';
  const RECOVERY_KEY = 'ljMarathonState_v1_recovery';
  const SCHEMA_VERSION = 2;
  const BACKUP_SCHEMA_VERSION = 2;
  const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
  const MAX_NICK_LENGTH = 512;
  const MAX_LINK_LENGTH = 8192;
  const MAX_LINKS_PER_TASK = 500;
  const MAX_QUOTA_VALUE = 1000000;
  const SAVE_DEBOUNCE_MS = 300;
  const FINAL_TIMEOUT_MS = 15000;
  const LEGACY_SHARED_TASK_ID = 'tsgby0gy';
  const SPLIT_TASK_ID = 'tch0tarj';
  const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  const config = readJsonBlock('appConfig');
  const template = readJsonBlock('templateData');
  const TEMPLATE_VERSION = String(config.templateVersion || '');
  const CHALLENGE_CATEGORY_NAME = String(config.challengeCategoryName || '');
  const CHALLENGE_COMPLETE_THRESHOLD = Number(config.challengeCompleteThreshold) || 10;
  const FINAL_STATS_ENABLED = config.finalStatsEnabled === true;
  const FINAL_STATS_URL = String(config.finalStatsUrl || '').trim();

  const taskById = new Map();
  const categoryById = new Map();
  const quotaById = new Map();
  const taskCategoryById = new Map();
  const taskOrderById = new Map();
  const taskDomById = new Map();
  const categoryDomById = new Map();
  const quotaInputById = new Map();
  const linkInputByKey = new Map();

  let state;
  let saveTimer = 0;
  let pendingRecoveryRaw = '';
  let sendingFinal = false;
  let urlOccurrences = new Map();

  function readJsonBlock(id) {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing data block: ${id}`);
    return JSON.parse(element.textContent);
  }

  function isPlainRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function createRecord() {
    return Object.create(null);
  }

  function hasOwn(record, key) {
    return Object.prototype.hasOwnProperty.call(record, key);
  }

  function rejectDangerousKey(key, label) {
    if (DANGEROUS_KEYS.has(key)) throw new Error(`${label}: forbidden key`);
  }

  function assertAllowedKeys(record, allowed, label) {
    if (!isPlainRecord(record)) throw new Error(`${label}: object expected`);
    for (const key of Object.keys(record)) {
      rejectDangerousKey(key, label);
      if (!allowed.has(key)) throw new Error(`${label}: unexpected field`);
    }
  }

  function requireString(value, maxLength, label) {
    if (typeof value !== 'string' || value.length > maxLength) {
      throw new Error(`${label}: invalid string`);
    }
    return value;
  }

  function requireInteger(value, min, max, label) {
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error(`${label}: invalid integer`);
    }
    return value;
  }

  function validateTrustedTemplate() {
    if (!isPlainRecord(template) || !Array.isArray(template.quotas) || !Array.isArray(template.categories)) {
      throw new Error('Invalid embedded template');
    }
    for (const quota of template.quotas) {
      if (!isPlainRecord(quota) || typeof quota.id !== 'string' || quotaById.has(quota.id)) {
        throw new Error('Duplicate or invalid quota id');
      }
      quotaById.set(quota.id, quota);
    }
    let taskOrder = 0;
    for (const category of template.categories) {
      if (!isPlainRecord(category) || typeof category.id !== 'string' || categoryById.has(category.id) || !Array.isArray(category.tasks)) {
        throw new Error('Duplicate or invalid category id');
      }
      categoryById.set(category.id, category);
      for (const task of category.tasks) {
        if (!isPlainRecord(task) || typeof task.id !== 'string' || taskById.has(task.id)) {
          throw new Error('Duplicate or invalid task id');
        }
        taskById.set(task.id, task);
        taskCategoryById.set(task.id, category.id);
        taskOrderById.set(task.id, taskOrder);
        taskOrder += 1;
      }
    }
  }

  function createDefaultProgress() {
    return {
      quotaTargets: createRecord(),
      tasks: createRecord(),
      collapsed: createRecord(),
      milestones: { global: 0, cats: createRecord(), tasks: createRecord() }
    };
  }

  function createDefaultState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      templateVersion: TEMPLATE_VERSION,
      progress: createDefaultProgress(),
      settings: { nick: '' }
    };
  }

  function normalizeTaskState(raw, label) {
    assertAllowedKeys(raw, new Set(['checked', 'links', 'marks']), label);
    const checked = raw.checked === undefined ? false : raw.checked;
    if (typeof checked !== 'boolean') throw new Error(`${label}: invalid checked value`);

    let links = [''];
    if (raw.links !== undefined) {
      if (!Array.isArray(raw.links) || raw.links.length > MAX_LINKS_PER_TASK) {
        throw new Error(`${label}: invalid links`);
      }
      links = raw.links.map((link, index) => requireString(link, MAX_LINK_LENGTH, `${label}.links[${index}]`));
      if (!links.length) links = [''];
    }

    let liked = false;
    if (raw.marks !== undefined) {
      assertAllowedKeys(raw.marks, new Set(['liked']), `${label}.marks`);
      if (raw.marks.liked !== undefined && typeof raw.marks.liked !== 'boolean') {
        throw new Error(`${label}: invalid liked value`);
      }
      liked = raw.marks.liked === true;
    }
    return { checked, links, marks: { liked } };
  }

  function normalizeMilestones(raw) {
    const normalized = { global: 0, cats: createRecord(), tasks: createRecord() };
    if (raw === undefined) return normalized;
    assertAllowedKeys(raw, new Set(['global', 'cats', 'tasks']), 'progress.milestones');
    if (raw.global !== undefined) normalized.global = requireInteger(raw.global, 0, 10000000, 'progress.milestones.global');

    for (const [field, knownIds] of [['cats', categoryById], ['tasks', taskById]]) {
      if (raw[field] === undefined) continue;
      if (!isPlainRecord(raw[field])) throw new Error(`progress.milestones.${field}: object expected`);
      for (const [key, value] of Object.entries(raw[field])) {
        rejectDangerousKey(key, `progress.milestones.${field}`);
        if (!knownIds.has(key)) continue;
        normalized[field][key] = requireInteger(value, 0, 10000000, `progress.milestones.${field}.${key}`);
      }
    }
    return normalized;
  }

  function normalizeProgress(raw) {
    const normalized = createDefaultProgress();
    if (raw === undefined) return normalized;
    assertAllowedKeys(raw, new Set(['quotaTargets', 'tasks', 'collapsed', 'milestones', 'finalSent', 'finalPending']), 'progress');

    if (raw.quotaTargets !== undefined) {
      if (!isPlainRecord(raw.quotaTargets)) throw new Error('progress.quotaTargets: object expected');
      for (const [id, value] of Object.entries(raw.quotaTargets)) {
        rejectDangerousKey(id, 'progress.quotaTargets');
        if (!quotaById.has(id)) continue;
        const text = typeof value === 'number' ? String(value) : requireString(value, 32, `quota ${id}`);
        if (text !== '' && (!/^\d+$/.test(text) || Number(text) > MAX_QUOTA_VALUE)) {
          throw new Error(`quota ${id}: invalid value`);
        }
        normalized.quotaTargets[id] = text;
      }
    }

    if (raw.tasks !== undefined) {
      if (!isPlainRecord(raw.tasks)) throw new Error('progress.tasks: object expected');
      for (const [id, value] of Object.entries(raw.tasks)) {
        rejectDangerousKey(id, 'progress.tasks');
        if (!taskById.has(id) && id !== LEGACY_SHARED_TASK_ID) continue;
        normalized.tasks[id] = normalizeTaskState(value, `progress.tasks.${id}`);
      }
      if (hasOwn(normalized.tasks, LEGACY_SHARED_TASK_ID) && !hasOwn(normalized.tasks, SPLIT_TASK_ID)) {
        normalized.tasks[SPLIT_TASK_ID] = cloneTaskState(normalized.tasks[LEGACY_SHARED_TASK_ID]);
      }
    }

    if (raw.collapsed !== undefined) {
      if (!isPlainRecord(raw.collapsed)) throw new Error('progress.collapsed: object expected');
      for (const [id, value] of Object.entries(raw.collapsed)) {
        rejectDangerousKey(id, 'progress.collapsed');
        if (!categoryById.has(id)) continue;
        if (typeof value !== 'boolean') throw new Error(`progress.collapsed.${id}: invalid value`);
        normalized.collapsed[id] = value;
      }
    }

    normalized.milestones = normalizeMilestones(raw.milestones);

    if (raw.finalSent !== undefined) {
      assertAllowedKeys(raw.finalSent, new Set(['ts', 'rows', 'submissionId']), 'progress.finalSent');
      const ts = requireString(raw.finalSent.ts, 64, 'progress.finalSent.ts');
      if (!Number.isFinite(Date.parse(ts))) throw new Error('progress.finalSent.ts: invalid date');
      normalized.finalSent = {
        ts,
        rows: requireInteger(raw.finalSent.rows, 0, 1000000, 'progress.finalSent.rows')
      };
      if (raw.finalSent.submissionId !== undefined) {
        normalized.finalSent.submissionId = requireString(raw.finalSent.submissionId, 80, 'progress.finalSent.submissionId');
      }
    }

    if (raw.finalPending !== undefined) {
      assertAllowedKeys(raw.finalPending, new Set(['submissionId', 'createdAt']), 'progress.finalPending');
      const createdAt = requireString(raw.finalPending.createdAt, 64, 'progress.finalPending.createdAt');
      if (!Number.isFinite(Date.parse(createdAt))) throw new Error('progress.finalPending.createdAt: invalid date');
      normalized.finalPending = {
        submissionId: requireString(raw.finalPending.submissionId, 80, 'progress.finalPending.submissionId'),
        createdAt
      };
    }
    return normalized;
  }

  function normalizeState(raw) {
    if (raw === null || raw === undefined) return createDefaultState();
    assertAllowedKeys(
      raw,
      new Set(['schemaVersion', 'templateVersion', 'progress', 'settings', 'title', 'coverImage', 'quotas', 'categories']),
      'state'
    );
    if (raw.schemaVersion !== undefined) {
      requireInteger(raw.schemaVersion, 1, SCHEMA_VERSION, 'schemaVersion');
    }
    if (raw.templateVersion !== undefined) requireString(raw.templateVersion, 100, 'templateVersion');

    const normalized = createDefaultState();
    normalized.progress = normalizeProgress(raw.progress);
    if (raw.settings !== undefined) {
      assertAllowedKeys(raw.settings, new Set(['nick']), 'settings');
      if (raw.settings.nick !== undefined) normalized.settings.nick = requireString(raw.settings.nick, MAX_NICK_LENGTH, 'settings.nick');
    }
    return normalized;
  }

  function cloneTaskState(taskState) {
    return {
      checked: taskState.checked,
      links: taskState.links.slice(),
      marks: { liked: taskState.marks.liked }
    };
  }

  function announce(message) {
    const status = document.getElementById('appStatus');
    if (status) status.textContent = message;
  }

  function preserveRecoveryCopy(raw) {
    if (!raw) return;
    pendingRecoveryRaw = raw;
    try {
      if (!localStorage.getItem(RECOVERY_KEY)) localStorage.setItem(RECOVERY_KEY, raw);
      pendingRecoveryRaw = '';
    } catch (_) {
      // Keep the raw value in memory; normal operation must continue.
    }
  }

  function loadState() {
    let raw = '';
    try {
      raw = localStorage.getItem(STORAGE_KEY) || '';
    } catch (_) {
      announce('Сохранение в браузере недоступно. Изменения останутся только до закрытия страницы.');
      return createDefaultState();
    }
    if (!raw) return createDefaultState();
    try {
      return normalizeState(JSON.parse(raw));
    } catch (_) {
      preserveRecoveryCopy(raw);
      announce('Сохранённые данные повреждены. Загружен пустой прогресс; исходная копия сохранена отдельно, если браузер это позволил.');
      return createDefaultState();
    }
  }

  function exportableState() {
    return {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      templateVersion: TEMPLATE_VERSION,
      progress: state.progress,
      settings: state.settings
    };
  }

  function persistNow() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = 0;
    }
    if (pendingRecoveryRaw) preserveRecoveryCopy(pendingRecoveryRaw);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(exportableState()));
      return true;
    } catch (_) {
      announce('Сохранение в браузере недоступно. Изменения останутся только до закрытия страницы.');
      return false;
    }
  }

  function queueSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persistNow, SAVE_DEBOUNCE_MS);
  }

  function defaultTaskState() {
    return { checked: false, links: [''], marks: { liked: false } };
  }

  function getTaskState(id) {
    return hasOwn(state.progress.tasks, id) ? state.progress.tasks[id] : defaultTaskState();
  }

  function ensureTaskState(id) {
    if (!hasOwn(state.progress.tasks, id)) state.progress.tasks[id] = defaultTaskState();
    return state.progress.tasks[id];
  }

  function parseHttpUrl(value) {
    const text = String(value || '').trim();
    if (!text || /\s/.test(text)) return null;
    try {
      const url = new URL(text);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      if (!url.hostname) return null;
      return url;
    } catch (_) {
      return null;
    }
  }

  function canonicalizeUrl(value) {
    const url = parseHttpUrl(value);
    if (!url) return '';
    url.hash = '';
    return url.href;
  }

  function isLikelyUrl(value) {
    return canonicalizeUrl(value) !== '';
  }

  function rebuildUrlIndex() {
    const occurrences = new Map();
    for (const category of template.categories) {
      for (const task of category.tasks) {
        const taskState = getTaskState(task.id);
        taskState.links.forEach((value, index) => {
          const canonical = canonicalizeUrl(value);
          if (!canonical) return;
          if (!occurrences.has(canonical)) occurrences.set(canonical, []);
          occurrences.get(canonical).push({ taskId: task.id, index, taskOrder: taskOrderById.get(task.id) });
        });
      }
    }
    urlOccurrences = occurrences;
  }

  function occurrenceKey(taskId, index) {
    return `${taskId}|${index}`;
  }

  function updateUrlIndexEntry(taskId, index, previousValue, nextValue) {
    const previousCanonical = canonicalizeUrl(previousValue);
    const nextCanonical = canonicalizeUrl(nextValue);
    const affectedKeys = new Set([occurrenceKey(taskId, index)]);
    if (previousCanonical === nextCanonical) return affectedKeys;

    if (previousCanonical) {
      const previousOccurrences = urlOccurrences.get(previousCanonical) || [];
      previousOccurrences.forEach(item => affectedKeys.add(occurrenceKey(item.taskId, item.index)));
      const remaining = previousOccurrences.filter(item => item.taskId !== taskId || item.index !== index);
      if (remaining.length) urlOccurrences.set(previousCanonical, remaining);
      else urlOccurrences.delete(previousCanonical);
    }

    if (nextCanonical) {
      const nextOccurrences = urlOccurrences.get(nextCanonical) || [];
      nextOccurrences.forEach(item => affectedKeys.add(occurrenceKey(item.taskId, item.index)));
      nextOccurrences.push({ taskId, index, taskOrder: taskOrderById.get(taskId) });
      urlOccurrences.set(nextCanonical, nextOccurrences);
    }
    return affectedKeys;
  }

  function getLinkValidity(taskId, index, value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return { bad: false, duplicate: false };
    const canonical = canonicalizeUrl(trimmed);
    if (!canonical) return { bad: true, duplicate: false };
    const occurrences = urlOccurrences.get(canonical) || [];
    return {
      bad: false,
      duplicate: occurrences.some(item => item.taskId !== taskId || item.index !== index)
    };
  }

  function computeLinkStats() {
    const perTask = new Map();
    let totalLinks = 0;
    let challengeLinks = 0;
    let completedChallenges = 0;

    for (const taskId of taskById.keys()) perTask.set(taskId, 0);
    for (const occurrences of urlOccurrences.values()) {
      if (!occurrences.length) continue;
      let first = occurrences[0];
      for (let index = 1; index < occurrences.length; index += 1) {
        const candidate = occurrences[index];
        if (candidate.taskOrder < first.taskOrder || (candidate.taskOrder === first.taskOrder && candidate.index < first.index)) {
          first = candidate;
        }
      }
      perTask.set(first.taskId, perTask.get(first.taskId) + 1);
      totalLinks += 1;
    }

    for (const category of template.categories) {
      if (String(category.name || '').trim().toLowerCase() !== CHALLENGE_CATEGORY_NAME.toLowerCase()) continue;
      for (const task of category.tasks) {
        const taskCount = perTask.get(task.id) || 0;
        challengeLinks += taskCount;
        completedChallenges += Math.floor(taskCount / CHALLENGE_COMPLETE_THRESHOLD);
      }
    }
    return { totalLinks, challengeLinks, completedChallenges, perTask };
  }

  function plainTaskText(value) {
    return String(value || '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\*\*/g, '');
  }

  function richTextTokens(value) {
    const source = String(value || '');
    const expression = /(\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
    const tokens = [];
    let cursor = 0;
    let match;
    while ((match = expression.exec(source)) !== null) {
      if (match.index > cursor) tokens.push({ type: 'text', value: source.slice(cursor, match.index) });
      if (match[2] !== undefined) tokens.push({ type: 'bold', value: match[2] });
      else tokens.push({ type: 'link', value: match[3], url: match[4], raw: match[0] });
      cursor = expression.lastIndex;
    }
    if (cursor < source.length) tokens.push({ type: 'text', value: source.slice(cursor) });
    return tokens;
  }

  function appendRichText(container, value, options = {}) {
    const { taskNumber = '' } = options;
    const addNonLink = node => container.appendChild(node);

    if (taskNumber !== '') {
      const number = document.createElement('span');
      number.className = 'task-num';
      number.textContent = `${taskNumber}.`;
      const fragment = document.createDocumentFragment();
      fragment.append(number, document.createTextNode(' '));
      addNonLink(fragment);
    }

    for (const token of richTextTokens(value)) {
      if (token.type === 'link') {
        const url = parseHttpUrl(token.url);
        if (!url) {
          addNonLink(document.createTextNode(token.raw));
          continue;
        }
        const anchor = document.createElement('a');
        anchor.href = url.href;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = token.value;
        if (token.value.trim().startsWith('#')) anchor.className = 'tag-link';
        container.appendChild(anchor);
        continue;
      }
      if (token.type === 'bold') {
        const strong = document.createElement('b');
        strong.textContent = token.value;
        addNonLink(strong);
      } else {
        addNonLink(document.createTextNode(token.value));
      }
    }
  }

  function safeDomId(prefix, id) {
    return `${prefix}-${String(id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  function buildCover() {
    const wrap = document.getElementById('coverImageWrap');
    const image = document.getElementById('coverImageImg');
    const url = parseHttpUrl(template.coverImage || '');
    if (!url) {
      wrap.hidden = true;
      return;
    }
    image.addEventListener('error', () => wrap.classList.add('cover-error'), { once: true });
    image.src = url.href;
    wrap.hidden = false;
  }

  function buildQuotas() {
    const list = document.getElementById('quotasList');
    const fragment = document.createDocumentFragment();
    for (const quota of template.quotas) {
      const card = document.createElement('div');
      card.className = 'quota';
      const label = document.createElement('label');
      label.className = 'label';
      const inputId = safeDomId('quota', quota.id);
      label.htmlFor = inputId;
      label.textContent = String(quota.label || '');

      const set = document.createElement('div');
      set.className = 'set';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = String(MAX_QUOTA_VALUE);
      input.placeholder = 'N';
      input.id = inputId;
      input.name = `quota-${quota.id}`;
      input.inputMode = 'numeric';
      input.dataset.quota = quota.id;
      const unit = document.createElement('span');
      unit.className = 'hint';
      unit.textContent = String(quota.unit || '');
      set.append(input, unit);
      card.append(label, set);
      fragment.appendChild(card);
      quotaInputById.set(quota.id, input);
    }
    if (!template.quotas.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'квоты не заданы';
      fragment.appendChild(empty);
    }
    list.replaceChildren(fragment);
  }

  function buildTaskCard(task, index) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.dataset.taskCard = task.id;
    const inner = document.createElement('div');
    inner.className = 'task-card-inner';

    const choice = document.createElement('div');
    choice.className = 'task-choice';
    const checkbox = document.createElement('input');
    const checkboxId = safeDomId('task', task.id);
    checkbox.type = 'checkbox';
    checkbox.id = checkboxId;
    checkbox.dataset.check = task.id;
    checkbox.setAttribute('aria-label', plainTaskText(task.text));
    const taskText = document.createElement('div');
    taskText.className = 'task-text';
    taskText.dataset.taskText = task.id;
    appendRichText(taskText, task.text, { taskNumber: index + 1 });
    choice.append(checkbox, taskText);

    const marks = document.createElement('div');
    marks.className = 'task-marks';
    const heart = document.createElement('button');
    heart.type = 'button';
    heart.className = 'mark-btn';
    heart.dataset.mark = `${task.id}|liked`;
    heart.title = 'Понравилось';
    heart.setAttribute('aria-label', 'Понравилось');
    heart.setAttribute('aria-pressed', 'false');
    heart.textContent = '♥';
    marks.appendChild(heart);

    inner.append(choice, marks);
    card.appendChild(inner);
    taskDomById.set(task.id, { card, inner, checkbox, heart });
    return card;
  }

  function buildCategories() {
    const view = document.getElementById('categoriesView');
    const fragment = document.createDocumentFragment();
    for (const category of template.categories) {
      const section = document.createElement('section');
      section.className = 'card category-card';
      section.dataset.category = category.id;
      const header = document.createElement('div');
      header.className = 'cat-header';
      const row = document.createElement('div');
      row.className = 'row cat-title-row';
      const bodyId = safeDomId('category-body', category.id);
      const headingId = safeDomId('category-heading', category.id);

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'cat-toggle';
      toggle.dataset.toggle = category.id;
      toggle.setAttribute('aria-controls', bodyId);
      const heading = document.createElement('h2');
      heading.id = headingId;
      heading.textContent = String(category.name || '');
      row.append(toggle, heading);
      const count = document.createElement('span');
      count.className = 'hint mono category-count';
      header.append(row, count);

      const body = document.createElement('div');
      body.className = 'cat-body';
      body.id = bodyId;
      if (category.desc && String(category.desc).trim()) {
        const description = document.createElement('div');
        description.className = 'cat-desc';
        appendRichText(description, category.desc);
        body.appendChild(description);
      }
      const grid = document.createElement('div');
      grid.className = 'task-grid';
      category.tasks.forEach((task, index) => grid.appendChild(buildTaskCard(task, index)));
      body.appendChild(grid);
      section.append(header, body);
      fragment.appendChild(section);
      categoryDomById.set(category.id, { section, toggle, body, count });
    }
    if (!template.categories.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'категории не заданы';
      fragment.appendChild(empty);
    }
    view.replaceChildren(fragment);
  }

  function createLinkField(taskId, index, value) {
    const field = document.createElement('div');
    field.className = 'link-field';
    field.dataset.linkField = `${taskId}|${index}`;
    const row = document.createElement('div');
    row.className = 'link-row';
    const number = document.createElement('span');
    number.className = 'link-num';
    number.textContent = `${index + 1}.`;
    const input = document.createElement('input');
    const inputId = safeDomId('link', `${taskId}-${index}`);
    input.id = inputId;
    input.type = 'url';
    input.inputMode = 'url';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'none');
    input.placeholder = 'ссылка на пост';
    input.value = value;
    input.dataset.link = `${taskId}|${index}`;
    input.dataset.committedValue = value;
    linkInputByKey.set(input.dataset.link, input);
    const label = document.createElement('label');
    label.className = 'visually-hidden';
    label.htmlFor = inputId;
    label.textContent = `${plainTaskText(taskById.get(taskId).text)}, ${index + 1}`;
    row.append(number, label, input);
    field.appendChild(row);
    return field;
  }

  function renderTaskLinks(taskId) {
    const taskDom = taskDomById.get(taskId);
    const existing = taskDom.inner.querySelector('.links');
    if (existing) {
      existing.querySelectorAll('[data-link]').forEach(input => linkInputByKey.delete(input.dataset.link));
      existing.remove();
    }
    const taskState = getTaskState(taskId);
    if (!taskState.checked) return;
    const links = document.createElement('div');
    links.className = 'links';
    taskState.links.forEach((value, index) => links.appendChild(createLinkField(taskId, index, value)));
    taskDom.inner.appendChild(links);
  }

  function refreshLinkValidation(input) {
    const [taskId, indexText] = input.dataset.link.split('|');
    const index = Number(indexText);
    const validity = getLinkValidity(taskId, index, input.value);
    const field = input.closest('.link-field');
    field.querySelectorAll('.link-warn').forEach(warning => warning.remove());
    input.classList.toggle('link-bad', validity.bad || validity.duplicate);
    input.setAttribute('aria-invalid', String(validity.bad || validity.duplicate));
    input.removeAttribute('aria-describedby');
    if (!validity.bad && !validity.duplicate) return;

    const warning = document.createElement('span');
    warning.className = 'link-warn';
    warning.id = safeDomId('link-warning', `${taskId}-${index}`);
    warning.textContent = validity.bad
      ? '⚠ это не похоже на ссылку'
      : '⚠ такая ссылка уже есть в чек-листе';
    field.appendChild(warning);
    input.setAttribute('aria-describedby', warning.id);
  }

  function refreshAllLinkValidation() {
    document.querySelectorAll('[data-link]').forEach(refreshLinkValidation);
  }

  function renderTaskState(taskId, includeLinks = true) {
    const taskState = getTaskState(taskId);
    const taskDom = taskDomById.get(taskId);
    taskDom.checkbox.checked = taskState.checked;
    taskDom.card.classList.toggle('done', taskState.checked);
    taskDom.heart.classList.toggle('on', taskState.marks.liked);
    taskDom.heart.setAttribute('aria-pressed', String(taskState.marks.liked));
    if (includeLinks) renderTaskLinks(taskId);
  }

  function countChecked() {
    let done = 0;
    for (const taskId of taskById.keys()) {
      if (getTaskState(taskId).checked) done += 1;
    }
    return done;
  }

  function renderProgress() {
    const done = countChecked();
    const total = taskById.size;
    const percentage = total ? Math.round(done / total * 100) : 0;
    document.getElementById('progressLabel').textContent = `${done} / ${total}`;
    const bar = document.getElementById('progressBar');
    bar.max = total;
    bar.value = done;
    bar.setAttribute('aria-valuetext', `${done} / ${total}`);
    document.getElementById('progressPct').textContent = `${percentage}%`;
  }

  function renderCategoryCount(categoryId) {
    const category = categoryById.get(categoryId);
    const done = category.tasks.reduce((sum, task) => sum + (getTaskState(task.id).checked ? 1 : 0), 0);
    categoryDomById.get(categoryId).count.textContent = `${done} / ${category.tasks.length}`;
  }

  function renderLocalStats(stats = computeLinkStats()) {
    const list = document.getElementById('statsList');
    const wrapper = document.createElement('div');
    wrapper.className = 'stats-values';
    const line = document.createElement('div');
    const parts = [
      ['Всего выполнено: ', stats.totalLinks, ' | '],
      [' Из них в «Челленджах»: ', stats.challengeLinks, ' | '],
      [' Выполнено челленджей: ', stats.completedChallenges, '']
    ];
    for (const [label, value, separator] of parts) {
      const strong = document.createElement('b');
      strong.append(document.createTextNode(label));
      const number = document.createElement('span');
      number.className = 'mono';
      number.textContent = String(value);
      strong.append(number, document.createTextNode(separator));
      line.appendChild(strong);
    }
    wrapper.appendChild(line);
    list.replaceChildren(wrapper);
  }

  function setCategoryCollapsed(categoryId, collapsed) {
    state.progress.collapsed[categoryId] = collapsed;
    const dom = categoryDomById.get(categoryId);
    const category = categoryById.get(categoryId);
    dom.section.classList.toggle('collapsed', collapsed);
    dom.body.hidden = collapsed;
    dom.toggle.textContent = collapsed ? '▸' : '▾';
    dom.toggle.setAttribute('aria-expanded', String(!collapsed));
    dom.toggle.setAttribute('aria-label', `${category.name}: ${collapsed ? 'развернуть' : 'свернуть'}`);
  }

  function renderFinalStatus() {
    if (sendingFinal) return;
    const status = document.getElementById('finalSendStatus');
    status.textContent = state.progress.finalSent
      ? `✓ последняя отправка: ${new Date(state.progress.finalSent.ts).toLocaleString('ru-RU')}, строк: ${state.progress.finalSent.rows}`
      : '';
  }

  function renderAllMutable() {
    document.getElementById('nickInput').value = state.settings.nick;
    for (const [id, input] of quotaInputById) input.value = state.progress.quotaTargets[id] || '';
    for (const categoryId of categoryById.keys()) setCategoryCollapsed(categoryId, state.progress.collapsed[categoryId] === true);
    for (const taskId of taskById.keys()) renderTaskState(taskId);
    rebuildUrlIndex();
    refreshAllLinkValidation();
    for (const categoryId of categoryById.keys()) renderCategoryCount(categoryId);
    renderLocalStats();
    renderProgress();
    renderFinalStatus();
  }

  function celebrate(message, emojis, count) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let layer = document.getElementById('celebrateLayer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'celebrateLayer';
      document.body.appendChild(layer);
    }
    layer.replaceChildren();
    const messageElement = document.createElement('div');
    messageElement.className = `celebrate-msg${reduceMotion ? ' celebrate-msg-reduced' : ''}`;
    messageElement.setAttribute('role', 'status');
    messageElement.textContent = message;
    layer.appendChild(messageElement);
    window.setTimeout(() => messageElement.remove(), 2700);
    if (reduceMotion) return;

    for (let index = 0; index < count; index += 1) {
      const particle = document.createElement('span');
      particle.className = 'celebrate-particle';
      particle.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      particle.style.left = `${Math.random() * 100}vw`;
      const duration = 1.6 + Math.random() * 1.2;
      const delay = Math.random() * 0.6;
      particle.style.animationDuration = `${duration}s`;
      particle.style.animationDelay = `${delay}s`;
      layer.appendChild(particle);
      window.setTimeout(() => particle.remove(), (duration + delay + 0.3) * 1000);
    }
  }

  function checkMilestones(taskId, stats) {
    const taskCount = stats.perTask.get(taskId) || 0;
    const taskThreshold = Math.floor(taskCount / CHALLENGE_COMPLETE_THRESHOLD) * CHALLENGE_COMPLETE_THRESHOLD;
    const previousTaskThreshold = state.progress.milestones.tasks[taskId] || 0;
    let changed = false;
    if (taskThreshold > previousTaskThreshold) {
      state.progress.milestones.tasks[taskId] = taskThreshold;
      const task = taskById.get(taskId);
      celebrate(`«${plainTaskText(task.text)}» — ${taskThreshold} ссылок в одном задании! 🎆`, ['💖', '✨', '🍁', '🍩'], 28);
      changed = true;
    }

    const globalThreshold = Math.floor(stats.totalLinks / CHALLENGE_COMPLETE_THRESHOLD) * CHALLENGE_COMPLETE_THRESHOLD;
    if (globalThreshold > state.progress.milestones.global) {
      state.progress.milestones.global = globalThreshold;
      celebrate(`Респект! Уже ${globalThreshold} 🍬`, ['🍬', '🍭', '🍰'], 16);
      changed = true;
    }
    return changed;
  }

  function createSubmissionId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function isConfiguredFinalEndpoint() {
    const url = parseHttpUrl(FINAL_STATS_URL);
    return FINAL_STATS_ENABLED && url && url.protocol === 'https:' && url.hostname === 'script.google.com' && url.pathname.endsWith('/exec');
  }

  async function sendFinalStats() {
    if (sendingFinal || !isConfiguredFinalEndpoint()) return;
    if (state.progress.finalSent) {
      const previous = new Date(state.progress.finalSent.ts).toLocaleString('ru-RU');
      if (!confirm(`Итоги уже отправлялись ${previous} (строк: ${state.progress.finalSent.rows}). Отправить ещё раз?`)) return;
      delete state.progress.finalPending;
    }

    const stats = computeLinkStats();
    if (!stats.totalLinks) {
      alert('Пока нет ни одной введённой ссылки — отправлять нечего.');
      return;
    }

    sendingFinal = true;
    const status = document.getElementById('finalSendStatus');
    const button = document.getElementById('sendFinalBtn');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    status.textContent = 'отправляю…';

    const pending = state.progress.finalPending || {
      submissionId: createSubmissionId(),
      createdAt: new Date().toISOString()
    };
    state.progress.finalPending = pending;
    persistNow();
    const payload = {
      schemaVersion: 1,
      type: 'final',
      submissionId: pending.submissionId,
      templateVersion: TEMPLATE_VERSION,
      sourceOrigin: location.origin,
      nick: state.settings.nick || 'аноним',
      checkedCount: countChecked()
    };
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), FINAL_TIMEOUT_MS);

    try {
      const response = await fetch(FINAL_STATS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: controller.signal
      });
      const data = await response.json();
      if (data && data.ok) {
        const sentAt = new Date().toISOString();
        state.progress.finalSent = { ts: sentAt, rows: 1, submissionId: pending.submissionId };
        delete state.progress.finalPending;
        persistNow();
        status.textContent = `✓ отправлено: 1 строк, ${new Date(sentAt).toLocaleString('ru-RU')}`;
      } else {
        status.textContent = `✗ сервер отклонил запрос${data && data.reason ? ` (${data.reason})` : ''}`;
      }
    } catch (_) {
      status.textContent = '✗ не удалось отправить — нет связи или таблица ещё не готова. Можно попробовать ещё раз позже.';
    } finally {
      clearTimeout(timeout);
      sendingFinal = false;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }

  function download(filename, object) {
    const blob = new Blob([JSON.stringify(object, null, 2)], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  async function importBackup(fileInput) {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('File too large');
      const text = await file.text();
      if (new Blob([text]).size > MAX_IMPORT_BYTES) throw new Error('File too large');
      const imported = normalizeState(JSON.parse(text));
      state = imported;
      persistNow();
      renderAllMutable();
    } catch (_) {
      alert('Не удалось прочитать сохраненный файл');
    } finally {
      fileInput.value = '';
    }
  }

  function appendTrailingLinkField(taskId) {
    const taskState = ensureTaskState(taskId);
    const links = taskDomById.get(taskId).inner.querySelector('.links');
    const index = taskState.links.length - 1;
    links.appendChild(createLinkField(taskId, index, taskState.links[index]));
  }

  function parseDataPair(value) {
    const separator = value.lastIndexOf('|');
    return [value.slice(0, separator), Number(value.slice(separator + 1))];
  }

  function bindEvents() {
    document.getElementById('nickInput').addEventListener('input', event => {
      state.settings.nick = event.target.value;
      queueSave();
    });

    document.getElementById('quotasList').addEventListener('input', event => {
      const id = event.target.dataset.quota;
      if (!id) return;
      state.progress.quotaTargets[id] = event.target.value;
      queueSave();
    });

    const categoriesView = document.getElementById('categoriesView');
    categoriesView.addEventListener('change', event => {
      const id = event.target.dataset.check;
      if (!id) return;
      const taskState = ensureTaskState(id);
      taskState.checked = event.target.checked;
      renderTaskState(id);
      renderCategoryCount(taskCategoryById.get(id));
      renderProgress();
      persistNow();
    });

    categoriesView.addEventListener('input', event => {
      if (!event.target.dataset.link) return;
      const [taskId, index] = parseDataPair(event.target.dataset.link);
      const taskState = ensureTaskState(taskId);
      taskState.links[index] = event.target.value;
      event.target.classList.remove('link-bad');
      event.target.setAttribute('aria-invalid', 'false');
      event.target.removeAttribute('aria-describedby');
      event.target.closest('.link-field').querySelectorAll('.link-warn').forEach(warning => warning.remove());
      if (index === taskState.links.length - 1 && event.target.value.trim() !== '') {
        taskState.links.push('');
        appendTrailingLinkField(taskId);
      }
      queueSave();
    });

    categoriesView.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target.dataset.link) {
        event.preventDefault();
        event.target.blur();
      }
    });

    categoriesView.addEventListener('focusout', event => {
      if (!event.target.dataset.link) return;
      const [taskId, index] = parseDataPair(event.target.dataset.link);
      const affectedKeys = updateUrlIndexEntry(taskId, index, event.target.dataset.committedValue || '', event.target.value);
      event.target.dataset.committedValue = event.target.value;
      affectedKeys.forEach(key => {
        const input = linkInputByKey.get(key);
        if (input && input.isConnected) refreshLinkValidation(input);
      });
      const stats = computeLinkStats();
      renderLocalStats(stats);
      checkMilestones(taskId, stats);
      persistNow();
    });

    categoriesView.addEventListener('click', event => {
      const taskText = event.target.closest('[data-task-text]');
      if (taskText && !event.target.closest('a')) {
        taskDomById.get(taskText.dataset.taskText).checkbox.click();
        return;
      }
      const toggle = event.target.closest('[data-toggle]');
      if (toggle) {
        const id = toggle.dataset.toggle;
        setCategoryCollapsed(id, !(state.progress.collapsed[id] === true));
        persistNow();
        return;
      }
      const mark = event.target.closest('[data-mark]');
      if (mark) {
        const [taskId, key] = mark.dataset.mark.split('|');
        const taskState = ensureTaskState(taskId);
        taskState.marks[key] = !taskState.marks[key];
        mark.classList.toggle('on', taskState.marks[key]);
        mark.setAttribute('aria-pressed', String(taskState.marks[key]));
        persistNow();
      }
    });

    document.getElementById('collapseAllBtn').addEventListener('click', () => {
      for (const categoryId of categoryById.keys()) setCategoryCollapsed(categoryId, true);
      persistNow();
    });
    document.getElementById('expandAllBtn').addEventListener('click', () => {
      for (const categoryId of categoryById.keys()) setCategoryCollapsed(categoryId, false);
      persistNow();
    });
    document.getElementById('exportFull').addEventListener('click', () => {
      persistNow();
      download('marathon-progress.json', exportableState());
    });
    document.getElementById('importFullBtn').addEventListener('click', () => document.getElementById('fileInputFull').click());
    document.getElementById('fileInputFull').addEventListener('change', event => importBackup(event.target));
    document.getElementById('resetAllBtn').addEventListener('click', () => {
      if (!confirm('Точно стереть весь ваш прогресс — все галочки, ссылки и цели на сезон? Список заданий останется, отменить сброс нельзя.')) return;
      state.progress = createDefaultProgress();
      persistNow();
      renderAllMutable();
    });
    document.getElementById('sendFinalBtn').addEventListener('click', sendFinalStats);

    window.addEventListener('pagehide', persistNow);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && saveTimer) persistNow();
    });
  }

  function configureFooterClearance() {
    const footer = document.querySelector('footer.progress');
    const update = () => document.documentElement.style.setProperty('--progress-footer-height', `${Math.ceil(footer.getBoundingClientRect().height)}px`);
    update();
    if ('ResizeObserver' in window) new ResizeObserver(update).observe(footer);
    else window.addEventListener('resize', update, { passive: true });
  }

  function initialize() {
    validateTrustedTemplate();
    state = loadState();
    document.getElementById('marathonTitle').textContent = `🦊 ${template.title || 'Марафон ЖЖ'}`;
    document.getElementById('nickInput').maxLength = MAX_NICK_LENGTH;
    buildCover();
    buildQuotas();
    buildCategories();

    const finalWrapper = document.getElementById('finalSendWrap');
    finalWrapper.hidden = !isConfiguredFinalEndpoint();
    bindEvents();
    renderAllMutable();
    configureFooterClearance();
  }

  initialize();
})();
