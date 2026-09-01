# 4ek-lis — hardened bilingual edition

> **English** below · **Русская версия** во второй половине документа.

This branch is a security/accessibility/performance/analytics remediation of the original static LiveJournal marathon checklist. It remains compatible with **GitHub Pages**, ordinary static hosting, **Google Apps Script + Google Sheets**, and now an optional **Supabase PostgreSQL** analytics store.

- Upstream: `365grain/4ek-lis:main`
- Fork: `mishka23x/4ek-lis`
- Remediation branch: `codex/ui-a11y-security-performance-hardening-20260831`
- Upstream production `main` is not modified by this branch.

---

# English

## Purpose

4ek-lis is a browser-based organizer for LiveJournal seasonal marathons, hashtags, writing prompts and challenges. It requires no account or application server for normal use.

Users can:

- browse 21 categories / 289 tasks;
- set 8 seasonal goals/quotas;
- check tasks off;
- save multiple post links under completed tasks;
- favorite tasks with hearts;
- detect invalid and duplicate links;
- see unique-link, challenge and completion statistics;
- collapse/expand categories;
- see category and overall progress;
- receive lightweight milestone celebrations;
- keep progress locally in the browser;
- export/import a JSON progress backup;
- reset progress;
- use the FAQ page;
- optionally submit a rich **derived analytics snapshot** at season end.

The production frontend is still dependency-free static **HTML/CSS/JavaScript**. There is no bundler, framework, analytics SDK or Supabase client in the browser.

## Main remediation work

### Security

- Removed the imported persistent DOM-XSS path by separating trusted repository template content from untrusted mutable backup/local state.
- Dynamic rendering uses DOM/text APIs instead of unsafe HTML injection sinks.
- Added restrictive Content Security Policy and moved executable scripts to same-origin files.
- Import is bounded to 5 MiB and validated by exact schema/types/known IDs with dangerous-key rejection.
- Dynamic URLs are limited to HTTP(S); new-tab links use `noopener noreferrer`.
- Removed the old public browser `FINAL_TOKEN` design.
- Production statistics accept only an explicitly enabled HTTPS Apps Script `/exec` endpoint.
- Storage corruption/quota/security failures are contained instead of breaking the application.

### Accessibility/mobile

- Skip links, semantic headings/sections, labelled inputs, native `<progress>`, ARIA state/error relationships and strong focus indicators.
- Reduced-motion and forced-colors support.
- Larger touch targets and mobile-safe input sizing.
- Grid/flex overflow hardening and long-token wrapping.
- Safe-area-aware dynamically measured fixed-footer clearance.
- Reserved cover aspect ratio to avoid layout shift.

### Performance

The large static DOM is built once and normal interactions use incremental updates, delegated events, indexed URL occurrences and compact mutable state rather than repeated full rendering/storage of the complete trusted template.

See `REMEDIATION-EVIDENCE.md` for the recorded browser/accessibility/performance evidence.

---

## Analytics architecture (schema v2)

The new analytics goal is **maximum useful statistical signal with minimum raw/sensitive data**.

```text
GitHub Pages static checklist
        |
        | HTTPS POST (derived/pseudonymous analytics only)
        v
Google Apps Script gateway
        |
        +--------------------+
        |                    |
        v                    v
Google Sheets          Supabase PostgreSQL
(normalized tabs)      (normalized tables + views)
```

### Browser-private raw state

The following stay in the browser and are **not included in the analytics payload**:

- actual post URLs;
- post contents;
- task/category text;
- arbitrary localStorage data;
- imported backup contents;
- browser history;
- raw user-agent string;
- Supabase credentials.

### Pseudonymous participant identity

`analytics.js` generates a random UUIDv4 `participantId` once and persists it separately in browser localStorage. It supports longitudinal/returning-participant statistics without requiring an email, phone number or account.

It is **pseudonymous, not authenticated identity**. Clearing browser data creates a new ID and a malicious user can forge client data because the public site has no login.

