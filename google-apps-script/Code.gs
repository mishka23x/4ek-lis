'use strict';

/**
 * Dependency-free Google Apps Script receiver for the 4ek-lis static client.
 *
 * Security boundary:
 * - This is an anonymous public endpoint. It cannot authenticate a person or
 *   keep any value shipped by the browser secret.
 * - sourceOrigin is an allowlisted anti-accident signal, not authentication.
 * - Durable UUID idempotency, strict schema validation, a script lock, bounded
 *   input, and global rate controls protect data integrity and owner quotas.
 */

const RECEIVER_VERSION = '1.0.0';
const RECEIVER_SCHEMA_VERSION = 1;
const MAX_BODY_BYTES = 8192;
const MAX_NICK_LENGTH = 512;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const FORMULA_PREFIX_PATTERN = /^[=+\-@]/;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Owner-editable, non-secret bootstrap configuration.
 *
 * Leave spreadsheetId empty to let setupReceiver() create a spreadsheet.
 * If the static site moves, add the exact location.origin value here.
 * Keep the template map synchronized with checklist.html appConfig.
 */
const OWNER_SETUP = Object.freeze({
  spreadsheetId: '',
  spreadsheetName: '4ek-lis final statistics',
  sheetName: 'Final statistics',
  allowedOrigins: Object.freeze([
    'https://365grain.github.io',
  ]),
  templateTaskLimits: Object.freeze({
    '2026-11-22': 289,
  }),
  maxRequestsPerMinute: 30,
  maxRequestsPerHour: 500,
});

const PROPERTY_KEYS = Object.freeze({
  spreadsheetId: 'FOUR_FOX_SPREADSHEET_ID',
  sheetName: 'FOUR_FOX_SHEET_NAME',
  allowedOrigins: 'FOUR_FOX_ALLOWED_ORIGINS_JSON',
  templateTaskLimits: 'FOUR_FOX_TEMPLATE_TASK_LIMITS_JSON',
  maxRequestsPerMinute: 'FOUR_FOX_MAX_REQUESTS_PER_MINUTE',
  maxRequestsPerHour: 'FOUR_FOX_MAX_REQUESTS_PER_HOUR',
});

const SHEET_HEADERS = Object.freeze([
  'server_timestamp_utc',
  'submission_id',
  'template_version',
  'source_origin',
  'nickname',
  'checked_count',
  'receiver_version',
  'schema_version',
]);

/**
 * Run once as the owner. Creates or opens the destination spreadsheet, stores
 * configuration in Script Properties, and prepares the destination sheet.
 * Returns IDs/URLs only to the owner who runs this editor function.
 */
function setupReceiver() {
  validateOwnerSetup_();
  const spreadsheet = OWNER_SETUP.spreadsheetId
    ? SpreadsheetApp.openById(OWNER_SETUP.spreadsheetId)
    : SpreadsheetApp.create(OWNER_SETUP.spreadsheetName);

  PropertiesService.getScriptProperties().setProperties({
    [PROPERTY_KEYS.spreadsheetId]: spreadsheet.getId(),
    [PROPERTY_KEYS.sheetName]: OWNER_SETUP.sheetName,
    [PROPERTY_KEYS.allowedOrigins]: JSON.stringify(OWNER_SETUP.allowedOrigins),
    [PROPERTY_KEYS.templateTaskLimits]: JSON.stringify(OWNER_SETUP.templateTaskLimits),
    [PROPERTY_KEYS.maxRequestsPerMinute]: String(OWNER_SETUP.maxRequestsPerMinute),
    [PROPERTY_KEYS.maxRequestsPerHour]: String(OWNER_SETUP.maxRequestsPerHour),
  }, false);

  const sheet = ensureDestinationSheet_(spreadsheet, OWNER_SETUP.sheetName);
  return {
    ok: true,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    sheetName: sheet.getName(),
    receiverVersion: RECEIVER_VERSION,
  };
}

/**
 * Safe public health response. It intentionally exposes no spreadsheet ID,
 * configuration values, quotas, or submitted data.
 */
