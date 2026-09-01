'use strict';

/**
 * 4ek-lis analytics gateway.
 * GitHub Pages -> Apps Script -> Google Sheets + optional Supabase PostgreSQL.
 *
 * SECURITY BOUNDARY
 * - The browser never receives a Supabase secret/service-role key.
 * - Supabase credentials live only in Apps Script Script Properties.
 * - Raw post URLs and task/category text are never accepted by this receiver.
 * - The public endpoint is anonymous. Validation, idempotency, locking and rate
 *   controls improve integrity, but they do not authenticate a human user.
 */

const RECEIVER_VERSION = '2.0.0';
const RECEIVER_SCHEMA_VERSION = 2;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_NICK_LENGTH = 512;
const MAX_LANGUAGE_LENGTH = 20;
const MAX_ARRAY_ROWS = 1000;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const FORMULA_PREFIX_PATTERN = /^[=+\-@]/;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const OWNER_SETUP = Object.freeze({
  spreadsheetId: '',
  spreadsheetName: '4ek-lis analytics',
  allowedOrigins: Object.freeze([
    'https://365grain.github.io',
    'https://mishka23x.github.io',
  ]),
  templatePolicies: Object.freeze({
    '2026-11-22': Object.freeze({
      taskCount: 289,
      categoryCount: 21,
      quotaCount: 8,
      challengeThreshold: 10,
    }),
  }),
  maxRequestsPerMinute: 30,
  maxRequestsPerHour: 500,
});

const PROPERTY_KEYS = Object.freeze({
  spreadsheetId: 'FOUR_FOX_SPREADSHEET_ID',
  allowedOrigins: 'FOUR_FOX_ALLOWED_ORIGINS_JSON',
  templatePolicies: 'FOUR_FOX_TEMPLATE_POLICIES_JSON',
  maxRequestsPerMinute: 'FOUR_FOX_MAX_REQUESTS_PER_MINUTE',
  maxRequestsPerHour: 'FOUR_FOX_MAX_REQUESTS_PER_HOUR',
  supabaseUrl: 'SUPABASE_URL',
  supabaseSecretKey: 'SUPABASE_SECRET_KEY',
  supabaseRequired: 'SUPABASE_REQUIRED',
});

const SHEETS = Object.freeze({
  submissions: Object.freeze({
    name: 'Submissions',
    headers: Object.freeze([
      'server_timestamp_utc', 'submission_id', 'participant_id', 'template_version', 'source_origin',
      'generated_at', 'analytics_version', 'nickname', 'viewport_bucket', 'input_mode', 'reduced_motion',
      'color_scheme', 'language', 'total_tasks', 'checked_count', 'completion_percent', 'total_categories',
      'categories_started', 'completed_categories', 'total_entered_links', 'valid_links', 'unique_valid_links',
      'duplicate_links', 'invalid_links', 'favorite_count', 'challenge_links', 'completed_challenges',
      'tasks_with_links', 'tasks_with_multiple_links', 'max_links_on_single_task', 'first_opened_at',
      'last_active_at', 'active_days', 'session_count', 'total_active_seconds', 'export_count',
      'import_attempt_count', 'import_success_count', 'reset_count', 'task_toggle_count',
      'favorite_toggle_count', 'category_toggle_count', 'collapse_all_count', 'expand_all_count',
      'link_commit_count', 'first_task_completed_at', 'first_post_linked_at', 'first_challenge_completed_at',
      'halfway_reached_at', 'last_task_completed_at', 'receiver_version', 'schema_version'
    ])
  }),
  categories: Object.freeze({
    name: 'Categories',
    headers: Object.freeze([
      'submission_id', 'participant_id', 'template_version', 'category_id', 'task_count', 'checked_count',
      'completion_percent', 'favorite_count', 'entered_link_count', 'valid_link_count',
      'unique_valid_link_count', 'duplicate_link_count', 'invalid_link_count', 'completed_challenges'
    ])
  }),
  tasks: Object.freeze({
    name: 'Tasks',
    headers: Object.freeze([
      'submission_id', 'participant_id', 'template_version', 'category_id', 'task_id', 'checked', 'favorite',
      'entered_link_count', 'valid_link_count', 'unique_valid_link_count', 'duplicate_link_count',
      'invalid_link_count', 'completed_challenges'
    ])
  }),
  quotas: Object.freeze({
    name: 'Quotas',
    headers: Object.freeze(['submission_id', 'participant_id', 'template_version', 'quota_id', 'target'])
  }),
  daily: Object.freeze({
    name: 'Daily',
    headers: Object.freeze([
      'submission_id', 'participant_id', 'template_version', 'day', 'active_seconds', 'sessions',
      'task_toggles', 'favorite_toggles', 'category_toggles', 'link_commits', 'exports',
      'import_attempts', 'import_successes', 'resets'
    ])
  }),
});

