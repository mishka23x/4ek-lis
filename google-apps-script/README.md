# Google Apps Script analytics gateway

This folder contains the server-side gateway used by the static GitHub Pages client. It validates one rich **derived analytics snapshot**, writes normalized Google Sheets tabs, and can mirror the same validated snapshot into Supabase PostgreSQL.

## Security rules

- Never put Supabase credentials in `checklist.html`, `analytics.js`, GitHub secrets exposed to Pages, or any public file.
- Use a modern Supabase `sb_secret_...` key only in Apps Script **Script Properties**.
- The browser never sends actual post URLs or post/task/category text.
- The endpoint is anonymous; validation/rate limits/idempotency reduce abuse but do not authenticate a person.

## 1. Create Apps Script project

1. Create a standalone project at Google Apps Script.
2. Replace `Code.gs` with this repository's `Code.gs`.
3. Enable the manifest in Project Settings.
4. Replace `appsscript.json` with the repository version.
5. Run `runSelfTests()`.
6. Run `setupReceiver()` and authorize Sheets + external-request permissions.

`setupReceiver()` creates/validates these tabs:

- `Submissions`
- `Categories`
- `Tasks`
- `Quotas`
- `Daily`

## 2. Supabase Script Properties

After running `supabase/schema.sql`, add these **Script Properties** in Apps Script Project Settings:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_REQUIRED=false
```

Run `validateSupabaseConfiguration()`.

Keep `SUPABASE_REQUIRED=false` during staging so Sheets remains usable while Supabase is being verified. After a successful end-to-end test, set:

```text
SUPABASE_REQUIRED=true
```

The gateway sends the secret only in the server-side `apikey` header. It is never returned by `doGet()` or public error responses.

## 3. Deploy web app

Deploy → New deployment → Web app.

- Execute as: deploying owner.
- Access: the intended public/anonymous option.
- Copy the URL ending in `/exec`.
- Do not use `/dev` in the client.

## 4. Enable client only after staging

Update only `appConfig` in `checklist.html`:

```json
{
  "templateVersion": "2026-11-22",
  "challengeCategoryName": "Челленджи",
  "challengeCompleteThreshold": 10,
  "finalStatsEnabled": true,
  "finalStatsUrl": "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
}
```

## 5. Acceptance test

Use synthetic data and verify:

1. Apps Script returns `ok:true`.
2. `sinks.sheets:true` and, after Supabase is configured, `sinks.supabase:true`.
3. One row appears in `Submissions`.
4. 21 category rows, 289 task rows and 8 quota rows appear for the current template.
5. Daily rows match the snapshot's locally accumulated active days.
6. Supabase has one matching `analytics_submissions` record and child rows.
7. Re-send the exact same `submissionId`: neither sink creates a second dataset.
8. Unknown fields, malformed UUIDs, wrong aggregate totals, broken link invariants and disallowed origins are rejected.
9. Nicknames beginning with spreadsheet-formula prefixes are stored as text in Sheets.
10. Actual user post URLs never appear in the request payload, Sheets or Supabase.

## 6. Partial sink retry

If Sheets succeeds and Supabase fails, or vice versa, the gateway returns `ok:false` when the failed sink is required. The browser retains the same pending UUID. Retrying is safe because:

- Sheets checks the submission UUID before writing.
- Supabase RPC uses `submission_id` as its primary idempotency key and returns duplicate success.

## 7. Operations

- Monitor Apps Script Executions and Supabase database usage.
- Rotate the Supabase secret immediately if exposed.
- Keep the secret out of logs.
- Update `OWNER_SETUP.templatePolicies` when the release template changes task/category/quota counts.
- Review allowed origins when preview/production hosts change.
- Decide retention/deletion policy for pseudonymous analytics and nicknames.