function doGet() {
  let configured = false;
  try {
    getRuntimeConfig_();
    configured = true;
  } catch (_) {
    configured = false;
  }
  return jsonResponse_({
    ok: true,
    service: '4ek-lis-final-statistics',
    receiverVersion: RECEIVER_VERSION,
    schemaVersion: RECEIVER_SCHEMA_VERSION,
    configured,
  });
}

/**
 * Receives one aggregate final submission. Apps Script TextOutput responses do
 * not provide application-controlled HTTP status codes, so callers must check
 * the JSON `ok` field and stable `reason` code.
 */
function doPost(event) {
  try {
    const config = getRuntimeConfig_();
    const payload = parseAndValidateRequest_(event, config);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return jsonResponse_({ ok: false, reason: 'busy' });

    try {
      if (!consumeRateBudget_(config)) {
        return jsonResponse_({ ok: false, reason: 'rate_limited' });
      }
      const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
      const sheet = ensureDestinationSheet_(spreadsheet, config.sheetName);
      if (hasSubmissionId_(sheet, payload.submissionId)) {
        return jsonResponse_({
          ok: true,
          duplicate: true,
          submissionId: payload.submissionId,
        });
      }

      const serverTimestamp = new Date();
      const row = [[
        serverTimestamp,
        safeSheetText_(payload.submissionId),
        safeSheetText_(payload.templateVersion),
        safeSheetText_(payload.sourceOrigin),
        safeSheetText_(payload.nick),
        payload.checkedCount,
        RECEIVER_VERSION,
        payload.schemaVersion,
      ]];
      sheet.getRange(sheet.getLastRow() + 1, 1, 1, SHEET_HEADERS.length).setValues(row);
      return jsonResponse_({
        ok: true,
        duplicate: false,
        submissionId: payload.submissionId,
        receivedAt: serverTimestamp.toISOString(),
      });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error(`4ek-lis receiver error: ${error && error.stack ? error.stack : String(error)}`);
    return jsonResponse_({
      ok: false,
      reason: publicReason_(error),
    });
  }
}

function parseAndValidateRequest_(event, config) {
  if (!event || !event.postData) throw receiverError_('invalid_request');
  const contentLength = Number(event.contentLength);
  if (!Number.isFinite(contentLength) || contentLength < 2 || contentLength > MAX_BODY_BYTES) {
    throw receiverError_('invalid_size');
  }
  const mediaType = String(event.postData.type || '').split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'text/plain' && mediaType !== 'application/json') {
    throw receiverError_('invalid_content_type');
  }
  const body = String(event.postData.contents || '');
  if (Utilities.newBlob(body).getBytes().length > MAX_BODY_BYTES) {
    throw receiverError_('invalid_size');
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (_) {
    throw receiverError_('invalid_json');
  }
  return validatePayload_(payload, config);
}

function validatePayload_(payload, config) {
  assertPlainObject_(payload, 'invalid_payload');
  assertExactKeys_(payload, [
    'schemaVersion',
    'type',
    'submissionId',
    'templateVersion',
    'sourceOrigin',
    'nick',
    'checkedCount',
  ]);

  if (payload.schemaVersion !== RECEIVER_SCHEMA_VERSION) throw receiverError_('unsupported_schema');
  if (payload.type !== 'final') throw receiverError_('invalid_type');
  if (typeof payload.submissionId !== 'string' || !UUID_V4_PATTERN.test(payload.submissionId)) {
    throw receiverError_('invalid_submission_id');
  }
  if (typeof payload.templateVersion !== 'string' || !Object.prototype.hasOwnProperty.call(config.templateTaskLimits, payload.templateVersion)) {
    throw receiverError_('unsupported_template');
  }
  if (typeof payload.sourceOrigin !== 'string' || !config.allowedOrigins.includes(normalizeOrigin_(payload.sourceOrigin))) {
    throw receiverError_('origin_not_allowed');
  }
  if (typeof payload.nick !== 'string' || payload.nick.length < 1 || payload.nick.length > MAX_NICK_LENGTH || CONTROL_CHARACTER_PATTERN.test(payload.nick)) {
    throw receiverError_('invalid_nick');
  }
  const maximum = config.templateTaskLimits[payload.templateVersion];
  if (!Number.isSafeInteger(payload.checkedCount) || payload.checkedCount < 0 || payload.checkedCount > maximum) {
    throw receiverError_('invalid_checked_count');
  }

  return {
    schemaVersion: payload.schemaVersion,
    type: payload.type,
    submissionId: payload.submissionId.toLowerCase(),
    templateVersion: payload.templateVersion,
    sourceOrigin: normalizeOrigin_(payload.sourceOrigin),
    nick: payload.nick.trim() || 'аноним',
    checkedCount: payload.checkedCount,
  };
}

function getRuntimeConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty(PROPERTY_KEYS.spreadsheetId);
  const sheetName = properties.getProperty(PROPERTY_KEYS.sheetName);
  if (!spreadsheetId || !sheetName) throw receiverError_('not_configured');

  let allowedOrigins;
  let templateTaskLimits;
  try {
    allowedOrigins = JSON.parse(properties.getProperty(PROPERTY_KEYS.allowedOrigins) || '[]');
    templateTaskLimits = JSON.parse(properties.getProperty(PROPERTY_KEYS.templateTaskLimits) || '{}');
  } catch (_) {
    throw receiverError_('invalid_configuration');
  }
  validateOriginList_(allowedOrigins);
  validateTemplateLimits_(templateTaskLimits);
  return {
    spreadsheetId,
    sheetName,
    allowedOrigins: allowedOrigins.map(normalizeOrigin_),
    templateTaskLimits,
    maxRequestsPerMinute: positiveInteger_(properties.getProperty(PROPERTY_KEYS.maxRequestsPerMinute), 'invalid_configuration'),
    maxRequestsPerHour: positiveInteger_(properties.getProperty(PROPERTY_KEYS.maxRequestsPerHour), 'invalid_configuration'),
  };
}