function setupReceiver() {
  validateOwnerSetup_();
  const spreadsheet = OWNER_SETUP.spreadsheetId
    ? SpreadsheetApp.openById(OWNER_SETUP.spreadsheetId)
    : SpreadsheetApp.create(OWNER_SETUP.spreadsheetName);

  PropertiesService.getScriptProperties().setProperties({
    [PROPERTY_KEYS.spreadsheetId]: spreadsheet.getId(),
    [PROPERTY_KEYS.allowedOrigins]: JSON.stringify(OWNER_SETUP.allowedOrigins),
    [PROPERTY_KEYS.templatePolicies]: JSON.stringify(OWNER_SETUP.templatePolicies),
    [PROPERTY_KEYS.maxRequestsPerMinute]: String(OWNER_SETUP.maxRequestsPerMinute),
    [PROPERTY_KEYS.maxRequestsPerHour]: String(OWNER_SETUP.maxRequestsPerHour),
  }, false);

  Object.values(SHEETS).forEach(definition => ensureSheet_(spreadsheet, definition));
  const supabase = readSupabaseConfig_(false);
  return {
    ok: true,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    receiverVersion: RECEIVER_VERSION,
    schemaVersion: RECEIVER_SCHEMA_VERSION,
    supabaseConfigured: supabase.configured,
    supabaseRequired: supabase.required,
  };
}

function validateSupabaseConfiguration() {
  const config = readSupabaseConfig_(true);
  return {
    ok: config.configured,
    configured: config.configured,
    required: config.required,
    projectHost: config.configured ? new URL(config.url).hostname : null,
  };
}

function doGet() {
  let configured = false;
  let supabaseConfigured = false;
  let supabaseRequired = false;
  try {
    const config = getRuntimeConfig_();
    configured = true;
    supabaseConfigured = config.supabase.configured;
    supabaseRequired = config.supabase.required;
  } catch (_) {
    configured = false;
  }
  return jsonResponse_({
    ok: true,
    service: '4ek-lis-analytics',
    receiverVersion: RECEIVER_VERSION,
    schemaVersion: RECEIVER_SCHEMA_VERSION,
    configured,
    supabaseConfigured,
    supabaseRequired,
  });
}

function doPost(event) {
  let lock;
  try {
    const config = getRuntimeConfig_();
    const payload = parseAndValidateRequest_(event, config);
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return jsonResponse_({ ok: false, reason: 'busy' });

    const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    Object.values(SHEETS).forEach(definition => ensureSheet_(spreadsheet, definition));
    const alreadyInSheets = hasSubmissionId_(spreadsheet.getSheetByName(SHEETS.submissions.name), payload.submissionId);
    if (!alreadyInSheets && !consumeRateBudget_(config)) return jsonResponse_({ ok: false, reason: 'rate_limited' });

    const sinks = { sheets: false, supabase: false };
    const errors = {};

    try {
      writeSheetsIdempotent_(spreadsheet, payload, alreadyInSheets);
      sinks.sheets = true;
    } catch (error) {
      errors.sheets = publicReason_(error);
      console.error(`Sheets sink failed: ${error && error.stack ? error.stack : String(error)}`);
    }

    if (config.supabase.configured) {
      try {
        writeSupabase_(config.supabase, payload);
        sinks.supabase = true;
      } catch (error) {
        errors.supabase = publicReason_(error);
        console.error(`Supabase sink failed: ${error && error.stack ? error.stack : String(error)}`);
      }
    } else if (!config.supabase.required) {
      sinks.supabase = false;
    } else {
      errors.supabase = 'supabase_not_configured';
    }

    const requiredSucceeded = sinks.sheets && (!config.supabase.required || sinks.supabase);
    return jsonResponse_({
      ok: requiredSucceeded,
      duplicate: alreadyInSheets,
      submissionId: payload.submissionId,
      sinks,
      reason: requiredSucceeded ? undefined : 'partial_sink_failure',
      errors: Object.keys(errors).length ? errors : undefined,
    });
  } catch (error) {
    console.error(`4ek-lis analytics error: ${error && error.stack ? error.stack : String(error)}`);
    return jsonResponse_({ ok: false, reason: publicReason_(error) });
  } finally {
    if (lock) {
      try { lock.releaseLock(); } catch (_) { /* noop */ }
    }
  }
}

function parseAndValidateRequest_(event, config) {
  if (!event || !event.postData) throw receiverError_('invalid_request');
  const contentLength = Number(event.contentLength);
  if (!Number.isFinite(contentLength) || contentLength < 2 || contentLength > MAX_BODY_BYTES) throw receiverError_('invalid_size');
  const mediaType = String(event.postData.type || '').split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'text/plain' && mediaType !== 'application/json') throw receiverError_('invalid_content_type');
  const body = String(event.postData.contents || '');
  if (Utilities.newBlob(body).getBytes().length > MAX_BODY_BYTES) throw receiverError_('invalid_size');
  let payload;
  try { payload = JSON.parse(body); } catch (_) { throw receiverError_('invalid_json'); }
  return validatePayload_(payload, config);
}

