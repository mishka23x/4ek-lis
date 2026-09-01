import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const wrapper = read('checklist.js');
const core = read('checklist-core.js');
const analytics = read('analytics.js');
const faqWrapper = read('faq.js');
const faqCore = read('faq-core.js');
const apps = read('google-apps-script/Code.gs');
const manifest = JSON.parse(read('google-apps-script/appsscript.json'));
const sql = read('supabase/schema.sql');

new vm.Script(wrapper, { filename: 'checklist.js' });
new vm.Script(core, { filename: 'checklist-core.js' });
new vm.Script(analytics, { filename: 'analytics.js' });
new vm.Script(faqWrapper, { filename: 'faq.js' });
new vm.Script(faqCore, { filename: 'faq-core.js' });
new vm.Script(apps, { filename: 'Code.gs' });

assert(wrapper.includes("checklist-core.js") && wrapper.includes("analytics.js"), 'checklist loader must load core then analytics');
assert(faqWrapper.includes("faq-core.js"), 'FAQ loader must preserve hardened core renderer');
assert(analytics.includes("final_analytics") && analytics.includes("participantId") && analytics.includes("dailyStats"), 'rich analytics schema missing');
assert(analytics.includes("uniqueValidLinkCount") && analytics.includes("duplicateLinkCount") && analytics.includes("invalidLinkCount"), 'link aggregates missing');
assert(!analytics.includes('navigator.userAgent'), 'raw User-Agent must not be collected');
assert(!analytics.includes('SUPABASE_SECRET_KEY') && !analytics.includes('sb_secret_'), 'Supabase secret must never exist in browser code');
assert(apps.includes("SUPABASE_SECRET_KEY") && apps.includes("apikey: config.secretKey"), 'Apps Script server-side Supabase key handling missing');
assert(!apps.includes("Authorization: `Bearer ${config.secretKey}`"), 'modern Supabase secret must not be sent as a bearer JWT');
assert(manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.external_request'), 'Apps Script external request scope missing');
assert(sql.includes('enable row level security'), 'Supabase RLS missing');
assert(sql.includes('revoke all') && sql.includes('from public, anon, authenticated'), 'browser-role privilege revocation missing');
assert(sql.includes('ingest_analytics_submission') && sql.includes('security definer'), 'transactional ingestion RPC missing');
assert(sql.includes('primary key') && sql.includes('submission_id uuid primary key'), 'submission idempotency primary key missing');
assert(sql.includes('analytics_task_popularity') && sql.includes('analytics_daily_engagement'), 'analytics views missing');

console.log('Analytics static checks passed.');
