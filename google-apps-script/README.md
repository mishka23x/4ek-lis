# Google Apps Script analytics gateway

This folder is the server-side gateway for the static GitHub Pages client. It validates one rich **derived analytics snapshot**, writes normalized Google Sheets tabs, and can mirror the same validated snapshot to Supabase PostgreSQL.

## Security rules

- Never put Supabase credentials in public HTML/JS or the repository.
- Use a modern `sb_secret_...` key only in Apps Script **Script Properties**.
- The browser never sends actual post URLs or post/task/category text.
- The endpoint is anonymous; validation/rate limits/idempotency do not authenticate a human.

## 1. Create the Apps Script project

1. Create a standalone project at Google Apps Script.
2. Replace `Code.gs` with this folder's `Code.gs`.
3. Add a second script file named `Compat.gs` and copy this folder's `Compat.gs` into it. This is required because Apps Script V8 does not expose the browser `URL` Web API.
4. Enable the manifest in Project Settings and replace `appsscript.json`.
5. Run `runSelfTests()`.
6. Run `setupReceiver()` and authorize Sheets + external-request permissions.

`setupReceiver()` creates/validates:

- `Submissions`
- `Categories`
- `Tasks`
- `Quotas`
- `Daily`

## 2. Configure Supabase in Script Properties

After running `supabase/schema.sql`, add:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_REQUIRED=false
```

Run `validateSupabaseConfiguration()`.

Keep `SUPABASE_REQUIRED=false` during staging. After a successful dual-sink test, set:

```text
SUPABASE_REQUIRED=true
```

The gateway sends the secret only in the server-side `apikey` header. It is never returned by `doGet()` or public errors.

## 3. Deploy

Deploy → New deployment → Web app.

- Execute as: deploying owner.
- Access: intended anonymous/public option.
- Copy the URL ending in `/exec`.
- Never use `/dev` in the production client.

## 4. Enable the client after staging

Update only the `appConfig` JSON in `checklist.html`:

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
2. `sinks.sheets:true` and, once configured, `sinks.supabase:true`.
3. Exactly one parent submission exists in each sink.
4. Current template produces 21 category rows, 289 task rows and 8 quota rows.
5. Daily rows match the snapshot.
6. Re-sending the same `submissionId` creates no duplicate dataset.
7. Unknown fields, malformed UUIDs, inconsistent aggregates and disallowed origins are rejected.
8. Formula-leading nickname text is stored as text in Sheets.
9. Actual user post URLs never appear in the request, Sheets or Supabase.

## 6. Partial sink retry

If one sink succeeds and the other fails, the browser retains the same pending UUID. Retrying is safe:

- Sheets checks `submissionId` before writing.
- Supabase uses `submission_id` as the primary idempotency key.

## 7. Operations

- Monitor Apps Script Executions and Supabase usage.
- Rotate the Supabase secret immediately if exposed.
- Keep secrets out of logs.
- Update `OWNER_SETUP.templatePolicies` when task/category/quota counts change.
- Review allowed origins when preview/production hosts change.
- Define retention/deletion/access policy for nicknames and pseudonymous analytics.
