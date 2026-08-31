# Google Apps Script receiver setup

This folder is the dependency-free receiver for the checklist's optional final-season submission. The browser sends one aggregate record: nickname, template version, source-origin signal, submission UUID, and number of checked tasks. It does **not** send entered links, task text, categories, the imported backup, or the rest of local progress.

The endpoint is intentionally anonymous. No token embedded in a static page can be a secret. The receiver therefore uses strict schema and size validation, a configured template/count allowlist, durable submission-ID deduplication, a script lock, formula-safe spreadsheet values, and global quota-oriented rate limits. These controls reduce accidental and bulk abuse; they do not prove a person's identity or stop a determined distributed attacker.

## 1. Create the Apps Script project

1. Open <https://script.google.com/> and create a new standalone project.
2. Replace its `Code.gs` with this folder's `Code.gs`.
3. In Project Settings, enable **Show `appsscript.json` manifest file in editor**.
4. Replace the manifest with this folder's `appsscript.json`.

The manifest uses the V8 runtime and only the Google Sheets OAuth scope.

## 2. Review the owner configuration

At the top of `Code.gs`, review `OWNER_SETUP`:

- Leave `spreadsheetId` empty to create a new spreadsheet automatically, or paste an existing Google Sheets file ID.
- Keep `allowedOrigins` as exact `location.origin` values. The GitHub Pages production origin is already included. Add an exact HTTPS origin if the static files move to another host.
- Keep `templateTaskLimits` synchronized with `appConfig.templateVersion` and the number of tasks in `checklist.html`.
- Adjust the global minute/hour budgets conservatively for the owner's Apps Script quotas.

None of these values is a secret. Do not add passwords, OAuth tokens, private keys, or reusable server secrets to the static client.

## 3. Run local script checks in the Apps Script editor

1. Select `runSelfTests` and click **Run**. It should return an object with `ok: true` and twelve tests.
2. Select `setupReceiver` and click **Run**.
3. Complete the owner authorization prompt.
4. Inspect the returned object or execution log. Open `spreadsheetUrl` and verify the header row.

`setupReceiver` stores runtime configuration in Script Properties and is safe to rerun. If an existing destination sheet has different headers, it stops instead of overwriting it.

## 4. Deploy the public web app

1. Choose **Deploy → New deployment → Web app**.
2. Set **Execute as** to the deploying owner.
3. Set access to the option that permits the intended anonymous public users (normally **Anyone**; exact wording can depend on account/domain policy).
4. Deploy and copy the URL ending in `/exec`.

Do not put a `/dev` URL in the checklist. Google documents `/dev` as an editor-only test deployment.

## 5. Connect and activate the static client

In `checklist.html`, edit only the `appConfig` JSON block:

```json
{
  "templateVersion": "2026-11-22",
  "challengeCategoryName": "Челленджи",
  "challengeCompleteThreshold": 10,
  "finalStatsEnabled": true,
  "finalStatsUrl": "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
}
```

The final-send wrapper remains hidden unless both the flag is `true` and the endpoint is an HTTPS `script.google.com` URL ending in `/exec`. No build step is required; deploy the static files exactly as normal.

## 6. Staging acceptance before production

Use a separate spreadsheet/deployment first. Submit a clearly synthetic checklist record and verify:

- the browser receives JSON with `ok: true`;
- exactly one row appears;
- repeating the same UUID returns `duplicate: true` without adding a row;
- unknown fields, bad UUIDs, unsupported templates/origins, and out-of-range counts are rejected;
- nickname text beginning with `=`, `+`, `-`, or `@` is stored as text rather than evaluated as a formula;
- concurrent submissions do not duplicate IDs;
- rate-limit rejection returns `reason: "rate_limited"`;
- the Apps Script execution dashboard shows no unexpected failures.

The production client uses `text/plain` for a CORS-simple POST and follows the Apps Script web-app redirect. Error responses are JSON objects; Apps Script `TextOutput` does not let this script assign conventional application HTTP status codes, so the client checks the `ok` field.

## 7. Operations and updates

- Apps Script and Sheets quotas vary by account type and can change. Monitor the Apps Script **Executions** dashboard and spreadsheet growth.
- The cache-based rate budget is global and deliberately approximate; durable replay protection comes from the UUID column in the sheet.
- Apps Script's request event does not expose a trustworthy client IP or authenticated user for this anonymous deployment. `sourceOrigin` is client-asserted and only an anti-accident signal.
- To add a season/template, update `OWNER_SETUP.templateTaskLimits`, rerun `setupReceiver`, create a new deployment version, and update the client's template version only when its task count is correct.
- To disable collection immediately, set `finalStatsEnabled` to `false` in the static client. The receiver can remain deployed while the control is hidden.
- Keep older deployment versions only as long as rollback requires; Apps Script limits the number of versions.

Official references:

- [Apps Script web apps and `/exec` versus `/dev`](https://developers.google.com/apps-script/guides/web)
- [PropertiesService](https://developers.google.com/apps-script/reference/properties/properties-service)
- [LockService](https://developers.google.com/apps-script/reference/lock/lock-service)
- [CacheService](https://developers.google.com/apps-script/reference/cache/cache-service)
- [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)
- [V8 runtime](https://developers.google.com/apps-script/guides/v8-runtime)