function validatePayload_(payload, config) {
  assertPlainObject_(payload, 'invalid_payload');
  assertExactKeys_(payload, [
    'schemaVersion', 'type', 'submissionId', 'participantId', 'templateVersion', 'sourceOrigin',
    'generatedAt', 'analyticsVersion', 'nick', 'clientContext', 'overall', 'engagement',
    'categoryStats', 'taskStats', 'quotaStats', 'dailyStats'
  ]);
  if (payload.schemaVersion !== RECEIVER_SCHEMA_VERSION) throw receiverError_('unsupported_schema');
  if (payload.type !== 'final_analytics') throw receiverError_('invalid_type');
  requireUuid_(payload.submissionId, 'invalid_submission_id');
  requireUuid_(payload.participantId, 'invalid_participant_id');
  requireSafeString_(payload.templateVersion, 100, 'invalid_template');
  const policy = config.templatePolicies[payload.templateVersion];
  if (!policy) throw receiverError_('unsupported_template');
  const normalizedOrigin = normalizeOrigin_(payload.sourceOrigin);
  if (!config.allowedOrigins.includes(normalizedOrigin)) throw receiverError_('origin_not_allowed');
  requireIsoDate_(payload.generatedAt, 'invalid_generated_at');
  requireSafeString_(payload.analyticsVersion, 40, 'invalid_analytics_version');
  requireNick_(payload.nick);

  const clientContext = validateClientContext_(payload.clientContext);
  const taskStats = validateTaskStats_(payload.taskStats, policy);
  const categoryStats = validateCategoryStats_(payload.categoryStats, taskStats, policy);
  const quotaStats = validateQuotaStats_(payload.quotaStats, policy);
  const dailyStats = validateDailyStats_(payload.dailyStats);
  const engagement = validateEngagement_(payload.engagement, dailyStats);
  const overall = validateOverall_(payload.overall, taskStats, categoryStats, policy);

  return {
    schemaVersion: payload.schemaVersion,
    type: payload.type,
    submissionId: payload.submissionId.toLowerCase(),
    participantId: payload.participantId.toLowerCase(),
    templateVersion: payload.templateVersion,
    sourceOrigin: normalizedOrigin,
    generatedAt: payload.generatedAt,
    analyticsVersion: payload.analyticsVersion,
    nick: payload.nick.trim() || 'аноним',
    clientContext,
    overall,
    engagement,
    categoryStats,
    taskStats,
    quotaStats,
    dailyStats,
  };
}

function validateClientContext_(value) {
  assertPlainObject_(value, 'invalid_client_context');
  assertExactKeys_(value, ['viewportBucket', 'inputMode', 'reducedMotion', 'colorScheme', 'language']);
  if (!['xs<=480', 'sm481-768', 'md769-1024', 'lg1025-1440', 'xl>1440'].includes(value.viewportBucket)) throw receiverError_('invalid_viewport_bucket');
  if (!['touch', 'pointer', 'mixed', 'unknown'].includes(value.inputMode)) throw receiverError_('invalid_input_mode');
  if (typeof value.reducedMotion !== 'boolean') throw receiverError_('invalid_reduced_motion');
  if (!['light', 'dark'].includes(value.colorScheme)) throw receiverError_('invalid_color_scheme');
  requireSafeString_(value.language, MAX_LANGUAGE_LENGTH, 'invalid_language');
  return { ...value };
}

function validateTaskStats_(rows, policy) {
  if (!Array.isArray(rows) || rows.length !== policy.taskCount || rows.length > MAX_ARRAY_ROWS) throw receiverError_('invalid_task_stats');
  const seen = new Set();
  return rows.map(row => {
    assertPlainObject_(row, 'invalid_task_row');
    assertExactKeys_(row, ['taskId', 'categoryId', 'checked', 'favorite', 'enteredLinkCount', 'validLinkCount', 'uniqueValidLinkCount', 'duplicateLinkCount', 'invalidLinkCount', 'completedChallenges']);
    const taskId = requireId_(row.taskId, 'invalid_task_id');
    const categoryId = requireId_(row.categoryId, 'invalid_category_id');
    if (seen.has(taskId)) throw receiverError_('duplicate_task_id');
    seen.add(taskId);
    if (typeof row.checked !== 'boolean' || typeof row.favorite !== 'boolean') throw receiverError_('invalid_task_boolean');
    const entered = requireInteger_(row.enteredLinkCount, 0, 10000, 'invalid_task_count');
    const valid = requireInteger_(row.validLinkCount, 0, entered, 'invalid_task_count');
    const unique = requireInteger_(row.uniqueValidLinkCount, 0, valid, 'invalid_task_count');
    const duplicate = requireInteger_(row.duplicateLinkCount, 0, valid, 'invalid_task_count');
    const invalid = requireInteger_(row.invalidLinkCount, 0, entered, 'invalid_task_count');
    const challenges = requireInteger_(row.completedChallenges, 0, 1000, 'invalid_challenge_count');
    if (entered !== valid + invalid || valid !== unique + duplicate) throw receiverError_('task_link_invariant');
    if (challenges > Math.floor(unique / policy.challengeThreshold)) throw receiverError_('task_challenge_invariant');
    return { taskId, categoryId, checked: row.checked, favorite: row.favorite, enteredLinkCount: entered, validLinkCount: valid, uniqueValidLinkCount: unique, duplicateLinkCount: duplicate, invalidLinkCount: invalid, completedChallenges: challenges };
  });
}

