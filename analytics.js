'use strict';

(() => {
  const ANALYTICS_VERSION = '2.1.0';
  const ANALYTICS_SCHEMA_VERSION = 2;
  const ANALYTICS_STATE_KEY = 'ljMarathonAnalytics_v2';
  const APP_STATE_KEY = 'ljMarathonState_v1';
  const MAX_ANALYTICS_STATE_DAYS = 730;
  const MAX_PENDING_BYTES = 512 * 1024;
  const FINAL_TIMEOUT_MS = 15000;
  const LEGACY_SHARED_TASK_ID = 'tsgby0gy';
  const SPLIT_TASK_ID = 'tch0tarj';

  const configBlock = document.getElementById('appConfig');
  const templateBlock = document.getElementById('templateData');
  const finalButton = document.getElementById('sendFinalBtn');
  const finalStatus = document.getElementById('finalSendStatus');
  if (!configBlock || !templateBlock || !finalButton || !finalStatus) return;

  const config = safeParseJson(configBlock.textContent, {});
  const template = safeParseJson(templateBlock.textContent, { quotas: [], categories: [] });
  const templateVersion = String(config.templateVersion || '');
  const challengeCategoryName = String(config.challengeCategoryName || '');
  const challengeThreshold = positiveInteger(config.challengeCompleteThreshold, 10);
  const finalStatsUrl = String(config.finalStatsUrl || '').trim();
  const finalStatsEnabled = config.finalStatsEnabled === true;

  const templateTaskOrder = new Map();
  const categoryById = new Map();
  const quotaIds = new Set();
  let taskOrder = 0;

  for (const quota of Array.isArray(template.quotas) ? template.quotas : []) {
    if (quota && typeof quota.id === 'string') quotaIds.add(quota.id);
  }
  for (const category of Array.isArray(template.categories) ? template.categories : []) {
    if (!category || typeof category.id !== 'string') continue;
    categoryById.set(category.id, category);
    for (const task of Array.isArray(category.tasks) ? category.tasks : []) {
      if (!task || typeof task.id !== 'string') continue;
      templateTaskOrder.set(task.id, taskOrder++);
    }
  }

  let analyticsState = loadAnalyticsState();
  let activeStartedAt = document.visibilityState === 'visible' ? performance.now() : null;
  let sending = false;
  beginSession();
  bindEngagementTracking();
  renderAnalyticsStatus();

  function safeParseJson(value, fallback) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function positiveInteger(value, fallback) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : fallback;
  }

  function boundedInteger(value, min, max, fallback) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback;
  }

  function nowIso() { return new Date().toISOString(); }
  function dayKey(date = new Date()) { return date.toISOString().slice(0, 10); }
  function validDate(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
  function round2(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }

  function createUuid() {
    if (globalThis.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function emptyDaily(day) {
    return {
      day,
      activeSeconds: 0,
      sessions: 0,
      taskToggles: 0,
      favoriteToggles: 0,
      categoryToggles: 0,
      linkCommits: 0,
      exports: 0,
      importAttempts: 0,
      importSuccesses: 0,
      resets: 0
    };
  }

  function freshAnalyticsState() {
    const timestamp = nowIso();
    return {
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      participantId: createUuid(),
      firstOpenedAt: timestamp,
      lastActiveAt: timestamp,
      sessionCount: 0,
      totalActiveSeconds: 0,
      counters: {
        exportCount: 0,
        importAttemptCount: 0,
        importSuccessCount: 0,
        resetCount: 0,
        taskToggleCount: 0,
        favoriteToggleCount: 0,
        categoryToggleCount: 0,
        collapseAllCount: 0,
        expandAllCount: 0,
        linkCommitCount: 0
      },
      milestones: {
        firstTaskCompletedAt: null,
        firstPostLinkedAt: null,
        firstChallengeCompletedAt: null,
        halfwayReachedAt: null,
        lastTaskCompletedAt: null
      },
      daily: {},
      pending: null,
      lastSent: null
    };
  }

  function normalizeDaily(raw) {
    const output = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return output;
    const days = Object.keys(raw).filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day)).sort().slice(-MAX_ANALYTICS_STATE_DAYS);
    for (const day of days) {
      const row = raw[day] && typeof raw[day] === 'object' ? raw[day] : {};
      output[day] = {
        day,
        activeSeconds: boundedInteger(row.activeSeconds, 0, 86400, 0),
        sessions: boundedInteger(row.sessions, 0, 10000, 0),
        taskToggles: boundedInteger(row.taskToggles, 0, 100000, 0),
        favoriteToggles: boundedInteger(row.favoriteToggles, 0, 100000, 0),
        categoryToggles: boundedInteger(row.categoryToggles, 0, 100000, 0),
        linkCommits: boundedInteger(row.linkCommits, 0, 100000, 0),
        exports: boundedInteger(row.exports, 0, 10000, 0),
        importAttempts: boundedInteger(row.importAttempts, 0, 10000, 0),
        importSuccesses: boundedInteger(row.importSuccesses, 0, 10000, 0),
        resets: boundedInteger(row.resets, 0, 10000, 0)
      };
    }
    return output;
  }

  function normalizeAnalyticsState(raw) {
    const normalized = freshAnalyticsState();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return normalized;
    if (typeof raw.participantId === 'string' && /^[0-9a-f-]{36}$/i.test(raw.participantId)) normalized.participantId = raw.participantId;
    if (validDate(raw.firstOpenedAt)) normalized.firstOpenedAt = raw.firstOpenedAt;
    if (validDate(raw.lastActiveAt)) normalized.lastActiveAt = raw.lastActiveAt;
    normalized.sessionCount = boundedInteger(raw.sessionCount, 0, 1000000, 0);
    normalized.totalActiveSeconds = boundedInteger(raw.totalActiveSeconds, 0, 315360000, 0);
    for (const key of Object.keys(normalized.counters)) normalized.counters[key] = boundedInteger(raw.counters && raw.counters[key], 0, 1000000, 0);
    for (const key of Object.keys(normalized.milestones)) normalized.milestones[key] = validDate(raw.milestones && raw.milestones[key]) ? raw.milestones[key] : null;
    normalized.daily = normalizeDaily(raw.daily);
    if (raw.lastSent && typeof raw.lastSent === 'object' && validDate(raw.lastSent.sentAt) && typeof raw.lastSent.submissionId === 'string') {
      normalized.lastSent = { submissionId: raw.lastSent.submissionId, sentAt: raw.lastSent.sentAt, sinks: raw.lastSent.sinks && typeof raw.lastSent.sinks === 'object' ? raw.lastSent.sinks : null };
    }
    if (raw.pending && typeof raw.pending === 'object' && typeof raw.pending.submissionId === 'string' && raw.pending.payload && typeof raw.pending.payload === 'object') {
      try {
        if (new Blob([JSON.stringify(raw.pending.payload)]).size <= MAX_PENDING_BYTES) {
          normalized.pending = { submissionId: raw.pending.submissionId, createdAt: validDate(raw.pending.createdAt) ? raw.pending.createdAt : nowIso(), payload: raw.pending.payload };
        }
      } catch (_) { normalized.pending = null; }
    }
    return normalized;
  }

  function loadAnalyticsState() {
    try { return normalizeAnalyticsState(safeParseJson(localStorage.getItem(ANALYTICS_STATE_KEY) || '', null)); }
    catch (_) { return freshAnalyticsState(); }
  }

  function ensureToday() {
    const day = dayKey();
    if (!analyticsState.daily[day]) analyticsState.daily[day] = emptyDaily(day);
    const days = Object.keys(analyticsState.daily).sort();
    while (days.length > MAX_ANALYTICS_STATE_DAYS) delete analyticsState.daily[days.shift()];
    return analyticsState.daily[day];
  }

  function saveAnalyticsState() {
    analyticsState.lastActiveAt = nowIso();
    ensureToday();
    try { localStorage.setItem(ANALYTICS_STATE_KEY, JSON.stringify(analyticsState)); }
    catch (_) { /* Analytics must never break the checklist. */ }
  }

  function increment(counter, dailyCounter) {
    analyticsState.counters[counter] += 1;
    ensureToday()[dailyCounter] += 1;
    saveAnalyticsState();
  }

  function beginSession() {
    analyticsState.sessionCount += 1;
    ensureToday().sessions += 1;
    saveAnalyticsState();
  }

  function flushActiveTime() {
    if (activeStartedAt === null) return;
    const elapsed = Math.max(0, Math.round((performance.now() - activeStartedAt) / 1000));
    analyticsState.totalActiveSeconds = Math.min(315360000, analyticsState.totalActiveSeconds + elapsed);
    const today = ensureToday();
    today.activeSeconds = Math.min(86400, today.activeSeconds + elapsed);
    activeStartedAt = document.visibilityState === 'visible' ? performance.now() : null;
    saveAnalyticsState();
  }

  function loadAppState() {
    let raw = null;
    try { raw = safeParseJson(localStorage.getItem(APP_STATE_KEY) || '', null); } catch (_) { raw = null; }
    const progress = raw && raw.progress && typeof raw.progress === 'object' ? raw.progress : {};
    const tasks = progress.tasks && typeof progress.tasks === 'object' ? { ...progress.tasks } : {};
    if (tasks[LEGACY_SHARED_TASK_ID] && !tasks[SPLIT_TASK_ID]) tasks[SPLIT_TASK_ID] = JSON.parse(JSON.stringify(tasks[LEGACY_SHARED_TASK_ID]));
    return {
      settings: raw && raw.settings && typeof raw.settings === 'object' ? raw.settings : {},
      progress: {
        quotaTargets: progress.quotaTargets && typeof progress.quotaTargets === 'object' ? progress.quotaTargets : {},
        tasks,
        collapsed: progress.collapsed && typeof progress.collapsed === 'object' ? progress.collapsed : {}
      }
    };
  }

  function parseHttpUrl(value) {
    const text = String(value || '').trim();
    if (!text || /\s/.test(text)) return null;
    try {
      const url = new URL(text);
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname ? url : null;
    } catch (_) { return null; }
  }

  function canonicalizeUrl(value) {
    const url = parseHttpUrl(value);
    if (!url) return '';
    url.hash = '';
    return url.href;
  }

  function cssEscape(value) {
    if (globalThis.CSS && typeof CSS.escape === 'function') return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function domTaskState(taskId, stored) {
    const card = document.querySelector(`[data-task-card="${cssEscape(taskId)}"]`);
    const checkbox = card && card.querySelector(`[data-check="${cssEscape(taskId)}"]`);
    const heart = card && card.querySelector(`[data-mark="${cssEscape(taskId)}|liked"]`);
    return {
      checked: checkbox ? checkbox.checked : stored && stored.checked === true,
      favorite: heart ? heart.getAttribute('aria-pressed') === 'true' : !!(stored && stored.marks && stored.marks.liked)
    };
  }

  function getCurrentLinks(taskId, stored) {
    const card = document.querySelector(`[data-task-card="${cssEscape(taskId)}"]`);
    if (card) {
      const inputs = Array.from(card.querySelectorAll('[data-link]'));
      if (inputs.length) return inputs.map(input => String(input.value || ''));
    }
    return stored && Array.isArray(stored.links) ? stored.links.map(value => String(value || '')) : [''];
  }

  function currentQuotaTarget(quotaId, appState) {
    const input = document.getElementById(`quota-${String(quotaId).replace(/[^a-zA-Z0-9_-]/g, '-')}`);
    const raw = input ? input.value : appState.progress.quotaTargets[quotaId];
    if (raw === '' || raw === null || raw === undefined) return null;
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  function clientContext() {
    const width = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const viewportBucket = width <= 480 ? 'xs<=480' : width <= 768 ? 'sm481-768' : width <= 1024 ? 'md769-1024' : width <= 1440 ? 'lg1025-1440' : 'xl>1440';
    const coarsePointer = matchMedia('(pointer: coarse)').matches;
    const finePointer = matchMedia('(pointer: fine)').matches;
    return {
      viewportBucket,
      inputMode: coarsePointer && finePointer ? 'mixed' : coarsePointer ? 'touch' : finePointer ? 'pointer' : 'unknown',
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      colorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      language: String(navigator.language || '').slice(0, 20)
    };
  }

  function buildAnalyticsPayload(submissionId) {
    flushActiveTime();
    const appState = loadAppState();
    const taskStats = [];
    const categoryStatsMap = new Map();
    const occurrences = new Map();
    let taskIndex = 0;

    for (const category of Array.isArray(template.categories) ? template.categories : []) {
      if (!category || typeof category.id !== 'string') continue;
      const categoryStat = { categoryId: category.id, taskCount: 0, checkedCount: 0, favoriteCount: 0, enteredLinkCount: 0, validLinkCount: 0, uniqueValidLinkCount: 0, duplicateLinkCount: 0, invalidLinkCount: 0, completedChallenges: 0 };
      categoryStatsMap.set(category.id, categoryStat);

      for (const task of Array.isArray(category.tasks) ? category.tasks : []) {
        if (!task || typeof task.id !== 'string') continue;
        const stored = appState.progress.tasks[task.id] || {};
        const dom = domTaskState(task.id, stored);
        const links = getCurrentLinks(task.id, stored);
        const stat = { taskId: task.id, categoryId: category.id, checked: dom.checked, favorite: dom.favorite, enteredLinkCount: 0, validLinkCount: 0, uniqueValidLinkCount: 0, duplicateLinkCount: 0, invalidLinkCount: 0, completedChallenges: 0 };
        categoryStat.taskCount += 1;
        if (stat.checked) categoryStat.checkedCount += 1;
        if (stat.favorite) categoryStat.favoriteCount += 1;

        links.forEach((value, index) => {
          const trimmed = String(value || '').trim();
          if (!trimmed) return;
          stat.enteredLinkCount += 1;
          categoryStat.enteredLinkCount += 1;
          const canonical = canonicalizeUrl(trimmed);
          if (!canonical) {
            stat.invalidLinkCount += 1;
            categoryStat.invalidLinkCount += 1;
            return;
          }
          stat.validLinkCount += 1;
          categoryStat.validLinkCount += 1;
          if (!occurrences.has(canonical)) occurrences.set(canonical, []);
          occurrences.get(canonical).push({ taskId: task.id, categoryId: category.id, linkIndex: index, taskOrder: templateTaskOrder.get(task.id) ?? taskIndex });
        });
        taskStats.push(stat);
        taskIndex += 1;
      }
    }

    const taskStatById = new Map(taskStats.map(stat => [stat.taskId, stat]));
    for (const entries of occurrences.values()) {
      entries.sort((a, b) => a.taskOrder - b.taskOrder || a.linkIndex - b.linkIndex);
      const first = entries[0];
      taskStatById.get(first.taskId).uniqueValidLinkCount += 1;
      categoryStatsMap.get(first.categoryId).uniqueValidLinkCount += 1;
      for (let index = 1; index < entries.length; index += 1) {
        const duplicate = entries[index];
        taskStatById.get(duplicate.taskId).duplicateLinkCount += 1;
        categoryStatsMap.get(duplicate.categoryId).duplicateLinkCount += 1;
      }
    }

    let challengeLinks = 0;
    let completedChallenges = 0;
    for (const stat of taskStats) {
      const category = categoryById.get(stat.categoryId);
      if (String(category && category.name || '').trim().toLowerCase() === challengeCategoryName.trim().toLowerCase()) {
        challengeLinks += stat.uniqueValidLinkCount;
        stat.completedChallenges = Math.floor(stat.uniqueValidLinkCount / challengeThreshold);
        completedChallenges += stat.completedChallenges;
        categoryStatsMap.get(stat.categoryId).completedChallenges += stat.completedChallenges;
      }
    }

    const categoryStats = Array.from(categoryStatsMap.values()).map(stat => ({ ...stat, completionPercent: stat.taskCount ? round2(stat.checkedCount / stat.taskCount * 100) : 0 }));
    const checkedCount = taskStats.reduce((sum, stat) => sum + (stat.checked ? 1 : 0), 0);
    const favoriteCount = taskStats.reduce((sum, stat) => sum + (stat.favorite ? 1 : 0), 0);
    const totalEnteredLinks = taskStats.reduce((sum, stat) => sum + stat.enteredLinkCount, 0);
    const validLinks = taskStats.reduce((sum, stat) => sum + stat.validLinkCount, 0);
    const uniqueValidLinks = taskStats.reduce((sum, stat) => sum + stat.uniqueValidLinkCount, 0);
    const duplicateLinks = taskStats.reduce((sum, stat) => sum + stat.duplicateLinkCount, 0);
    const invalidLinks = taskStats.reduce((sum, stat) => sum + stat.invalidLinkCount, 0);
    const totalTasks = taskStats.length;
    const dailyStats = Object.values(analyticsState.daily).sort((a, b) => a.day.localeCompare(b.day));
    const activeDays = dailyStats.filter(row => row.activeSeconds > 0 || row.sessions > 0 || row.taskToggles > 0 || row.linkCommits > 0).length;

    const payload = {
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      type: 'final_analytics',
      submissionId,
      participantId: analyticsState.participantId,
      templateVersion,
      sourceOrigin: location.origin,
      generatedAt: nowIso(),
      analyticsVersion: ANALYTICS_VERSION,
      nick: String(document.getElementById('nickInput')?.value || appState.settings.nick || 'аноним').slice(0, 512),
      clientContext: clientContext(),
      overall: {
        totalTasks,
        checkedCount,
        completionPercent: totalTasks ? round2(checkedCount / totalTasks * 100) : 0,
        totalCategories: categoryStats.length,
        categoriesStarted: categoryStats.filter(stat => stat.checkedCount || stat.enteredLinkCount || stat.favoriteCount).length,
        completedCategories: categoryStats.filter(stat => stat.taskCount > 0 && stat.checkedCount === stat.taskCount).length,
        totalEnteredLinks,
        validLinks,
        uniqueValidLinks,
        duplicateLinks,
        invalidLinks,
        favoriteCount,
        challengeLinks,
        completedChallenges,
        tasksWithLinks: taskStats.filter(stat => stat.enteredLinkCount > 0).length,
        tasksWithMultipleLinks: taskStats.filter(stat => stat.enteredLinkCount > 1).length,
        maxLinksOnSingleTask: taskStats.reduce((max, stat) => Math.max(max, stat.enteredLinkCount), 0)
      },
      engagement: {
        firstOpenedAt: analyticsState.firstOpenedAt,
        lastActiveAt: analyticsState.lastActiveAt,
        activeDays,
        sessionCount: analyticsState.sessionCount,
        totalActiveSeconds: analyticsState.totalActiveSeconds,
        ...analyticsState.counters,
        ...analyticsState.milestones
      },
      categoryStats,
      taskStats,
      quotaStats: Array.from(quotaIds, quotaId => ({ quotaId, target: currentQuotaTarget(quotaId, appState) })),
      dailyStats
    };

    validateClientPayload(payload);
    return payload;
  }

  function validateClientPayload(payload) {
    if (payload.overall.totalTasks !== payload.taskStats.length) throw new Error('analytics_task_count_mismatch');
    const checked = payload.taskStats.reduce((sum, row) => sum + (row.checked ? 1 : 0), 0);
    const favorites = payload.taskStats.reduce((sum, row) => sum + (row.favorite ? 1 : 0), 0);
    const entered = payload.taskStats.reduce((sum, row) => sum + row.enteredLinkCount, 0);
    const valid = payload.taskStats.reduce((sum, row) => sum + row.validLinkCount, 0);
    const unique = payload.taskStats.reduce((sum, row) => sum + row.uniqueValidLinkCount, 0);
    const duplicates = payload.taskStats.reduce((sum, row) => sum + row.duplicateLinkCount, 0);
    const invalid = payload.taskStats.reduce((sum, row) => sum + row.invalidLinkCount, 0);
    if (payload.overall.checkedCount !== checked || payload.overall.favoriteCount !== favorites || payload.overall.totalEnteredLinks !== entered || payload.overall.validLinks !== valid || payload.overall.uniqueValidLinks !== unique || payload.overall.duplicateLinks !== duplicates || payload.overall.invalidLinks !== invalid) throw new Error('analytics_aggregate_mismatch');
    if (valid - unique !== duplicates || entered !== valid + invalid) throw new Error('analytics_link_invariant');
    if (new Blob([JSON.stringify(payload)]).size > MAX_PENDING_BYTES) throw new Error('analytics_payload_too_large');
  }

  function isConfiguredEndpoint() {
    if (!finalStatsEnabled) return false;
    const url = parseHttpUrl(finalStatsUrl);
    return !!url && url.protocol === 'https:' && url.hostname === 'script.google.com' && url.pathname.endsWith('/exec');
  }

  async function sendRichAnalytics(event) {
    if (!isConfiguredEndpoint()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (sending) return;

    if (analyticsState.lastSent && !analyticsState.pending) {
      const previous = new Date(analyticsState.lastSent.sentAt).toLocaleString('ru-RU');
      if (!confirm(`Итоги уже отправлялись ${previous}. Отправить новый агрегированный снимок ещё раз?`)) return;
    }

    let pending = analyticsState.pending;
    if (!pending) {
      const submissionId = createUuid();
      let payload;
      try { payload = buildAnalyticsPayload(submissionId); }
      catch (_) {
        finalStatus.textContent = '✗ не удалось подготовить безопасный статистический снимок';
        return;
      }
      if (!payload.overall.checkedCount && !payload.overall.uniqueValidLinks) {
        alert('Пока нет отмеченных заданий или корректных ссылок — отправлять статистику нечего.');
        return;
      }
      pending = { submissionId, createdAt: nowIso(), payload };
      analyticsState.pending = pending;
      saveAnalyticsState();
    }

    sending = true;
    finalButton.disabled = true;
    finalButton.setAttribute('aria-busy', 'true');
    finalStatus.textContent = 'отправляю расширенную агрегированную статистику…';
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), FINAL_TIMEOUT_MS);
    try {
      const response = await fetch(finalStatsUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(pending.payload), redirect: 'follow', signal: controller.signal });
      const data = await response.json();
      if (!data || data.ok !== true) {
        finalStatus.textContent = `✗ сервер отклонил запрос${data && data.reason ? ` (${data.reason})` : ''}; можно безопасно повторить`;
        return;
      }
      analyticsState.lastSent = { submissionId: pending.submissionId, sentAt: nowIso(), sinks: data.sinks && typeof data.sinks === 'object' ? data.sinks : null };
      analyticsState.pending = null;
      saveAnalyticsState();
      const sinkText = data.sinks ? `; Sheets: ${data.sinks.sheets ? '✓' : '—'}, Supabase: ${data.sinks.supabase ? '✓' : '—'}` : '';
      finalStatus.textContent = `✓ агрегированная статистика отправлена${sinkText}`;
    } catch (_) {
      finalStatus.textContent = '✗ не удалось отправить — снимок и UUID сохранены локально для безопасного повтора';
    } finally {
      clearTimeout(timeout);
      sending = false;
      finalButton.disabled = false;
      finalButton.removeAttribute('aria-busy');
    }
  }

  function bindEngagementTracking() {
    finalButton.addEventListener('click', sendRichAnalytics, { capture: true });
    document.getElementById('exportFull')?.addEventListener('click', () => increment('exportCount', 'exports'), true);

    const importInput = document.getElementById('fileInputFull');
    importInput?.addEventListener('change', () => {
      const before = safeAppStateString();
      increment('importAttemptCount', 'importAttempts');
      setTimeout(() => {
        if (before !== safeAppStateString()) increment('importSuccessCount', 'importSuccesses');
      }, 750);
    }, true);

    document.getElementById('resetAllBtn')?.addEventListener('click', () => {
      const before = safeAppStateString();
      setTimeout(() => { if (before !== safeAppStateString()) increment('resetCount', 'resets'); }, 0);
    }, true);

    document.getElementById('collapseAllBtn')?.addEventListener('click', () => { analyticsState.counters.collapseAllCount += 1; saveAnalyticsState(); }, true);
    document.getElementById('expandAllBtn')?.addEventListener('click', () => { analyticsState.counters.expandAllCount += 1; saveAnalyticsState(); }, true);

    const categories = document.getElementById('categoriesView');
    categories?.addEventListener('change', event => {
      if (!event.target.dataset.check) return;
      increment('taskToggleCount', 'taskToggles');
      if (event.target.checked) {
        const timestamp = nowIso();
        analyticsState.milestones.firstTaskCompletedAt ||= timestamp;
        analyticsState.milestones.lastTaskCompletedAt = timestamp;
        setTimeout(updateProgressMilestones, 0);
      }
      saveAnalyticsState();
    });
    categories?.addEventListener('click', event => {
      if (event.target.closest('[data-mark]')) increment('favoriteToggleCount', 'favoriteToggles');
      if (event.target.closest('[data-toggle]')) increment('categoryToggleCount', 'categoryToggles');
    });
    categories?.addEventListener('focusout', event => {
      if (!event.target.dataset.link) return;
      increment('linkCommitCount', 'linkCommits');
      setTimeout(updateLinkMilestones, 0);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushActiveTime();
      else if (activeStartedAt === null) activeStartedAt = performance.now();
    });
    window.addEventListener('pagehide', flushActiveTime);
  }

  function safeAppStateString() {
    try { return localStorage.getItem(APP_STATE_KEY) || ''; } catch (_) { return ''; }
  }

  function updateProgressMilestones() {
    const total = templateTaskOrder.size;
    const checked = document.querySelectorAll('[data-check]:checked').length;
    if (total && checked >= Math.ceil(total / 2) && !analyticsState.milestones.halfwayReachedAt) analyticsState.milestones.halfwayReachedAt = nowIso();
    saveAnalyticsState();
  }

  function updateLinkMilestones() {
    try {
      const snapshot = buildAnalyticsPayload(createUuid());
      if (snapshot.overall.validLinks > 0) analyticsState.milestones.firstPostLinkedAt ||= nowIso();
      if (snapshot.overall.completedChallenges > 0) analyticsState.milestones.firstChallengeCompletedAt ||= nowIso();
      saveAnalyticsState();
    } catch (_) { /* Telemetry calculation must never affect the product. */ }
  }

  function renderAnalyticsStatus() {
    if (!analyticsState.lastSent || analyticsState.pending) return;
    finalStatus.textContent = `✓ последняя агрегированная отправка: ${new Date(analyticsState.lastSent.sentAt).toLocaleString('ru-RU')}`;
  }
})();