### Submission/idempotency identity

Each transmitted snapshot has a separate UUIDv4 `submissionId`. Failed requests preserve the pending UUID locally so retries are idempotent rather than producing accidental duplicate records.

### Overall derived metrics

A final snapshot includes:

- total/checked tasks and completion percentage;
- total/categories started/completed;
- entered, valid, unique-valid, duplicate and invalid link counts;
- favorite count;
- challenge unique-link count and completed-challenge count;
- tasks containing links;
- tasks containing multiple links;
- maximum links on a single task.

**Link counts are transmitted; link addresses are not.**

### Per-category derived metrics

For each category ID:

- task count;
- checked count;
- completion percentage;
- favorite count;
- entered/valid/unique/duplicate/invalid link counts;
- completed-challenge count.

Category text/name is not transmitted in the payload; the release template provides its meaning.

### Per-task derived metrics

For every task ID:

- category ID;
- checked boolean;
- favorite boolean;
- entered/valid/unique/duplicate/invalid link counts;
- completed-challenge count.

Task text and actual URLs are not transmitted.

This enables task popularity, skip rate, favorite rate, link-generation effectiveness and category-level performance analysis without collecting user-created content.

### Seasonal goal analytics

Each quota sends only:

- `quotaId`;
- numeric target or `null`.

### Longitudinal engagement analytics

The browser stores aggregated counters rather than a raw clickstream:

- first opened / last active timestamps;
- active days;
- session count;
- total active seconds;
- export/import/reset counts;
- task/favorite/category toggle counts;
- collapse-all / expand-all counts;
- committed-link-edit count;
- first task completion;
- first linked post;
- first completed challenge;
- halfway milestone;
- last task completion timestamp.

### Daily aggregates

Up to 730 local daily aggregate rows may be retained, with:

- day;
- active seconds;
- sessions;
- task/favorite/category toggles;
- link commits;
- exports;
- import attempts/successes;
- resets.

There is no per-click timestamp stream.

### Coarse UI/device context

Only low-entropy context useful for responsive/accessibility decisions is submitted:

- viewport bucket (`<=480`, `481–768`, `769–1024`, `1025–1440`, `>1440`);
- coarse input mode (`touch`, `pointer`, `mixed`, `unknown`);
- reduced-motion preference;
- light/dark preference;
- browser language.

No raw user-agent fingerprint is sent.

---

## Apps Script gateway

`google-apps-script/Code.gs` is the only public ingestion endpoint.

It performs independent validation before either storage sink is touched:

- maximum 512 KiB request;
- exact top-level and nested schemas;
- UUIDv4 checks;
- origin allowlist;
- known template version policy (289 tasks, 21 categories, 8 quotas for the current release);
- unique task/category/quota/day identifiers;
- type/range/string bounds;
- dangerous-key rejection;
- arithmetic invariants (`entered = valid + invalid`, `valid = unique + duplicate`);
- task -> category aggregation reconciliation;
- category -> overall reconciliation;
- daily -> engagement reconciliation;
- challenge bound checks;
- spreadsheet-formula neutralization;
- script-wide write lock;
- UUID duplicate detection;
- approximate global minute/hour rate budgets.

The endpoint is still anonymous. These controls prevent many malformed/accidental submissions but do not cryptographically prove a human identity.

### Dual-sink retry behavior

Sheets and Supabase are treated as independent idempotent sinks.

If one succeeds and the other temporarily fails, the browser keeps the same pending `submissionId`. A retry does not duplicate the successful side and can complete the missing side.

`SUPABASE_REQUIRED=true` can be set in Apps Script Script Properties after Supabase staging is complete. Before that, Sheets can remain operational alone.

---

## Google Sheets model

`setupReceiver()` creates/validates normalized tabs:

- `Submissions` — one wide aggregate row per snapshot;
- `Categories` — one row per category/snapshot;
- `Tasks` — one row per task/snapshot;
- `Quotas` — one row per seasonal goal/snapshot;
- `Daily` — one row per participant-day included in the snapshot.

This keeps Sheets useful for manual inspection and pivots while avoiding raw URLs/post content.

---

## Supabase PostgreSQL

Run `supabase/schema.sql` in the Supabase SQL Editor.

It creates:

- `analytics_submissions`;
- `analytics_categories`;
- `analytics_tasks`;
- `analytics_quotas`;
- `analytics_daily`;
- indexes for participant/template/task/category/day analysis;
- RLS-enabled tables with no `anon` or `authenticated` access;
- transactional `ingest_analytics_submission(jsonb)` RPC;
- aggregate views:
  - `analytics_template_summary`;
  - `analytics_task_popularity`;
  - `analytics_category_performance`;
  - `analytics_daily_engagement`.

The RPC writes a complete snapshot and its children in a single PostgreSQL transaction. A repeated `submissionId` returns success as a duplicate without inserting a second dataset.

### Supabase secret handling

Use a modern `sb_secret_...` key. It is stored only in **Apps Script Script Properties**, never in this repository and never in GitHub Pages JavaScript.

Required properties:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_REQUIRED=false
```

After end-to-end staging succeeds, change:

```text
SUPABASE_REQUIRED=true
```

See `supabase/README.md` and `google-apps-script/README.md`.

---

## Activation

The repository intentionally keeps remote collection disabled until owner configuration is ready.

In `checklist.html`:

```json
{
  "templateVersion": "2026-11-22",
  "challengeCategoryName": "Челленджи",
  "challengeCompleteThreshold": 10,
  "finalStatsEnabled": true,
  "finalStatsUrl": "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
}
```

Use a real `/exec` deployment, not `/dev`.

---

## Local preview/checks

```powershell
py -m http.server 4174 --bind 127.0.0.1
node tests/check-static.mjs
node tests/check-analytics.mjs
```

Open:

```text
http://127.0.0.1:4174/
http://127.0.0.1:4174/checklist.html
```

---

## Important security/privacy limitations

- A static anonymous client cannot prove a person's identity. `participantId`, origin and all analytics values can ultimately be forged by a determined attacker.
- Apps Script cache-based rate budgets are best-effort, not a substitute for a dedicated authenticated API/WAF.
- Supabase `sb_secret_...` keys bypass RLS and must remain server-side. Rotate immediately if exposed.
- Browser-local progress is not cloud synchronization.
- Google/Supabase operational quotas and account-specific behavior must be staged with the owner's real accounts.
- The existing remote cover image still creates an ordinary request to the LiveJournal image host; no checklist analytics are placed in that request.

For deeper security discussion see `SECURITY-REVIEW.md` and `ANALYTICS-SECURITY.md`.

---

# Русский

## Назначение

4ek-lis — браузерный органайзер для сезонных марафонов LiveJournal, хешмобов, тем для публикаций и челленджей. Для обычной работы не требуется аккаунт или application-server.

Пользователь может:

- работать с 21 категорией / 289 заданиями;
- задать 8 целей на сезон;
- отмечать выполненные задания;
- сохранять несколько ссылок на посты под выполненным заданием;
- отмечать задания сердечком;
- видеть некорректные и дублированные ссылки;
- видеть статистику уникальных ссылок, челленджей и общего выполнения;
- сворачивать/разворачивать категории;
- видеть прогресс категории и всего чек-листа;
- получать лёгкие milestone-поздравления;
- хранить прогресс локально в браузере;
- экспортировать/восстанавливать JSON backup;
- сбрасывать прогресс;
- пользоваться ЧАВО;
- при явном включении отправлять расширенный **снимок производной аналитики** по итогам сезона.

Frontend остаётся полностью статическим и dependency-free: **HTML/CSS/JavaScript**. В браузере нет Supabase SDK, analytics SDK, framework или секретного ключа.

## Основные исправления

### Безопасность

- Устранён persistent DOM-XSS через импорт: доверенный шаблон репозитория отделён от недоверенного mutable state.
- Dynamic render строится DOM/text API вместо unsafe HTML injection.
- Добавлен строгий CSP, executable scripts вынесены в same-origin файлы.
- Import ограничен 5 MiB и проверяется по schema/types/known IDs с блокировкой опасных ключей.
- Dynamic URL разрешены только HTTP(S), new-tab links используют `noopener noreferrer`.
- Старый публичный browser `FINAL_TOKEN` удалён.
- Production statistics принимают только явно включённый Apps Script HTTPS `/exec`.
- Ошибки localStorage/corruption/quota не должны ломать приложение.

### Accessibility/mobile

- Skip links, semantic headings/sections, labels, native `<progress>`, ARIA состояния/ошибки и заметный focus.
- Reduced motion и forced colors.
- Более крупные touch targets, mobile-safe input sizing.
- Grid/flex overflow fixes, перенос длинных URL/токенов.
- Safe-area и динамически измеряемый clearance fixed footer.
- Зарезервированный aspect ratio обложки против layout shift.

### Производительность

Большой DOM строится один раз. Обычные действия обновляют только нужные части, используют delegated events, индекс URL и компактное mutable state вместо постоянного полного rerender/full-template storage.

---

## Архитектура аналитики (schema v2)

Цель: **максимум полезной статистики при минимуме сырого/чувствительного содержимого**.

```text
GitHub Pages checklist
        |
        | HTTPS POST — только derived/pseudonymous analytics
        v