function validateCategoryStats_(rows, tasks, policy) {
  if (!Array.isArray(rows) || rows.length !== policy.categoryCount || rows.length > MAX_ARRAY_ROWS) throw receiverError_('invalid_category_stats');
  const taskGroups = new Map();
  tasks.forEach(task => {
    if (!taskGroups.has(task.categoryId)) taskGroups.set(task.categoryId, []);
    taskGroups.get(task.categoryId).push(task);
  });
  const seen = new Set();
  const normalized = rows.map(row => {
    assertPlainObject_(row, 'invalid_category_row');
    assertExactKeys_(row, ['categoryId', 'taskCount', 'checkedCount', 'favoriteCount', 'enteredLinkCount', 'validLinkCount', 'uniqueValidLinkCount', 'duplicateLinkCount', 'invalidLinkCount', 'completedChallenges', 'completionPercent']);
    const categoryId = requireId_(row.categoryId, 'invalid_category_id');
    if (seen.has(categoryId)) throw receiverError_('duplicate_category_id');
    seen.add(categoryId);
    const members = taskGroups.get(categoryId) || [];
    if (!members.length) throw receiverError_('category_without_tasks');
    const expected = summarizeTasks_(members);
    const taskCount = requireInteger_(row.taskCount, 1, policy.taskCount, 'invalid_category_count');
    const checkedCount = requireInteger_(row.checkedCount, 0, taskCount, 'invalid_category_count');
    const favoriteCount = requireInteger_(row.favoriteCount, 0, taskCount, 'invalid_category_count');
    const entered = requireInteger_(row.enteredLinkCount, 0, 100000, 'invalid_category_count');
    const valid = requireInteger_(row.validLinkCount, 0, entered, 'invalid_category_count');
    const unique = requireInteger_(row.uniqueValidLinkCount, 0, valid, 'invalid_category_count');
    const duplicate = requireInteger_(row.duplicateLinkCount, 0, valid, 'invalid_category_count');
    const invalid = requireInteger_(row.invalidLinkCount, 0, entered, 'invalid_category_count');
    const challenges = requireInteger_(row.completedChallenges, 0, 10000, 'invalid_category_count');
    const completion = requireFinite_(row.completionPercent, 0, 100, 'invalid_completion_percent');
    if (taskCount !== members.length || checkedCount !== expected.checkedCount || favoriteCount !== expected.favoriteCount || entered !== expected.enteredLinkCount || valid !== expected.validLinkCount || unique !== expected.uniqueValidLinkCount || duplicate !== expected.duplicateLinkCount || invalid !== expected.invalidLinkCount || challenges !== expected.completedChallenges) throw receiverError_('category_aggregate_mismatch');
    if (Math.abs(completion - round2_(checkedCount / taskCount * 100)) > 0.011) throw receiverError_('category_completion_mismatch');
    return { categoryId, taskCount, checkedCount, favoriteCount, enteredLinkCount: entered, validLinkCount: valid, uniqueValidLinkCount: unique, duplicateLinkCount: duplicate, invalidLinkCount: invalid, completedChallenges: challenges, completionPercent: completion };
  });
  if (taskGroups.size !== normalized.length) throw receiverError_('category_membership_mismatch');
  return normalized;
}

function validateQuotaStats_(rows, policy) {
  if (!Array.isArray(rows) || rows.length !== policy.quotaCount || rows.length > MAX_ARRAY_ROWS) throw receiverError_('invalid_quota_stats');
  const seen = new Set();
  return rows.map(row => {
    assertPlainObject_(row, 'invalid_quota_row');
    assertExactKeys_(row, ['quotaId', 'target']);
    const quotaId = requireId_(row.quotaId, 'invalid_quota_id');
    if (seen.has(quotaId)) throw receiverError_('duplicate_quota_id');
    seen.add(quotaId);
    const target = row.target === null ? null : requireInteger_(row.target, 0, 1000000, 'invalid_quota_target');
    return { quotaId, target };
  });
}

function validateDailyStats_(rows) {
  if (!Array.isArray(rows) || rows.length > 730) throw receiverError_('invalid_daily_stats');
  const seen = new Set();
  return rows.map(row => {
    assertPlainObject_(row, 'invalid_daily_row');
    assertExactKeys_(row, ['day', 'activeSeconds', 'sessions', 'taskToggles', 'favoriteToggles', 'categoryToggles', 'linkCommits', 'exports', 'importAttempts', 'importSuccesses', 'resets']);
    if (typeof row.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.day) || !Number.isFinite(Date.parse(`${row.day}T00:00:00Z`))) throw receiverError_('invalid_daily_day');
    if (seen.has(row.day)) throw receiverError_('duplicate_daily_day');
    seen.add(row.day);
    const normalized = { day: row.day };
    ['activeSeconds', 'sessions', 'taskToggles', 'favoriteToggles', 'categoryToggles', 'linkCommits', 'exports', 'importAttempts', 'importSuccesses', 'resets'].forEach(key => {
      const max = key === 'activeSeconds' ? 86400 : 100000;
      normalized[key] = requireInteger_(row[key], 0, max, 'invalid_daily_count');
    });
    if (normalized.importSuccesses > normalized.importAttempts) throw receiverError_('daily_import_invariant');
    return normalized;
  });
}