function validateOwnerSetup_() {
  if (OWNER_SETUP.spreadsheetId && !/^[a-zA-Z0-9_-]{20,}$/.test(OWNER_SETUP.spreadsheetId)) {
    throw new Error('OWNER_SETUP.spreadsheetId is not a valid spreadsheet ID');
  }
  if (typeof OWNER_SETUP.spreadsheetName !== 'string' || !OWNER_SETUP.spreadsheetName.trim()) {
    throw new Error('OWNER_SETUP.spreadsheetName is required');
  }
  if (typeof OWNER_SETUP.sheetName !== 'string' || !OWNER_SETUP.sheetName.trim()) {
    throw new Error('OWNER_SETUP.sheetName is required');
  }
  validateOriginList_(OWNER_SETUP.allowedOrigins);
  validateTemplateLimits_(OWNER_SETUP.templateTaskLimits);
  positiveInteger_(OWNER_SETUP.maxRequestsPerMinute, 'Invalid minute rate limit');
  positiveInteger_(OWNER_SETUP.maxRequestsPerHour, 'Invalid hour rate limit');
}

function validateOriginList_(origins) {
  if (!Array.isArray(origins) || !origins.length || origins.length > 20) {
    throw receiverError_('invalid_configuration');
  }
  origins.forEach(origin => {
    if (typeof origin !== 'string' || normalizeOrigin_(origin) !== origin.replace(/\/$/, '')) {
      throw receiverError_('invalid_configuration');
    }
  });
}

function validateTemplateLimits_(limits) {
  assertPlainObject_(limits, 'invalid_configuration');
  const versions = Object.keys(limits);
  if (!versions.length || versions.length > 50) throw receiverError_('invalid_configuration');
  versions.forEach(version => {
    if (DANGEROUS_KEYS.has(version) || version.length < 1 || version.length > 100) throw receiverError_('invalid_configuration');
    if (!Number.isSafeInteger(limits[version]) || limits[version] < 1 || limits[version] > 10000) {
      throw receiverError_('invalid_configuration');
    }
  });
}

function ensureDestinationSheet_(spreadsheet, name) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setValues([SHEET_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setFontWeight('bold');
  } else {
    const existingHeaders = sheet.getRange(1, 1, 1, SHEET_HEADERS.length).getDisplayValues()[0];
    if (JSON.stringify(existingHeaders) !== JSON.stringify(SHEET_HEADERS)) {
      throw receiverError_('sheet_schema_mismatch');
    }
  }
  return sheet;
}

