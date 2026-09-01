'use strict';

(() => {
  const SOURCE_COMMIT = '188d246aad8740bfa18387b56eeafc7e4aa5da5a';
  const block = document.getElementById('templateData');

  const audit = {
    sourceCommit: SOURCE_COMMIT,
    accepted: [],
    skipped: [],
    rejected: [
      {
        change: 'templateVersion: 2026-11-22 -> 2026-11-21',
        reason: 'Rejected: backward version movement. The accepted upstream edits are non-structural copy corrections, so the current trusted template version remains unchanged.'
      },
      {
        change: '#10шоу -> #10видео&аудио',
        reason: 'Rejected as-is: the upstream edit leaves the LiveJournal search URL targeting #10шоу, so the visible hashtag and link destination would disagree.'
      }
    ]
  };

  if (!block) {
    audit.skipped.push({ change: 'all', reason: 'templateData block not found' });
    globalThis.FOUR_FOX_UPSTREAM_RECONCILIATION = Object.freeze(audit);
    return;
  }

  let template;
  try {
    template = JSON.parse(block.textContent);
  } catch (_) {
    audit.skipped.push({ change: 'all', reason: 'templateData JSON could not be parsed' });
    globalThis.FOUR_FOX_UPSTREAM_RECONCILIATION = Object.freeze(audit);
    return;
  }

  const categories = Array.isArray(template.categories) ? template.categories : [];
  const categoryById = new Map(categories.filter(Boolean).map(category => [category.id, category]));
  const taskById = new Map();
  for (const category of categories) {
    for (const task of Array.isArray(category && category.tasks) ? category.tasks : []) {
      if (task && typeof task.id === 'string') taskById.set(task.id, task);
    }
  }

  function exactReplace(record, field, expected, replacement, auditId) {
    if (!record) {
      audit.skipped.push({ change: auditId, reason: 'target ID not found' });
      return;
    }
    if (record[field] === replacement) {
      audit.accepted.push({ change: auditId, status: 'already applied' });
      return;
    }
    if (record[field] !== expected) {
      audit.skipped.push({ change: auditId, reason: 'source text no longer matches the reviewed upstream baseline' });
      return;
    }
    record[field] = replacement;
    audit.accepted.push({ change: auditId, status: 'applied' });
  }

  exactReplace(
    categoryById.get('tuje38v7'),
    'name',
    'Георгафические (с привязкой к городам и странам):',
    'Географические (с привязкой к городам и странам):',
    'category tuje38v7: spelling correction Георгафические -> Географические'
  );

  exactReplace(
    taskById.get('tnliu5g9'),
    'text',
    '[#10фильмов](https://www.livejournal.com/rsearch/?tags=%2310%D1%84%D0%B8%D0%BB%D1%8C%D0%BC%D0%BE%D0%B2&searchArea=post)  — аналогично вышесказанному.',
    '[#10фильмов](https://www.livejournal.com/rsearch/?tags=%2310%D1%84%D0%B8%D0%BB%D1%8C%D0%BC%D0%BE%D0%B2&searchArea=post)  — отзывы, рецензии.',
    'task tnliu5g9: replace ambiguous cross-reference with explicit description'
  );

  if (audit.accepted.some(item => item.status === 'applied')) {
    block.textContent = JSON.stringify(template);
  }

  globalThis.FOUR_FOX_UPSTREAM_RECONCILIATION = Object.freeze({
    sourceCommit: audit.sourceCommit,
    accepted: Object.freeze(audit.accepted.map(Object.freeze)),
    skipped: Object.freeze(audit.skipped.map(Object.freeze)),
    rejected: Object.freeze(audit.rejected.map(Object.freeze))
  });
})();