function validateEngagement_(value, dailyRows) {
  assertPlainObject_(value, 'invalid_engagement');
  const fields = ['firstOpenedAt', 'lastActiveAt', 'activeDays', 'sessionCount', 'totalActiveSeconds', 'exportCount', 'importAttemptCount', 'importSuccessCount', 'resetCount', 'taskToggleCount', 'favoriteToggleCount', 'categoryToggleCount', 'collapseAllCount', 'expandAllCount', 'linkCommitCount', 'firstTaskCompletedAt', 'firstPostLinkedAt', 'firstChallengeCompletedAt', 'halfwayReachedAt', 'lastTaskCompletedAt'];
  assertExactKeys_(value, fields);
  requireIsoDate_(value.firstOpenedAt, 'invalid_engagement_date');
  requireIsoDate_(value.lastActiveAt, 'invalid_engagement_date');
  const normalized = { firstOpenedAt: value.firstOpenedAt, lastActiveAt: value.lastActiveAt };
  ['activeDays', 'sessionCount', 'totalActiveSeconds', 'exportCount', 'importAttemptCount', 'importSuccessCount', 'resetCount', 'taskToggleCount', 'favoriteToggleCount', 'categoryToggleCount', 'collapseAllCount', 'expandAllCount', 'linkCommitCount'].forEach(key => {
    normalized[key] = requireInteger_(value[key], 0, key === 'totalActiveSeconds' ? 315360000 : 1000000, 'invalid_engagement_count');
  });
  ['firstTaskCompletedAt', 'firstPostLinkedAt', 'firstChallengeCompletedAt', 'halfwayReachedAt', 'lastTaskCompletedAt'].forEach(key => {
    normalized[key] = value[key] === null ? null : requireIsoDate_(value[key], 'invalid_milestone_date');
  });
  if (normalized.importSuccessCount > normalized.importAttemptCount) throw receiverError_('engagement_import_invariant');
  const activeDays = dailyRows.filter(row => row.activeSeconds > 0 || row.sessions > 0 || row.taskToggles > 0 || row.linkCommits > 0).length;
  const sessions = dailyRows.reduce((sum, row) => sum + row.sessions, 0);
  const activeSeconds = dailyRows.reduce((sum, row) => sum + row.activeSeconds, 0);
  if (normalized.activeDays !== activeDays || normalized.sessionCount !== sessions || Math.abs(normalized.totalActiveSeconds - activeSeconds) > 2) throw receiverError_('engagement_daily_mismatch');
  return normalized;
}

function validateOverall_(value, tasks, categories, policy) {
  assertPlainObject_(value, 'invalid_overall');
  const fields = ['totalTasks', 'checkedCount', 'completionPercent', 'totalCategories', 'categoriesStarted', 'completedCategories', 'totalEnteredLinks', 'validLinks', 'uniqueValidLinks', 'duplicateLinks', 'invalidLinks', 'favoriteCount', 'challengeLinks', 'completedChallenges', 'tasksWithLinks', 'tasksWithMultipleLinks', 'maxLinksOnSingleTask'];
  assertExactKeys_(value, fields);
  const summary = summarizeTasks_(tasks);
  const checkedCount = summary.checkedCount;
  const completion = requireFinite_(value.completionPercent, 0, 100, 'invalid_completion_percent');
  const expectedStarted = categories.filter(row => row.checkedCount || row.enteredLinkCount || row.favoriteCount).length;
  const expectedCompleted = categories.filter(row => row.checkedCount === row.taskCount).length;
  const expected = {
    totalTasks: policy.taskCount,
    checkedCount,
    totalCategories: policy.categoryCount,
    categoriesStarted: expectedStarted,
    completedCategories: expectedCompleted,
    totalEnteredLinks: summary.enteredLinkCount,
    validLinks: summary.validLinkCount,
    uniqueValidLinks: summary.uniqueValidLinkCount,
    duplicateLinks: summary.duplicateLinkCount,
    invalidLinks: summary.invalidLinkCount,
    favoriteCount: summary.favoriteCount,
    completedChallenges: summary.completedChallenges,
    tasksWithLinks: tasks.filter(row => row.enteredLinkCount > 0).length,
    tasksWithMultipleLinks: tasks.filter(row => row.enteredLinkCount > 1).length,
    maxLinksOnSingleTask: tasks.reduce((max, row) => Math.max(max, row.enteredLinkCount), 0),
  };
  Object.entries(expected).forEach(([key, expectedValue]) => {
    if (requireInteger_(value[key], 0, 1000000, 'invalid_overall_count') !== expectedValue) throw receiverError_('overall_aggregate_mismatch');
  });
  const challengeLinks = requireInteger_(value.challengeLinks, 0, summary.uniqueValidLinkCount, 'invalid_challenge_links');
  if (summary.completedChallenges > Math.floor(challengeLinks / policy.challengeThreshold)) throw receiverError_('overall_challenge_invariant');
  if (Math.abs(completion - round2_(checkedCount / policy.taskCount * 100)) > 0.011) throw receiverError_('overall_completion_mismatch');
  return { ...value, completionPercent: completion, challengeLinks };
}