function hasSubmissionId_(sheet, submissionId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  return sheet
    .getRange(2, 2, lastRow - 1, 1)
    .createTextFinder(submissionId)
    .matchEntireCell(true)
    .matchCase(false)
    .findNext() !== null;
}

function consumeRateBudget_(config) {
  const cache = CacheService.getScriptCache();
  const now = Date.now();
  const minuteBucket = Math.floor(now / 60000);
  const hourBucket = Math.floor(now / 3600000);
  return incrementBudget_(cache, `minute:${minuteBucket}`, config.maxRequestsPerMinute, 120)
    && incrementBudget_(cache, `hour:${hourBucket}`, config.maxRequestsPerHour, 7200);
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

function safeSheetText_(value) {
  const text = String(value);
  return FORMULA_PREFIX_PATTERN.test(text) ? `'${text}` : text;
}

function assertPlainObject_(value, reason) {
  if (!value || Object.prototype.toString.call(value) !== '[object Object]') throw receiverError_(reason);
}

function assertExactKeys_(object, expectedKeys) {
  const expected = expectedKeys.slice().sort();
  const actual = Object.keys(object).sort();
  if (actual.some(key => DANGEROUS_KEYS.has(key)) || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw receiverError_('unexpected_fields');
  }
}

function positiveInteger_(value, reason) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 1000000) throw receiverError_(reason);
  return parsed;
}

function receiverError_(reason) {
  const error = new Error(reason);
  error.publicReason = reason;
  return error;
}

function publicReason_(error) {
  return error && typeof error.publicReason === 'string' ? error.publicReason : 'internal_error';
}

function jsonResponse_(object) {
  return ContentService
    .createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Owner-run, side-effect-free validation tests. Run this before setup/deploy.
 */
function runSelfTests() {
  const config = {
    allowedOrigins: ['https://365grain.github.io'],
    templateTaskLimits: { '2026-11-22': 289 },
  };
  const valid = {
    schemaVersion: 1,
    type: 'final',
    submissionId: '123e4567-e89b-42d3-a456-426614174000',
    templateVersion: '2026-11-22',
    sourceOrigin: 'https://365grain.github.io',
    nick: '4ek-lis',
    checkedCount: 42,
  };
  const tests = [];
  tests.push(validatePayload_(valid, config).checkedCount === 42);
  tests.push(['=1+1', '+1+1', '-1+1', '@SUM(A1:A2)'].every(value => safeSheetText_(value).startsWith("'")));
  tests.push(expectReason_(() => validatePayload_(Object.assign({}, valid, { extra: true }), config), 'unexpected_fields'));
  tests.push(expectReason_(() => validatePayload_(Object.assign({}, valid, { sourceOrigin: 'https://example.com' }), config), 'origin_not_allowed'));
  tests.push(expectReason_(() => validatePayload_(Object.assign({}, valid, { checkedCount: 290 }), config), 'invalid_checked_count'));
  tests.push(expectReason_(() => validatePayload_(Object.assign({}, valid, { submissionId: 'not-a-uuid' }), config), 'invalid_submission_id'));
  tests.push(expectReason_(() => validatePayload_(Object.assign({}, valid, { nick: 'line\nbreak' }), config), 'invalid_nick'));
  tests.push(expectReason_(() => validatePayload_(Object.assign({}, valid, { templateVersion: 'unknown' }), config), 'unsupported_template'));
  tests.push(expectReason_(() => validatePayload_(Object.assign({}, valid, { checkedCount: 1.5 }), config), 'invalid_checked_count'));
  tests.push(expectReason_(() => validatePayload_(Object.assign({}, valid, { type: 'preview' }), config), 'invalid_type'));
  tests.push(expectReason_(() => validatePayload_(Object.assign({}, valid, { schemaVersion: 2 }), config), 'unsupported_schema'));
  tests.push(validatePayload_(Object.assign({}, valid, { sourceOrigin: 'https://365grain.github.io/' }), config).sourceOrigin === 'https://365grain.github.io');
  if (tests.some(result => result !== true)) throw new Error('Receiver self-tests failed');
  return { ok: true, tests: tests.length, receiverVersion: RECEIVER_VERSION };
}

function expectReason_(callback, reason) {
  try {
    callback();
    return false;
  } catch (error) {
    return publicReason_(error) === reason;
  }
}
