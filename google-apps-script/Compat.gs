'use strict';

/**
 * Minimal URL constructor compatibility for Google Apps Script V8, which does
 * not expose the browser URL Web API. Code.gs only needs `.hostname` after its
 * own strict HTTPS Supabase URL validation.
 */
function URL(value) {
  const match = String(value || '').match(/^https:\/\/([^/]+)(?:\/|$)/i);
  if (!match) throw new Error('invalid_url');
  this.hostname = match[1].toLowerCase();
}