function summarizeTasks_(tasks) {
  return tasks.reduce((summary, row) => {
    summary.checkedCount += row.checked ? 1 : 0;
    summary.favoriteCount += row.favorite ? 1 : 0;
    summary.enteredLinkCount += row.enteredLinkCount;
    summary.validLinkCount += row.validLinkCount;
    summary.uniqueValidLinkCount += row.uniqueValidLinkCount;
    summary.duplicateLinkCount += row.duplicateLinkCount;
    summary.invalidLinkCount += row.invalidLinkCount;
    summary.completedChallenges += row.completedChallenges;
    return summary;
  }, { checkedCount: 0, favoriteCount: 0, enteredLinkCount: 0, validLinkCount: 0, uniqueValidLinkCount: 0, duplicateLinkCount: 0, invalidLinkCount: 0, completedChallenges: 0 });
}

function writeSheetsIdempotent_(spreadsheet, payload, alreadyExists) {
  if (alreadyExists) return;
  const now = new Date();
  const o = payload.overall;
  const e = payload.engagement;
  const c = payload.clientContext;
  appendRows_(spreadsheet.getSheetByName(SHEETS.submissions.name), [[
    now, safeSheetText_(payload.submissionId), safeSheetText_(payload.participantId), safeSheetText_(payload.templateVersion), safeSheetText_(payload.sourceOrigin),
    new Date(payload.generatedAt), safeSheetText_(payload.analyticsVersion), safeSheetText_(payload.nick), safeSheetText_(c.viewportBucket), safeSheetText_(c.inputMode), c.reducedMotion,
    safeSheetText_(c.colorScheme), safeSheetText_(c.language), o.totalTasks, o.checkedCount, o.completionPercent, o.totalCategories, o.categoriesStarted,
    o.completedCategories, o.totalEnteredLinks, o.validLinks, o.uniqueValidLinks, o.duplicateLinks, o.invalidLinks, o.favoriteCount,
    o.challengeLinks, o.completedChallenges, o.tasksWithLinks, o.tasksWithMultipleLinks, o.maxLinksOnSingleTask,
    new Date(e.firstOpenedAt), new Date(e.lastActiveAt), e.activeDays, e.sessionCount, e.totalActiveSeconds, e.exportCount,
    e.importAttemptCount, e.importSuccessCount, e.resetCount, e.taskToggleCount, e.favoriteToggleCount, e.categoryToggleCount,
    e.collapseAllCount, e.expandAllCount, e.linkCommitCount, dateOrBlank_(e.firstTaskCompletedAt), dateOrBlank_(e.firstPostLinkedAt),
    dateOrBlank_(e.firstChallengeCompletedAt), dateOrBlank_(e.halfwayReachedAt), dateOrBlank_(e.lastTaskCompletedAt), RECEIVER_VERSION, RECEIVER_SCHEMA_VERSION
  ]]);

  appendRows_(spreadsheet.getSheetByName(SHEETS.categories.name), payload.categoryStats.map(row => [
    payload.submissionId, payload.participantId, payload.templateVersion, row.categoryId, row.taskCount, row.checkedCount,
    row.completionPercent, row.favoriteCount, row.enteredLinkCount, row.validLinkCount, row.uniqueValidLinkCount,
    row.duplicateLinkCount, row.invalidLinkCount, row.completedChallenges
  ]));
  appendRows_(spreadsheet.getSheetByName(SHEETS.tasks.name), payload.taskStats.map(row => [
    payload.submissionId, payload.participantId, payload.templateVersion, row.categoryId, row.taskId, row.checked, row.favorite,
    row.enteredLinkCount, row.validLinkCount, row.uniqueValidLinkCount, row.duplicateLinkCount, row.invalidLinkCount, row.completedChallenges
  ]));
  appendRows_(spreadsheet.getSheetByName(SHEETS.quotas.name), payload.quotaStats.map(row => [payload.submissionId, payload.participantId, payload.templateVersion, row.quotaId, row.target === null ? '' : row.target]));
  appendRows_(spreadsheet.getSheetByName(SHEETS.daily.name), payload.dailyStats.map(row => [
    payload.submissionId, payload.participantId, payload.templateVersion, row.day, row.activeSeconds, row.sessions,
    row.taskToggles, row.favoriteToggles, row.categoryToggles, row.linkCommits, row.exports, row.importAttempts,
    row.importSuccesses, row.resets
  ]));
}

