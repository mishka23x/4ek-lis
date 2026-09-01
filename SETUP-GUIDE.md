# 4ek-lis deployment & analytics setup guide

> **English:** [English guide](#english-guide) · **Русский:** [Русская инструкция](#русская-инструкция)
>
> Last reviewed against current GitHub Pages, Google Apps Script and Supabase interfaces: **2026-09-01**.
>
> This guide assumes the code is in `mishka23x/4ek-lis:main`. Analytics ships **disabled by default**. Complete the steps in order and do not place any Supabase secret in GitHub, HTML or browser JavaScript.

---

<a id="english-guide"></a>

# English guide

## 0. Architecture and security rules before you start

The intended deployment is:

```text
GitHub Pages
   |
   | derived/pseudonymous analytics only
   v
Google Apps Script Web App (/exec)
   |
   +--> normalized Google Sheets
   |
   +--> Supabase PostgreSQL
```

Keep these rules throughout setup:

1. **Never** put `sb_secret_...` in this repository, `checklist.html`, `analytics.js`, browser devtools snippets, URLs or query parameters.
2. The browser must call **Apps Script only**. It must not call Supabase directly.
3. Use a current Supabase **Secret key** (`sb_secret_...`) for Apps Script, not a publishable/anon key for this backend ingestion path.
4. Keep analytics disabled on the public checklist until the full dual-sink staging test passes.
5. Use an Apps Script Web App URL ending in **`/exec`** for production. `/dev` is editor-only testing.
6. If a Workspace/domain account does not offer anonymous/public Web App access, this anonymous GitHub Pages architecture cannot receive public submissions through that account. Use an account/policy that permits the intended public Web App or replace the gateway architecture.

Repository files used during setup:

```text
checklist.html
analytics.js

google-apps-script/
  Code.gs
  Compat.gs
  appsscript.json

supabase/
  schema.sql
```

---

## 1. Verify the fork and optionally publish the safe baseline on GitHub Pages

At this point analytics is still disabled, so publishing `main` is safe.

### GitHub web interface

1. Open `mishka23x/4ek-lis`.
2. Open **Settings**.
3. In the left sidebar under **Code, planning, and automation**, open **Pages**.
4. Under **Build and deployment**:
   - **Source** → `Deploy from a branch`
   - **Branch** → `main`
   - **Folder** → `/(root)`
5. Click **Save**.
6. When GitHub finishes the Pages deployment, use **Visit site** if shown.

Expected project-site URL:

```text
https://mishka23x.github.io/4ek-lis/
```

Checklist page:

```text
https://mishka23x.github.io/4ek-lis/checklist.html
```

Because analytics is disabled in the repository defaults, the site should behave like the normal browser-local checklist and should not send analytics yet.

Official reference:

- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

---

## 2. Create the Supabase Free project

1. Sign in to the Supabase Dashboard.
2. Create a **New project** in the organization you want to own the analytics database.
3. Enter the requested project details.
4. Choose the **Free** plan/Free project option when available.
5. Choose a region reasonably close to the expected users.
6. Create/save the database password in a password manager even though this GitHub Pages integration uses the Data API rather than a direct database password.
7. Create the project and wait until the database is ready.

Do not add any Supabase key to the Git repository.

Official starting point:

- https://supabase.com/dashboard

---

## 3. Install the PostgreSQL schema using `supabase/schema.sql`

The provided SQL creates the tables, constraints, RLS, privilege revocations, ingestion RPC and analytical views.

### Supabase UI

1. In the Supabase project, open **SQL Editor** in the left navigation.
2. Click **New Query**.
3. In GitHub, open:

```text
supabase/schema.sql
```

4. Copy the **entire** file.
5. Paste it into the Supabase SQL Editor.
6. Click **Run** (or use the SQL Editor run shortcut shown in the UI).
7. Confirm the query completes successfully.

The schema should create these core tables:

```text
analytics_submissions
analytics_categories
analytics_tasks
analytics_quotas
analytics_daily
```

and these analytical views:

```text
analytics_template_summary
analytics_task_popularity
analytics_category_performance
analytics_daily_engagement
```

and the ingestion function/RPC:

```text
ingest_analytics_submission
```

### Verification queries

Run the following in a new SQL Editor query:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename like 'analytics_%'
order by tablename;
```

You should see RLS enabled for the analytics tables.

Then:

```sql
select proname
from pg_proc
where proname = 'ingest_analytics_submission';
```

You should get one matching function.

You can also verify the views:

```sql
select table_name
from information_schema.views
where table_schema = 'public'
  and table_name like 'analytics_%'
order by table_name;
```

Official Supabase SQL Editor/function references:

- https://supabase.com/docs/guides/database/overview
- https://supabase.com/docs/guides/database/functions

---

## 4. Obtain the Supabase Project URL and backend Secret key

### Project URL

Use either of the current Supabase UI paths:

- the project's **Connect** dialog, or
- **Integrations → Data API** for the Data API URL.

The project URL normally looks like:

```text
https://YOUR_PROJECT_REF.supabase.co
```

### Secret key

1. In the Supabase project Dashboard, open **Settings → API Keys**.
2. Open the **Publishable and secret API keys** area/tab.
3. If the project does not have modern keys yet and the UI shows **Create new API Keys**, create them.
4. In **Secret keys**, copy a server-side Secret key beginning with:

```text
sb_secret_
```

5. Store it in a password manager until you add it to Apps Script Script Properties.

For this integration you do **not** need to expose a publishable key in GitHub Pages.

Why: a Supabase Secret key has elevated backend access and bypasses RLS. It belongs only in a trusted backend component.

Official reference:

- https://supabase.com/docs/guides/getting-started/api-keys

---

## 5. Create the Google Apps Script project

1. Open:

```text
https://script.google.com/
```

2. Click **New project**.
3. Rename the project to something clear, for example:

```text
4ek-lis analytics gateway
```

### Install `Code.gs`

1. Select the default `Code.gs` file in the Files panel.
2. Delete its starter content.
3. Open `google-apps-script/Code.gs` from this repository.
4. Copy the whole file and paste it into Apps Script `Code.gs`.

### Install `Compat.gs`

1. In the Apps Script Files panel, click the **+** control to add a file.
2. Choose a **Script** file.
3. Name it exactly:

```text
Compat
```

Apps Script displays it as `Compat.gs`.

4. Copy all content from:

```text
google-apps-script/Compat.gs
```

5. Paste it into `Compat.gs`.

`Compat.gs` is required because Apps Script V8 does not expose every browser Web API available in a normal browser/Node JavaScript environment.

### Expose and install `appsscript.json`

1. In the left sidebar, open **Project Settings**.
2. Enable:

```text
Show "appsscript.json" manifest file in editor
```

3. Return to the Editor/Files panel.
4. Open `appsscript.json`.
5. Replace its content with:

```text
google-apps-script/appsscript.json
```

The supplied manifest uses V8 and explicitly requests only the required scopes:

```text
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/script.external_request
```

Official references:

- https://developers.google.com/apps-script/concepts/manifests
- https://developers.google.com/apps-script/concepts/scopes

---

## 6. Review `OWNER_SETUP` in `Code.gs` before first setup

At the top of `Code.gs`, review:

```js
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
```

### `spreadsheetId`

Leave this empty:

```js
spreadsheetId: ''
```

if you want `setupReceiver()` to create a fresh spreadsheet automatically.

If you already created a dedicated spreadsheet, put only its Google Sheets file ID here.

### `allowedOrigins`

The fork GitHub Pages origin is already present:

```text
https://mishka23x.github.io
```

`location.origin` does not include `/4ek-lis`, so do not add the repository path.

The upstream GitHub Pages origin is also present:

```text
https://365grain.github.io
```

If you later use a custom domain, add the exact HTTPS origin before running/re-running `setupReceiver()`.

### `templatePolicies`

For the current template the policy must match:

```text
templateVersion: 2026-11-22
tasks: 289
categories: 21
quotas: 8
challenge threshold: 10
```

When a future season changes these values, update both the client template configuration and this policy.

### Rate limits

Current defaults:

```text
30 requests/minute
500 requests/hour
```

These are global best-effort limits suitable for the current anonymous community receiver. Adjust only with a clear reason and keep Apps Script quotas in mind.

Save all Apps Script files.

---

## 7. Run the Apps Script self-tests

1. In the Apps Script editor toolbar, open the function selector.
2. Select:

```text
runSelfTests
```

3. Click **Run**.
4. The execution should finish without a thrown error.

`runSelfTests()` checks important pure validation behavior such as UUID handling, formula safety, origin normalization, dangerous IDs, daily invariant handling and the expected Supabase secret-key shape.

For deeper local repository validation, also run on your development machine:

```powershell
node tests/check-static.mjs
node tests/check-analytics.mjs
```

Do not deploy if these checks fail.

---

## 8. Run `setupReceiver()` and authorize Google access

1. In the function selector choose:

```text
setupReceiver
```

2. Click **Run**.
3. Google will ask you to authorize the script because it needs Google Sheets access and external HTTP request permission.
4. Review the requested permissions and authorize the Apps Script project you created.
5. The function should complete successfully.

`setupReceiver()` will:

- create or open the analytics spreadsheet;
- save core runtime values into Script Properties;
- create/validate the five tabs:
  - `Submissions`
  - `Categories`
  - `Tasks`
  - `Quotas`
  - `Daily`

If `spreadsheetId` was empty, look in your Google Drive for a new spreadsheet named:

```text
4ek-lis analytics
```

You can also confirm that Project Settings → Script Properties now contains keys beginning with `FOUR_FOX_`, including the generated spreadsheet ID.

---

## 9. Add the Supabase settings to Apps Script Script Properties

Current Google Apps Script UI path:

1. Open the Apps Script project.
2. In the left sidebar click **Project Settings**.
3. Scroll to **Script Properties**.
4. For the first property click **Add script property**.
5. For additional properties, use **Edit script properties → Add script property** if that is how the UI presents subsequent entries.
6. Add exactly:

```text
Property: SUPABASE_URL
Value:    https://YOUR_PROJECT_REF.supabase.co
```

```text
Property: SUPABASE_SECRET_KEY
Value:    sb_secret_...
```

```text
Property: SUPABASE_REQUIRED
Value:    false
```

7. Click **Save script properties**.

Keep `SUPABASE_REQUIRED=false` during staging. This allows you to see and diagnose a Supabase problem without losing the already-valid Sheets path.

Never put the secret in `OWNER_SETUP`, GitHub or any public JavaScript file.

Official Script Properties UI reference:

- https://developers.google.com/apps-script/guides/properties

---

## 10. Validate the Supabase configuration from Apps Script

1. Return to the Apps Script editor.
2. Select:

```text
validateSupabaseConfiguration
```

3. Click **Run**.
4. The execution must complete without an error.

This validates the configured URL/secret shape server-side. The public client still has no Supabase credential.

If it fails:

- confirm `SUPABASE_URL` contains only the project base URL;
- confirm the key begins with `sb_secret_`;
- confirm there are no leading/trailing spaces;
- confirm `Compat.gs` was installed;
- confirm the manifest includes `script.external_request`.

---

## 11. Deploy Apps Script as the production Web App

Current Google UI flow:

1. At the top right of Apps Script, click **Deploy → New deployment**.
2. Next to **Select type**, click the deployment-type selector/settings icon.
3. Choose **Web app**.
4. Add a description, for example:

```text
4ek-lis analytics gateway v2
```

5. For **Execute as**, choose the deploying owner / **Me** so the script uses the owner-authorized Sheets and external-request permissions.
6. For **Who has access**, choose the option that allows the intended anonymous/public users, normally **Anyone** when available.
7. Click **Deploy**.
8. Complete any authorization prompt.
9. Copy the Web App URL.

The production URL must end in:

```text
/exec
```

Example shape:

```text
https://script.google.com/macros/s/DEPLOYMENT_ID/exec
```

Do **not** configure the public checklist with the `/dev` Test deployment URL. Google documents `/dev` as editor-only development testing.

Official reference:

- https://developers.google.com/apps-script/guides/web

---

## 12. Health-check the deployed gateway before enabling the client

Open the copied `/exec` URL directly in a browser.

Expected JSON should include fields similar to:

```json
{
  "ok": true,
  "service": "4ek-lis-analytics",
  "receiverVersion": "2.0.0",
  "schemaVersion": 2,
  "configured": true,
  "supabaseConfigured": true,
  "supabaseRequired": false
}
```

Do not continue if:

```text
configured = false
```

or:

```text
supabaseConfigured = false
```

If the browser is redirected to a Google login instead of receiving public JSON, the Web App access setting is not compatible with anonymous GitHub Pages users.

---

## 13. Stage the client before turning analytics on for public `main`

The safest approach is to test an enabled client on a temporary staging branch while `main` remains analytics-disabled.

### Recommended staging branch

From a local clone:

```powershell
git checkout main
git pull origin main
git switch -c staging/analytics-activation
```

Edit only the `appConfig` JSON block in `checklist.html`:

```json
{
  "templateVersion": "2026-11-22",
  "challengeCategoryName": "Челленджи",
  "challengeCompleteThreshold": 10,
  "finalStatsEnabled": true,
  "finalStatsUrl": "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
}
```

Commit and push the staging branch:

```powershell
git add checklist.html
git commit -m "test: enable analytics gateway in staging"
git push -u origin staging/analytics-activation
```

Temporarily point GitHub Pages at that branch:

```text
Repository → Settings → Pages
Source: Deploy from a branch
Branch: staging/analytics-activation
Folder: /(root)
Save
```

After validation, switch Pages back to `main` until production activation is committed.

### Alternative

You may use another isolated static host or a dedicated preview repository, but the page origin must be included in Apps Script's allowed-origin configuration.

---

## 14. Perform a synthetic end-to-end test

Use only synthetic test content.

On the staged checklist:

1. Enter a clearly synthetic nickname, for example:

```text
TEST-analytics-20260901
```

2. Check several tasks.
3. Favorite several tasks.
4. Set several quota values.
5. For link tests use harmless test URLs such as:

```text
https://example.com/test-1
https://example.com/test-2
```

6. Intentionally create:
   - one valid unique URL;
   - one duplicate URL;
   - one invalid value if you want to exercise invalid-link analytics.
7. Perform several category collapse/expand operations.
8. Click the final-season analytics send control when it is visible.

A successful response/status should indicate both sinks, conceptually:

```text
Sheets: ✓
Supabase: ✓
```

The browser should **not** transmit the actual URLs themselves; only counts/statistics derived from them.

---

## 15. Verify Google Sheets

Open the `4ek-lis analytics` spreadsheet.

For one current-template successful submission, verify:

### `Submissions`

- exactly one parent row for the submission UUID;
- overall and engagement aggregates populated;
- no actual post URL columns exist.

### `Categories`

Current template should produce:

```text
21 category rows
```

for that submission.

### `Tasks`

Current template should produce:

```text
289 task rows
```

for that submission.

Rows contain task/category IDs and derived booleans/counts, not task text or URLs.

### `Quotas`

Current template should produce:

```text
8 quota rows
```

### `Daily`

The number of rows depends on the local daily analytics history included in the snapshot.

Verify formula-leading nicknames are stored as text rather than executed as spreadsheet formulas.

---

## 16. Verify Supabase

### Table Editor

Open **Table Editor** and inspect:

```text
analytics_submissions
analytics_categories
analytics_tasks
analytics_quotas
analytics_daily
```

Verify the submission UUID exists once and child counts match the Sheets snapshot.

### SQL Editor analytical verification

Run:

```sql
select *
from public.analytics_template_summary;
```

Then:

```sql
select *
from public.analytics_task_popularity
order by completion_rate_percent desc;
```

Then:

```sql
select *
from public.analytics_category_performance
order by avg_completion_percent desc;
```

Then:

```sql
select *
from public.analytics_daily_engagement
order by day;
```

For returning-participant analysis:

```sql
select participant_id, count(distinct template_version) as seasons
from public.analytics_submissions
group by participant_id
order by seasons desc;
```

Confirm there are no actual user post URLs in any analytics table.

---

## 17. Make Supabase mandatory after the dual-sink test passes

Once both Sheets and Supabase have been proven together:

1. Apps Script → **Project Settings**.
2. Under **Script Properties**, click **Edit script properties**.
3. Change:

```text
SUPABASE_REQUIRED=false
```

to:

```text
SUPABASE_REQUIRED=true
```

4. Save Script Properties.
5. Run `validateSupabaseConfiguration()` again.
6. Open `/exec` again and confirm health JSON shows:

```text
supabaseRequired: true
```

With this setting, Supabase is treated as a required sink rather than optional mirroring.

---

## 18. Activate analytics on production `main`

Only after every previous step is green, edit `checklist.html` on `main`:

```json
{
  "templateVersion": "2026-11-22",
  "challengeCategoryName": "Челленджи",
  "challengeCompleteThreshold": 10,
  "finalStatsEnabled": true,
  "finalStatsUrl": "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
}
```

### GitHub web editor

1. Open `checklist.html` on `main`.
2. Click the edit/pencil control.
3. Change only the `appConfig` block.
4. Commit directly to the fork's `main` or use a short PR if you want one more review gate.

### CLI

```powershell
git checkout main
git pull origin main
# edit checklist.html
git add checklist.html
git commit -m "config: enable production analytics gateway"
git push origin main
```

Confirm GitHub Pages source is:

```text
main / (root)
```

Then perform one final synthetic production submission and verify both sinks again.

---

## 19. Operational checks after activation

Regularly review:

### Google Apps Script

- **Executions** dashboard for failures;
- rate-limit/busy errors;
- authorization issues;
- unexpected response errors.

### Google Sheets

- growth of each normalized tab;
- duplicate submission IDs;
- sharing permissions;
- retention/deletion policy.

### Supabase

- project usage/free-tier resource consumption;
- database size;
- API errors;
- analytics query performance;
- access/team permissions.

Do not log or paste the Supabase Secret key into debugging output.

---

## 20. Secret-key rotation

If `SUPABASE_SECRET_KEY` is ever exposed:

1. Treat it as compromised immediately.
2. In Supabase **Settings → API Keys**, create/rotate/revoke the affected Secret key according to the current key-management UI.
3. Replace `SUPABASE_SECRET_KEY` in Apps Script Script Properties.
4. Save properties.
5. Run `validateSupabaseConfiguration()`.
6. Health-check `/exec`.
7. Perform a synthetic end-to-end submission.
8. Revoke/delete the old compromised key if it has not already been invalidated.

Never commit the replacement key.

---

## 21. New season/template update procedure

When the checklist changes for a new season:

1. Update the trusted checklist/template content.
2. Assign/update `templateVersion` in `checklist.html`.
3. Count the actual tasks, categories and quotas.
4. Update Apps Script `OWNER_SETUP.templatePolicies` with the new template version and exact counts.
5. Confirm challenge threshold.
6. Save Apps Script.
7. Run `runSelfTests()`.
8. Run/re-run `setupReceiver()` so current configuration is stored/validated.
9. Create a **new Apps Script deployment version** or update the Web App deployment using the current deployment management UI.
10. Stage the new GitHub Pages template.
11. Verify Sheets/Supabase acceptance with synthetic data.
12. Deploy the template to `main` only after the policy and actual template agree.

Do not simply change the frontend version without updating the backend policy: the receiver is intentionally designed to reject inconsistent templates/counts.

---

## 22. Emergency rollback / stop collection

Fastest client-side stop:

Edit `checklist.html` and set:

```json
"finalStatsEnabled": false,
"finalStatsUrl": ""
```

Commit/push to the GitHub Pages publishing branch.

This hides/disables the final submission path while leaving the normal local checklist functional.

You can also:

- remove/revoke the Apps Script Web App deployment;
- rotate/remove the Supabase secret;
- temporarily set `SUPABASE_REQUIRED=false` during backend diagnosis.

Keep the public checklist usable even when analytics infrastructure is unavailable.

---

## 23. Recommended final acceptance checklist

Do not call the deployment production-ready until all are true:

- [ ] `main` contains no Supabase secret.
- [ ] GitHub Pages works with analytics disabled.
- [ ] `supabase/schema.sql` ran successfully.
- [ ] RLS is enabled on analytics tables.
- [ ] `anon`/`authenticated` are not granted analytics-table access.
- [ ] `ingest_analytics_submission` exists.
- [ ] Apps Script has `Code.gs` and `Compat.gs`.
- [ ] `appsscript.json` matches the repository manifest.
- [ ] `runSelfTests()` succeeds.
- [ ] `setupReceiver()` succeeds.
- [ ] All five Sheets tabs exist.
- [ ] `SUPABASE_URL` exists only in Script Properties/configuration.
- [ ] `SUPABASE_SECRET_KEY` exists only in Script Properties/password manager.
- [ ] `validateSupabaseConfiguration()` succeeds.
- [ ] Apps Script `/exec` returns healthy JSON anonymously.
- [ ] Synthetic client submission reports Sheets success.
- [ ] Synthetic client submission reports Supabase success.
- [ ] Sheets has 1 parent + 21 category + 289 task + 8 quota rows for the current snapshot, plus expected daily rows.
- [ ] Supabase has the same submission UUID and matching children.
- [ ] No actual test post URL appears in Sheets/Supabase payload storage.
- [ ] `SUPABASE_REQUIRED=true` after dual-sink proof.
- [ ] Production `main` is enabled only after staging passes.
- [ ] GitHub Pages source is `main / (root)` for production.

---

<a id="русская-инструкция"></a>

# Русская инструкция

## 0. Архитектура и правила безопасности до начала настройки

Нужная схема:

```text
GitHub Pages
   |
   | только производная/псевдонимная аналитика
   v
Google Apps Script Web App (/exec)
   |
   +--> нормализованный Google Sheets
   |
   +--> Supabase PostgreSQL
```

Во время всей настройки соблюдайте правила:

1. **Никогда** не помещайте `sb_secret_...` в репозиторий, `checklist.html`, `analytics.js`, browser devtools snippets, URL или query parameters.
2. Браузер обращается **только к Apps Script**. Прямого browser → Supabase connection нет.
3. Для backend ingestion используйте современный Supabase **Secret key** (`sb_secret_...`), а не publishable/anon key.
4. Пока dual-sink staging test не прошёл полностью, аналитика публичного чек-листа должна оставаться выключенной.
5. Для production используется Apps Script Web App URL с окончанием **`/exec`**. `/dev` — только editor/test deployment.
6. Если Google Workspace/domain policy не предлагает публичный/анонимный Web App access, такая схема не сможет принимать anonymous submissions от GitHub Pages. Нужен аккаунт/policy с подходящим public access или другой gateway.

Используемые файлы:

```text
checklist.html
analytics.js

google-apps-script/
  Code.gs
  Compat.gs
  appsscript.json

supabase/
  schema.sql
```

---

## 1. Проверьте форк и при желании опубликуйте безопасный baseline через GitHub Pages

На этом этапе analytics всё ещё выключена, поэтому `main` можно публиковать безопасно.

### GitHub interface

1. Откройте `mishka23x/4ek-lis`.
2. Откройте **Settings**.
3. Слева, в разделе **Code, planning, and automation**, откройте **Pages**.
4. В **Build and deployment** выберите:
   - **Source** → `Deploy from a branch`
   - **Branch** → `main`
   - **Folder** → `/(root)`
5. Нажмите **Save**.
6. После deployment нажмите **Visit site**, если кнопка отображается.

Ожидаемый URL:

```text
https://mishka23x.github.io/4ek-lis/
```

Чек-лист:

```text
https://mishka23x.github.io/4ek-lis/checklist.html
```

Так как analytics в repository defaults выключена, на этом этапе должна работать только обычная локальная функциональность чек-листа без отправки данных.

Официальная документация:

- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

---

## 2. Создайте Supabase Free project

1. Войдите в Supabase Dashboard.
2. Создайте **New project** в нужной организации.
3. Заполните project details.
4. Выберите **Free** plan/Free project option, если интерфейс предлагает выбор.
5. Выберите регион, разумно близкий к основной аудитории.
6. Сохраните database password в password manager, даже если эта интеграция использует Data API, а не прямое DB соединение.
7. Создайте project и дождитесь запуска базы.

Не добавляйте никакие Supabase keys в Git repository.

Dashboard:

- https://supabase.com/dashboard

---

## 3. Установите PostgreSQL schema из `supabase/schema.sql`

Предоставленный SQL создаёт tables, constraints, RLS, privilege revocations, ingestion RPC и analytical views.

### Supabase UI

1. В проекте Supabase откройте **SQL Editor**.
2. Нажмите **New Query**.
3. В GitHub откройте:

```text
supabase/schema.sql
```

4. Скопируйте **весь** файл.
5. Вставьте его в SQL Editor.
6. Нажмите **Run**.
7. Убедитесь, что выполнение завершилось успешно.

Должны появиться tables:

```text
analytics_submissions
analytics_categories
analytics_tasks
analytics_quotas
analytics_daily
```

views:

```text
analytics_template_summary
analytics_task_popularity
analytics_category_performance
analytics_daily_engagement
```

и RPC/function:

```text
ingest_analytics_submission
```

### Проверка RLS

В новой query:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename like 'analytics_%'
order by tablename;
```

Для analytics tables ожидается включённый RLS.

Проверка function:

```sql
select proname
from pg_proc
where proname = 'ingest_analytics_submission';
```

Проверка views:

```sql
select table_name
from information_schema.views
where table_schema = 'public'
  and table_name like 'analytics_%'
order by table_name;
```

Официальные ссылки:

- https://supabase.com/docs/guides/database/overview
- https://supabase.com/docs/guides/database/functions

---

## 4. Получите Supabase Project URL и backend Secret key

### Project URL

Используйте один из текущих путей интерфейса:

- project **Connect** dialog;
- или **Integrations → Data API**.

URL обычно имеет вид:

```text
https://YOUR_PROJECT_REF.supabase.co
```

### Secret key

1. Откройте **Settings → API Keys**.
2. Перейдите в раздел/tab **Publishable and secret API keys**.
3. Если modern keys ещё не созданы и есть кнопка **Create new API Keys**, создайте их.
4. В разделе **Secret keys** скопируйте server-side key:

```text
sb_secret_...
```

5. Временно сохраните его в password manager.

Для этой архитектуры publishable key в GitHub Pages не требуется.

Secret key имеет elevated backend access и обходит RLS, поэтому должен оставаться только в trusted backend.

Официальная документация:

- https://supabase.com/docs/guides/getting-started/api-keys

---

## 5. Создайте Google Apps Script project

1. Откройте:

```text
https://script.google.com/
```

2. Нажмите **New project**.
3. Переименуйте, например:

```text
4ek-lis analytics gateway
```

### Установите `Code.gs`

1. В Files panel выберите стандартный `Code.gs`.
2. Удалите starter content.
3. В репозитории откройте `google-apps-script/Code.gs`.
4. Скопируйте весь файл в Apps Script `Code.gs`.

### Добавьте `Compat.gs`

1. В Files panel нажмите **+**.
2. Создайте **Script** file.
3. Назовите:

```text
Compat
```

4. Скопируйте содержимое `google-apps-script/Compat.gs`.

`Compat.gs` нужен из-за различий Apps Script V8 и обычных browser/Node Web APIs.

### Покажите и замените `appsscript.json`

1. Слева откройте **Project Settings**.
2. Включите:

```text
Show "appsscript.json" manifest file in editor
```

3. Вернитесь к Editor.
4. Откройте `appsscript.json`.
5. Полностью замените его содержимым `google-apps-script/appsscript.json` из репозитория.

Manifest использует V8 и только нужные scopes:

```text
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/script.external_request
```

Официальные ссылки:

- https://developers.google.com/apps-script/concepts/manifests
- https://developers.google.com/apps-script/concepts/scopes

---

## 6. Проверьте `OWNER_SETUP` в `Code.gs` до первого запуска

В начале `Code.gs` находится:

```js
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
```

### `spreadsheetId`

Оставьте:

```js
spreadsheetId: ''
```

чтобы `setupReceiver()` сам создал новый spreadsheet.

Если dedicated spreadsheet уже создан, укажите только Google Sheets file ID.

### `allowedOrigins`

Fork GitHub Pages origin уже добавлен:

```text
https://mishka23x.github.io
```

`location.origin` не содержит `/4ek-lis`, поэтому repository path сюда не добавляется.

Также добавлен upstream origin:

```text
https://365grain.github.io
```

Для custom domain добавьте точный HTTPS origin до запуска/re-run `setupReceiver()`.

### `templatePolicies`

Текущая policy должна совпадать с шаблоном:

```text
2026-11-22
289 tasks
21 categories
8 quotas
challenge threshold 10
```

Для нового сезона frontend config и backend policy меняются вместе.

### Rate limits

Defaults:

```text
30/minute
500/hour
```

Меняйте их только осознанно с учётом Apps Script quotas.

Сохраните файлы.

---

## 7. Запустите Apps Script self-tests

1. В toolbar откройте function selector.
2. Выберите:

```text
runSelfTests
```

3. Нажмите **Run**.
4. Execution должен завершиться без thrown error.

Self-tests проверяют UUID, formula safety, origin normalization, dangerous IDs, daily invariants и ожидаемый формат Supabase Secret key.

Дополнительно локально рекомендуется:

```powershell
node tests/check-static.mjs
node tests/check-analytics.mjs
```

При ошибках не deploy-ить production.

---

## 8. Запустите `setupReceiver()` и выдайте Google permissions

1. Выберите function:

```text
setupReceiver
```

2. Нажмите **Run**.
3. Google покажет authorization prompt для Sheets и external HTTP requests.
4. Проверьте permissions и разрешите их своему Apps Script project.
5. Function должен завершиться успешно.

`setupReceiver()`:

- создаёт/открывает analytics spreadsheet;
- сохраняет core runtime config в Script Properties;
- создаёт/проверяет tabs:
  - `Submissions`
  - `Categories`
  - `Tasks`
  - `Quotas`
  - `Daily`

Если `spreadsheetId` был пустой, найдите в Google Drive:

```text
4ek-lis analytics
```

Также в Project Settings → Script Properties появятся `FOUR_FOX_...` properties.

---

## 9. Добавьте Supabase настройки в Apps Script Script Properties

Текущий UI path:

1. Apps Script → **Project Settings**.
2. Прокрутите до **Script Properties**.
3. Для первого property нажмите **Add script property**.
4. Для последующих properties UI может показывать **Edit script properties → Add script property**.
5. Добавьте:

```text
SUPABASE_URL
https://YOUR_PROJECT_REF.supabase.co
```

```text
SUPABASE_SECRET_KEY
sb_secret_...
```

```text
SUPABASE_REQUIRED
false
```

6. Нажмите **Save script properties**.

Во время staging оставьте `SUPABASE_REQUIRED=false`.

Secret key не добавляется в `OWNER_SETUP`, GitHub или public JS.

Официальная документация:

- https://developers.google.com/apps-script/guides/properties

---

## 10. Проверьте Supabase config из Apps Script

1. Вернитесь в editor.
2. Выберите:

```text
validateSupabaseConfiguration
```

3. Нажмите **Run**.
4. Function должен завершиться без ошибки.

Если есть ошибка, проверьте:

- точный `SUPABASE_URL`;
- `sb_secret_...` key;
- отсутствие пробелов;
- наличие `Compat.gs`;
- scope `script.external_request` в manifest.

---

## 11. Deploy Apps Script как production Web App

Текущий Google flow:

1. В правом верхнем углу: **Deploy → New deployment**.
2. Возле **Select type** откройте selector/settings.
3. Выберите **Web app**.
4. Description, например:

```text
4ek-lis analytics gateway v2
```

5. **Execute as** → deploying owner / **Me**.
6. **Who has access** → public/anonymous option, обычно **Anyone**, если policy аккаунта это позволяет.
7. Нажмите **Deploy**.
8. Завершите authorization при необходимости.
9. Скопируйте Web App URL.

Production URL заканчивается:

```text
/exec
```

Не используйте `/dev` в public checklist.

Официальная документация:

- https://developers.google.com/apps-script/guides/web

---

## 12. Health check gateway до включения клиента

Откройте `/exec` URL в браузере.

Ожидаемый JSON примерно:

```json
{
  "ok": true,
  "service": "4ek-lis-analytics",
  "receiverVersion": "2.0.0",
  "schemaVersion": 2,
  "configured": true,
  "supabaseConfigured": true,
  "supabaseRequired": false
}
```

Не продолжайте, если:

```text
configured=false
```

или:

```text
supabaseConfigured=false
```

Если вместо JSON появляется Google login, Web App не открыт для anonymous GitHub Pages users.

---

## 13. Включите client только в staging branch

До проверки не включайте analytics в public `main`.

### Рекомендуемый staging branch

```powershell
git checkout main
git pull origin main
git switch -c staging/analytics-activation
```

В `checklist.html` измените только `appConfig`:

```json
{
  "templateVersion": "2026-11-22",
  "challengeCategoryName": "Челленджи",
  "challengeCompleteThreshold": 10,
  "finalStatsEnabled": true,
  "finalStatsUrl": "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
}
```

Commit/push:

```powershell
git add checklist.html
git commit -m "test: enable analytics gateway in staging"
git push -u origin staging/analytics-activation
```

Временно переключите GitHub Pages:

```text
Settings → Pages
Source: Deploy from a branch
Branch: staging/analytics-activation
Folder: /(root)
Save
```

После теста верните Pages на `main`, пока production activation не commit-нута.

---

## 14. Выполните synthetic end-to-end test

На staged checklist используйте только тестовые данные.

1. Ник:

```text
TEST-analytics-20260901
```

2. Отметьте несколько tasks.
3. Добавьте favorites.
4. Укажите несколько quotas.
5. Используйте harmless test URLs:

```text
https://example.com/test-1
https://example.com/test-2
```

6. Создайте один duplicate URL и при желании одно invalid значение.
7. Несколько раз collapse/expand категории.
8. Нажмите final analytics send control.

Успех должен показать оба sinks:

```text
Sheets: ✓
Supabase: ✓
```

Реальные URL не должны отправляться — только derived counts/statistics.

---

## 15. Проверьте Google Sheets

Откройте `4ek-lis analytics`.

Для одной current-template submission:

### `Submissions`

- одна parent row;
- overall + engagement metrics;
- никаких actual URL columns.

### `Categories`

Ожидается:

```text
21 rows
```

### `Tasks`

Ожидается:

```text
289 rows
```

Rows содержат IDs и derived metrics, а не task text/URLs.

### `Quotas`

Ожидается:

```text
8 rows
```

### `Daily`

Количество rows зависит от daily history в snapshot.

Проверьте, что nickname с `=`, `+`, `-`, `@` не исполняется как spreadsheet formula.

---

## 16. Проверьте Supabase

### Table Editor

Проверьте:

```text
analytics_submissions
analytics_categories
analytics_tasks
analytics_quotas
analytics_daily
```

Submission UUID должен существовать один раз.

### SQL Editor

```sql
select * from public.analytics_template_summary;
```

```sql
select *
from public.analytics_task_popularity
order by completion_rate_percent desc;
```

```sql
select *
from public.analytics_category_performance
order by avg_completion_percent desc;
```

```sql
select *
from public.analytics_daily_engagement
order by day;
```

Returning participants:

```sql
select participant_id, count(distinct template_version) as seasons
from public.analytics_submissions
group by participant_id
order by seasons desc;
```

Убедитесь, что actual user URLs отсутствуют.

---

## 17. После успешного dual-sink test сделайте Supabase обязательным

1. Apps Script → **Project Settings**.
2. **Script Properties → Edit script properties**.
3. Измените:

```text
SUPABASE_REQUIRED=false
```

на:

```text
SUPABASE_REQUIRED=true
```

4. Save.
5. Повторно запустите `validateSupabaseConfiguration()`.
6. Проверьте `/exec` JSON:

```text
supabaseRequired: true
```

---

## 18. Включите analytics в production `main`

Только после полного green staging измените `checklist.html` в `main`:

```json
{
  "templateVersion": "2026-11-22",
  "challengeCategoryName": "Челленджи",
  "challengeCompleteThreshold": 10,
  "finalStatsEnabled": true,
  "finalStatsUrl": "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
}
```

### GitHub web editor

1. `checklist.html` → edit/pencil.
2. Измените только `appConfig`.
3. Commit в **fork main**, не в original upstream.

### CLI

```powershell
git checkout main
git pull origin main
# edit checklist.html
git add checklist.html
git commit -m "config: enable production analytics gateway"
git push origin main
```

Убедитесь, что Pages source:

```text
main / (root)
```

Выполните финальный synthetic production test.

---

## 19. Monitoring после activation

### Apps Script

Проверяйте **Executions**:

- failures;
- rate limiting;
- busy/authorization errors;
- unexpected network/Supabase responses.

### Google Sheets

Проверяйте:

- рост tabs;
- duplicate submission IDs;
- sharing permissions;
- retention/deletion policy.

### Supabase

Проверяйте:

- Free-tier usage;
- database size;
- API errors;
- query performance;
- project/team access.

Не выводите Supabase Secret key в logs.

---

## 20. Rotation Supabase Secret key

При любом подозрении на утечку:

1. Сразу считайте key compromised.
2. Supabase → **Settings → API Keys**.
3. Создайте/rotate/revoke key через текущий key-management UI.
4. Замените `SUPABASE_SECRET_KEY` в Apps Script Script Properties.
5. Save.
6. Запустите `validateSupabaseConfiguration()`.
7. Проверьте `/exec`.
8. Сделайте synthetic submission.
9. Окончательно revoke/delete старый key.

Новый key тоже никогда не commit-ится.

---

## 21. Обновление нового сезона/template

1. Обновите trusted checklist/template.
2. Измените `templateVersion`.
3. Точно посчитайте tasks/categories/quotas.
4. Обновите `OWNER_SETUP.templatePolicies` в Apps Script.
5. Проверьте challenge threshold.
6. Save Apps Script.
7. `runSelfTests()`.
8. Re-run `setupReceiver()` для актуализации/validation config.
9. Создайте новую Apps Script deployment version или обновите Web App deployment через текущий deployment UI.
10. Stage новый frontend template.
11. Synthetic dual-sink test.
12. Только после совпадения policy/template выпускайте в `main`.

Backend специально должен reject-ить несовпадающие counts/version.

---

## 22. Emergency rollback / немедленно остановить collection

Самый быстрый способ:

```json
"finalStatsEnabled": false,
"finalStatsUrl": ""
```

в `checklist.html`, затем commit/push в GitHub Pages publishing branch.

Обычный local checklist продолжит работать.

Дополнительно можно:

- удалить/отключить Apps Script Web App deployment;
- rotate/remove Supabase secret;
- временно поставить `SUPABASE_REQUIRED=false` для диагностики backend.

---

## 23. Финальный acceptance checklist

Production-ready только когда всё ниже выполнено:

- [ ] В `main` нет Supabase secret.
- [ ] GitHub Pages работает с выключенной analytics.
- [ ] `supabase/schema.sql` выполнен без ошибок.
- [ ] RLS включён.
- [ ] `anon`/`authenticated` не имеют доступа к analytics tables.
- [ ] `ingest_analytics_submission` существует.
- [ ] Apps Script содержит `Code.gs` и `Compat.gs`.
- [ ] `appsscript.json` совпадает с repository manifest.
- [ ] `runSelfTests()` успешно.
- [ ] `setupReceiver()` успешно.
- [ ] Существуют все пять Sheets tabs.
- [ ] `SUPABASE_URL` настроен.
- [ ] `SUPABASE_SECRET_KEY` существует только в Script Properties/password manager.
- [ ] `validateSupabaseConfiguration()` успешно.
- [ ] `/exec` отдаёт healthy JSON без login requirement.
- [ ] Synthetic submission успешно пишет Sheets.
- [ ] Synthetic submission успешно пишет Supabase.
- [ ] Sheets имеет 1 parent + 21 category + 289 task + 8 quota rows + ожидаемые daily rows.
- [ ] Supabase содержит тот же UUID и matching child rows.
- [ ] Test URLs не появились в Sheets/Supabase storage.
- [ ] После dual-sink proof включено `SUPABASE_REQUIRED=true`.
- [ ] Production analytics активирована только после staging.
- [ ] GitHub Pages production source = `main / (root)`.