Google Apps Script gateway
        |
        +--------------------+
        |                    |
        v                    v
Google Sheets          Supabase PostgreSQL
```

### Что остаётся только в браузере

Не отправляются:

- реальные URL постов;
- содержимое публикаций;
- текст заданий/категорий;
- произвольный localStorage;
- содержимое backup-файлов;
- история браузера;
- raw User-Agent;
- Supabase credentials.

### Pseudonymous participantId

`analytics.js` один раз создаёт случайный UUIDv4 `participantId` и хранит его отдельно в localStorage. Это позволяет анализировать возвращающихся участников и сезонную динамику без email/телефона/аккаунта.

Это **псевдонимный, но не аутентифицированный ID**: очистка browser data создаст новый ID, а анонимный клиент технически может подделать данные.

### submissionId

Каждый отправляемый snapshot получает отдельный UUIDv4 `submissionId`. При ошибке тот же UUID сохраняется локально и используется при retry, поэтому повтор не создаёт случайно второй набор строк.

### Общие derived metrics

Отправляются:

- total/checked tasks и completion percent;
- категории total/started/completed;
- entered/valid/unique/duplicate/invalid link counts;
- favorite count;
- challenge links и completed challenges;
- количество заданий со ссылками/несколькими ссылками;
- максимальное число ссылок у одного задания.

**Передаются количества ссылок, но не сами URL.**

### По категориям

Для каждого `categoryId`:

- task count;
- checked count;
- completion percent;
- favorite count;
- entered/valid/unique/duplicate/invalid link counts;
- completed challenges.

Текст/название категории в payload не передаётся.

### По заданиям

Для каждого `taskId`:

- `categoryId`;
- checked;
- favorite;
- entered/valid/unique/duplicate/invalid link counts;
- completed challenges.

Текст задания и URL не передаются.

Это позволяет считать popularity/skip/favorite rates и эффективность заданий без сбора пользовательского контента.

### Цели сезона

Для каждой quota отправляются только `quotaId` и numeric target/null.

### Longitudinal engagement

В браузере собираются агрегированные counters, а не raw clickstream:

- first opened / last active;
- active days;
- session count;
- total active seconds;
- export/import/reset counts;
- task/favorite/category toggle counts;
- collapse-all / expand-all counts;
- количество завершённых редактирований ссылок;
- first task / first linked post / first challenge / halfway / last completed task timestamps.

### Daily aggregates

До 730 локальных дневных записей:

- день;
- active seconds;
- sessions;
- task/favorite/category toggles;
- link commits;
- exports;
- import attempts/successes;
- resets.

Отдельного журнала каждого клика с точным временем нет.

### Coarse client context

Для анализа UI/accessibility отправляется только низкоэнтропийный контекст:

- bucket ширины viewport;
- coarse input mode;
- reduced-motion preference;
- light/dark preference;
- browser language.

Raw User-Agent fingerprint не отправляется.

---

## Apps Script gateway

`google-apps-script/Code.gs` независимо проверяет payload до записи:

- максимум 512 KiB;
- exact nested schemas;
- UUIDv4;
- allowlist origin;
- policy текущего шаблона (289 tasks / 21 categories / 8 quotas);
- уникальные IDs;
- ranges/types/string limits;
- dangerous-key rejection;
- арифметические invariants ссылок;
- сверку task -> category -> overall aggregates;
- сверку daily -> engagement;
- challenge bounds;
- защиту Google Sheets от formula injection;
- global script lock;
- duplicate submission UUID;
- приблизительные minute/hour rate budgets.

Endpoint остаётся анонимным: это сильная validation/integrity защита, но не доказательство личности человека.

### Dual sink retry

Google Sheets и Supabase — независимые idempotent sinks. Если один успел записать данные, а второй временно упал, retry с тем же `submissionId` не дублирует успешную сторону и может дозаписать вторую.

---

## Google Sheets

`setupReceiver()` создаёт/проверяет tabs:

- `Submissions`;
- `Categories`;
- `Tasks`;
- `Quotas`;
- `Daily`.

В них сохраняется нормализованная аналитика без raw URL/post text.

---

## Supabase PostgreSQL

Выполните `supabase/schema.sql` через Supabase SQL Editor.

Создаются:

- `analytics_submissions`;
- `analytics_categories`;
- `analytics_tasks`;
- `analytics_quotas`;
- `analytics_daily`;
- indexes;
- RLS tables без доступа для `anon`/`authenticated`;
- transactional RPC `ingest_analytics_submission(jsonb)`;
- views `analytics_template_summary`, `analytics_task_popularity`, `analytics_category_performance`, `analytics_daily_engagement`.

Повтор того же `submissionId` считается безопасным duplicate и не создаёт второй dataset.

### Supabase secret

Используйте современный `sb_secret_...` key. Он хранится только в Apps Script Script Properties и **никогда** не помещается в GitHub/HTML/JS.

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_REQUIRED=false
```

После полного staging:

```text
SUPABASE_REQUIRED=true
```

---

## Включение remote collection

По умолчанию repository оставляет её выключенной до готовности backend.

В `checklist.html`:

```json
{
  "templateVersion": "2026-11-22",
  "challengeCategoryName": "Челленджи",
  "challengeCompleteThreshold": 10,
  "finalStatsEnabled": true,
  "finalStatsUrl": "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
}
```

Только `/exec`, не `/dev`.

---

## Локальная проверка

```powershell
py -m http.server 4174 --bind 127.0.0.1
node tests/check-static.mjs
node tests/check-analytics.mjs
```

---

## Ограничения

- Анонимный static client не может криптографически доказать личность пользователя.
- `participantId`, origin и analytics значения в принципе можно подделать намеренным клиентом.
- Cache-based rate limit Apps Script — best effort.
- `sb_secret_...` bypasses RLS и обязан оставаться server-side; при утечке его нужно немедленно rotate/revoke.
- Browser-local state не является cloud sync.
- Реальные Google/Supabase quotas и permissions необходимо проверить на staging владельца.

Подробности: `SECURITY-REVIEW.md`, `ANALYTICS-SECURITY.md`, `REMEDIATION-EVIDENCE.md`.