function writeSupabase_(config, payload) {
  const endpoint = `${config.url}/rest/v1/rpc/ingest_analytics_submission`;
  const response = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: config.secretKey,
      Prefer: 'return=representation',
    },
    payload: JSON.stringify({ p_payload: payload }),
    muteHttpExceptions: true,
    followRedirects: false,
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw receiverError_(`supabase_http_${status}`);
  let body;
  try { body = JSON.parse(response.getContentText() || '{}'); } catch (_) { throw receiverError_('supabase_invalid_json'); }
  if (!body || body.ok !== true) throw receiverError_('supabase_rejected');
}

function getRuntimeConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty(PROPERTY_KEYS.spreadsheetId);
  if (!spreadsheetId) throw receiverError_('not_configured');
  let allowedOrigins;
  let templatePolicies;
  try {
    allowedOrigins = JSON.parse(properties.getProperty(PROPERTY_KEYS.allowedOrigins) || '[]');
    templatePolicies = JSON.parse(properties.getProperty(PROPERTY_KEYS.templatePolicies) || '{}');
  } catch (_) { throw receiverError_('invalid_configuration'); }
  validateOriginList_(allowedOrigins);
  validateTemplatePolicies_(templatePolicies);
  return {
    spreadsheetId,
    allowedOrigins: allowedOrigins.map(normalizeOrigin_),
    templatePolicies,
    maxRequestsPerMinute: positiveInteger_(properties.getProperty(PROPERTY_KEYS.maxRequestsPerMinute), 'invalid_configuration'),
    maxRequestsPerHour: positiveInteger_(properties.getProperty(PROPERTY_KEYS.maxRequestsPerHour), 'invalid_configuration'),
    supabase: readSupabaseConfig_(false),
  };
}

function readSupabaseConfig_(strict) {
  const properties = PropertiesService.getScriptProperties();
  const url = String(properties.getProperty(PROPERTY_KEYS.supabaseUrl) || '').trim().replace(/\/$/, '');
  const secretKey = String(properties.getProperty(PROPERTY_KEYS.supabaseSecretKey) || '').trim();
  const required = String(properties.getProperty(PROPERTY_KEYS.supabaseRequired) || 'false').toLowerCase() === 'true';
  const configured = !!url && !!secretKey;
  if (!configured) {
    if (strict || required) throw receiverError_('supabase_not_configured');
    return { configured: false, required, url: '', secretKey: '' };
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) throw receiverError_('invalid_supabase_url');
  if (!/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(secretKey)) throw receiverError_('invalid_supabase_secret_key');
  return { configured: true, required, url, secretKey };
}

function validateOwnerSetup_() {
  if (OWNER_SETUP.spreadsheetId && !/^[a-zA-Z0-9_-]{20,}$/.test(OWNER_SETUP.spreadsheetId)) throw new Error('OWNER_SETUP.spreadsheetId is invalid');
  validateOriginList_(OWNER_SETUP.allowedOrigins);
  validateTemplatePolicies_(OWNER_SETUP.templatePolicies);
  positiveInteger_(OWNER_SETUP.maxRequestsPerMinute, 'Invalid minute rate limit');
  positiveInteger_(OWNER_SETUP.maxRequestsPerHour, 'Invalid hour rate limit');
}

function validateOriginList_(origins) {
  if (!Array.isArray(origins) || !origins.length || origins.length > 20) throw receiverError_('invalid_configuration');
  origins.forEach(origin => {
    if (typeof origin !== 'string' || normalizeOrigin_(origin) !== origin.replace(/\/$/, '')) throw receiverError_('invalid_configuration');
  });
}

function validateTemplatePolicies_(policies) {
  assertPlainObject_(policies, 'invalid_configuration');
  const versions = Object.keys(policies);
  if (!versions.length || versions.length > 50) throw receiverError_('invalid_configuration');
  versions.forEach(version => {
    if (DANGEROUS_KEYS.has(version) || version.length > 100) throw receiverError_('invalid_configuration');
    const policy = policies[version];
    assertPlainObject_(policy, 'invalid_configuration');
    assertExactKeys_(policy, ['taskCount', 'categoryCount', 'quotaCount', 'challengeThreshold']);
    requireInteger_(policy.taskCount, 1, 10000, 'invalid_configuration');
    requireInteger_(policy.categoryCount, 1, 1000, 'invalid_configuration');
    requireInteger_(policy.quotaCount, 0, 1000, 'invalid_configuration');
    requireInteger_(policy.challengeThreshold, 1, 1000, 'invalid_configuration');
  });
}

function ensureSheet_(spreadsheet, definition) {
  let sheet = spreadsheet.getSheetByName(definition.name);
  if (!sheet) sheet = spreadsheet.insertSheet(definition.name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, definition.headers.length).setValues([definition.headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, definition.headers.length).setFontWeight('bold');
  } else {
    const existing = sheet.getRange(1, 1, 1, definition.headers.length).getDisplayValues()[0];
    if (JSON.stringify(existing) !== JSON.stringify(definition.headers)) throw receiverError_(`sheet_schema_mismatch_${definition.name}`);
  }
  return sheet;
}

function appendRows_(sheet, rows) {
  if (!rows.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function hasSubmissionId_(sheet, submissionId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  return sheet.getRange(2, 2, lastRow - 1, 1).createTextFinder(submissionId).matchEntireCell(true).matchCase(false).findNext() !== null;
}

function consumeRateBudget_(config) {
  const cache = CacheService.getScriptCache();
  const now = Date.now();
  return incrementBudget_(cache, `minute:${Math.floor(now / 60000)}`, config.maxRequestsPerMinute, 120)
    && incrementBudget_(cache, `hour:${Math.floor(now / 3600000)}`, config.maxRequestsPerHour, 7200);
}

function incrementBudget_(cache, key, maximum, ttlSeconds) {
  const current = Number(cache.get(key) || '0');
  if (!Number.isFinite(current) || current >= maximum) return false;
  cache.put(key, String(current + 1), ttlSeconds);
  return true;
}

function normalizeOrigin_(value) {
  const origin = String(value || '').trim().replace(/\/$/, '');
  if (!/^https:\/\/[a-z0-9.-]+(?::\d{2,5})?$/i.test(origin)) throw receiverError_('invalid_origin');
  return origin.toLowerCase();
}

function assertPlainObject_(value, reason) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw receiverError_(reason);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw receiverError_(reason);
  Object.keys(value).forEach(key => { if (DANGEROUS_KEYS.has(key)) throw receiverError_(reason); });
}

function assertExactKeys_(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = expected.slice().sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw receiverError_('unexpected_fields');
}

function requireUuid_(value, reason) {
  if (typeof value !== 'string' || !UUID_V4_PATTERN.test(value)) throw receiverError_(reason);
  return value;
}

function requireId_(value, reason) {
  if (typeof value !== 'string' || !SAFE_ID_PATTERN.test(value) || DANGEROUS_KEYS.has(value)) throw receiverError_(reason);
  return value;
}

function requireSafeString_(value, maxLength, reason) {
  if (typeof value !== 'string' || value.length > maxLength || CONTROL_CHARACTER_PATTERN.test(value)) throw receiverError_(reason);
  return value;
}

function requireNick_(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_NICK_LENGTH || CONTROL_CHARACTER_PATTERN.test(value)) throw receiverError_('invalid_nick');
  return value;
}

function requireInteger_(value, min, max, reason) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw receiverError_(reason);
  return value;
}

function requireFinite_(value, min, max, reason) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw receiverError_(reason);
  return value;
}

function requireIsoDate_(value, reason) {
  if (typeof value !== 'string' || value.length > 64 || !Number.isFinite(Date.parse(value))) throw receiverError_(reason);
  return value;
}

function positiveInteger_(value, reason) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw receiverError_(reason);
  return number;
}

function round2_(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function dateOrBlank_(value) { return value ? new Date(value) : ''; }

function safeSheetText_(value) {
  const text = String(value == null ? '' : value);
  return FORMULA_PREFIX_PATTERN.test(text) ? `'${text}` : text;
}

function receiverError_(reason) {
  const error = new Error(reason);
  error.publicReason = reason;
  return error;
}

function publicReason_(error) {
  return error && typeof error.publicReason === 'string' ? error.publicReason : 'internal_error';
}

function jsonResponse_(body) {
  const clean = {};
  Object.keys(body).forEach(key => { if (body[key] !== undefined) clean[key] = body[key]; });
  return ContentService.createTextOutput(JSON.stringify(clean)).setMimeType(ContentService.MimeType.JSON);
}

function runSelfTests() {
  const results = [];
  const test = (name, fn) => {
    try { fn(); results.push({ name, ok: true }); }
    catch (error) { results.push({ name, ok: false, error: String(error && error.message || error) }); }
  };
  test('safe sheet formula', () => { if (safeSheetText_('=1+1') !== "'=1+1") throw new Error('formula'); });
  test('origin normalization', () => { if (normalizeOrigin_('https://Example.COM/') !== 'https://example.com') throw new Error('origin'); });
  test('uuid validation', () => requireUuid_('123e4567-e89b-42d3-a456-426614174000', 'uuid'));
  test('reject bad uuid', () => { let failed = false; try { requireUuid_('bad', 'uuid'); } catch (_) { failed = true; } if (!failed) throw new Error('accepted'); });
  test('reject dangerous id', () => { let failed = false; try { requireId_('__proto__', 'id'); } catch (_) { failed = true; } if (!failed) throw new Error('accepted'); });
  test('daily invariant', () => validateDailyStats_([{ day: '2026-09-01', activeSeconds: 10, sessions: 1, taskToggles: 1, favoriteToggles: 0, categoryToggles: 0, linkCommits: 0, exports: 0, importAttempts: 0, importSuccesses: 0, resets: 0 }]));
  test('supabase secret rejected from invalid shape', () => { if (/^sb_secret_[A-Za-z0-9_-]{20,}$/.test('anon')) throw new Error('accepted'); });
  return { ok: results.every(result => result.ok), count: results.length, results };
}
