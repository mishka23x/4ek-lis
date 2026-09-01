# 4ek-lis — hardened GitHub Pages checklist + secure analytics

> **English:** [jump to English](#english) · **Русский:** [перейти к русской версии](#русский)
>
> Fork: `mishka23x/4ek-lis` · Upstream: `365grain/4ek-lis`
>
> This fork is intentionally maintained separately from the upstream owner's live repository. The hardening and analytics work described here is merged into the fork's `main`; it does **not** modify `365grain/4ek-lis:main`.

For the full chronological installation/configuration procedure, use **[`SETUP-GUIDE.md`](SETUP-GUIDE.md)**.

---

<a id="english"></a>

# English

## What this project is

**4ek-lis** is a dependency-free static web organizer for LiveJournal seasonal marathons, hashtags, writing prompts and challenges. The normal user experience runs entirely in the browser and remains compatible with **GitHub Pages** and ordinary static hosting.

The checklist currently provides:

- 21 structured categories and 289 tasks;
- 8 user-configurable seasonal targets/quotas;
- task completion checkboxes;
- per-task hearts/favorites;
- one or more post-link fields for completed tasks;
- invalid-link detection;
- duplicate-link detection and unique-link statistics;
- challenge statistics and completed-challenge calculation;
- per-category completion counters;
- global completed/total progress and percentage;
- category collapse/expand and collapse-all/expand-all;
- lightweight milestone celebrations;
- browser-local persistence with no account requirement;
- JSON export/backup and restore;
- reset with confirmation;
- a separate FAQ page;
- an optional end-of-season rich **derived analytics** submission system.

The frontend remains plain **HTML + CSS + JavaScript**. There is no frontend framework, bundler, analytics SDK, Supabase browser client, runtime package dependency, tracker or mandatory application server.

## Current architecture

```text
GitHub Pages / static hosting
        |
        | browser keeps raw checklist state locally
        |
        | optional HTTPS POST of derived analytics only
        v
Google Apps Script gateway
        |
        +------------------------+
        |                        |
        v                        v
Google Sheets                Supabase PostgreSQL
normalized reporting        normalized analytics database
```

### Important security boundary

The browser does **not** connect to Supabase directly.

A modern Supabase `sb_secret_...` key lives only in **Google Apps Script Script Properties**. It is never placed in GitHub Pages HTML/JavaScript, committed to Git, returned by the gateway, or exposed through the public browser source.

The browser also does **not** submit actual user post URLs or post contents to the analytics backend.

## Recent analytics/security expansion

The original hardened statistics submission deliberately reduced the payload to a very small aggregate. That was secure, but it removed useful statistical signal. The current analytics schema expands the useful derived data while keeping raw content private.

### Analytics schema v2 can submit

#### Technical/delivery context

- schema version;
- analytics implementation version;
- submission UUID;
- persistent pseudonymous participant UUID;
- checklist/template version;
- source origin;
- snapshot-generation timestamp.

#### Overall participation

- total tasks;
- checked tasks;
- completion percentage;
- total categories;
- categories started;
- fully completed categories;
- total entered link count;
- valid-link count;
- unique valid-link count;
- duplicate-link count;
- invalid-link count;
- favorite count;
- challenge-link count;
- completed-challenge count;
- tasks with links;
- tasks with multiple links;
- maximum links on one task.

#### Per-category derived data

For each category ID:

- total tasks;
- checked count;
- completion percentage;
- favorites;
- entered links;
- valid links;
- unique valid links;
- duplicates;
- invalid links;
- completed challenges where applicable.

#### Per-task derived data

For each task ID:

- category ID;
- checked/not checked;
- favorite/not favorite;
- entered-link count;
- valid-link count;
- unique-valid-link count;
- duplicate count;
- invalid-link count;
- completed-challenge count.

The backend already knows the trusted template for a template version, so the client does **not** need to transmit task text or category text.

#### Seasonal targets

For each quota ID:

- numeric target, or `null` if unset.

#### Engagement/progression aggregates

- first opened timestamp;
- last active timestamp;
- active-day count;
- session count;
- accumulated active seconds;
- export count;
- import attempts;
- successful imports;
- reset count;
- task-toggle count;
- favorite-toggle count;
- category-toggle count;
- collapse-all count;
- expand-all count;
- committed-link-edit count;
- first task completion timestamp;
- first linked post timestamp;
- first challenge completion timestamp;
- halfway timestamp;
- last task completion timestamp.

#### Daily aggregates

Up to 730 days of local daily aggregate history can be retained, including:

- active seconds;
- sessions;
- task toggles;
- favorite toggles;
- category toggles;
- link commits;
- exports;
- import attempts/successes;
- resets.

This is deliberately **not** a raw timestamped clickstream.

#### Low-entropy client context

- coarse viewport bucket;
- touch/pointer/mixed input category;
- reduced-motion preference;
- light/dark preference;
- browser language.

The code intentionally does not collect a raw User-Agent fingerprint.

## Data that remains local and is not submitted

The analytics system intentionally excludes:

- actual post URLs;
- post contents;
- task text;
- category text;
- imported backup file contents;
- arbitrary `localStorage` contents;
- browser history;
- raw clickstream events;
- raw User-Agent strings;
- passwords, emails, phone numbers or authentication credentials;
- Supabase keys or database credentials.

## Pseudonymous participant identity

The analytics layer creates a random browser-local `participantId` with `crypto.randomUUID()` and keeps it separate from a per-submission `submissionId`.

This enables useful longitudinal analysis such as returning-participant rates and season-to-season behavior without requiring account registration.

It is **not authentication**: clearing browser storage creates a new identifier, and a malicious client can fabricate one.

## Google Apps Script gateway

The Apps Script backend is the only public ingestion gateway.

It:

- validates the exact analytics schema;
- validates UUIDs, template version, counts, bounds and allowed IDs;
- checks aggregate invariants instead of trusting arbitrary totals;
- rejects unknown fields and dangerous object keys;
- validates the source origin against the configured allowlist;
- protects Google Sheets from spreadsheet-formula injection;
- rate-limits anonymous submissions on a best-effort global basis;
- uses `LockService` to serialize critical writes;
- uses one submission UUID across all sinks;
- supports safe retry when only one sink succeeds;
- never returns the Supabase secret in health/error responses.

The supplied gateway writes five normalized Google Sheets tabs:

- `Submissions`
- `Categories`
- `Tasks`
- `Quotas`
- `Daily`

## Supabase PostgreSQL backend

`supabase/schema.sql` creates a normalized analytics model:

- `analytics_submissions`
- `analytics_categories`
- `analytics_tasks`
- `analytics_quotas`
- `analytics_daily`

It also creates analytical views:

- `analytics_template_summary`
- `analytics_task_popularity`
- `analytics_category_performance`
- `analytics_daily_engagement`

### Database security

The supplied SQL:

- enables Row Level Security on analytics tables;
- revokes table access from `public`, `anon` and `authenticated`;
- does not expose the analytics tables to the GitHub Pages browser;
- exposes ingestion only to the elevated backend role;
- uses a `SECURITY DEFINER` ingestion RPC with a fixed `search_path`;
- writes a submission and all child rows transactionally;
- uses `submission_id` as the primary idempotency key.

A current Supabase secret key has elevated/service-role privileges and bypasses RLS, so it must stay strictly server-side. In this architecture it exists only in Apps Script Script Properties.

## Dual-sink reliability

One submission UUID is shared by browser, Apps Script, Sheets and Supabase.

If Sheets succeeds and Supabase temporarily fails, or vice versa, the client retains the pending UUID. Retrying does not duplicate the already-successful sink:

- Sheets checks for the existing `submissionId`;
- Supabase uses the submission UUID as its primary idempotency key.

## Core security remediation retained

The analytics expansion keeps the earlier hardening work:

- imported persistent DOM-XSS path removed;
- trusted repository template separated from untrusted mutable backup/progress state;
- rendering uses DOM/text APIs rather than unsafe HTML injection sinks;
- restrictive Content Security Policy;
- executable JavaScript moved to same-origin external files;
- 5 MiB bounded import;
- strict schema/type/known-ID validation;
- prototype-pollution/dangerous-key rejection;
- HTTP(S)-only dynamic URL handling;
- `noopener noreferrer` for new-tab links;
- storage corruption/quota/security failures contained with in-memory fallback/recovery behavior;
- legacy duplicated task-ID migration;
- duplicate-link statistics fixed;
- challenge calculation corrected with floor division;
- safe import/export lifecycle.

## Accessibility/mobile/performance retained

The hardened UI includes:

- skip links;
- semantic heading/section structure;
- proper labels and accessible names;
- native `<progress>`;
- ARIA state/error relationships;
- strong keyboard focus indicators;
- reduced-motion support;
- forced-colors support;
- larger mobile targets;
- mobile-safe input sizing;
- grid/flex overflow hardening;
- long-token wrapping;
- safe-area-aware measured footer clearance;
- reserved cover aspect ratio to reduce layout shift.

Normal interactions use incremental updates, delegated events, indexed URL occurrences and compact mutable state rather than repeatedly rebuilding/storing the full template.

## JavaScript separation

The current frontend keeps analytics separate from core product behavior:

```text
checklist.js
   loader
   |
   +--> checklist-core.js   hardened checklist behavior
   |
   +--> analytics.js        derived analytics + optional submit path

faq.js
   loader/privacy adapter
   |
   +--> faq-core.js         hardened FAQ renderer
```

This reduces the chance that analytics work destabilizes the core checklist.

## Apps Script files

- `google-apps-script/Code.gs` — analytics validation, Sheets writes, Supabase mirroring, idempotency and rate controls.
- `google-apps-script/Compat.gs` — small compatibility shim needed because Apps Script V8 does not expose every browser Web API used by ordinary JavaScript environments.
- `google-apps-script/appsscript.json` — V8 manifest with explicit Sheets and external-request OAuth scopes.
- `google-apps-script/README.md` — component-specific notes.

## Supabase files

- `supabase/schema.sql` — complete schema, permissions, RPC and views.
- `supabase/README.md` — component-specific notes and example queries.

## Testing/evidence

Relevant files include:

- `tests/check-static.mjs`
- `tests/check-analytics.mjs`
- browser/Playwright regression scripts in `tests/`
- `REMEDIATION-EVIDENCE.md`
- `SECURITY-REVIEW.md`
- `ANALYTICS-SECURITY.md`

Useful local checks:

```powershell
node tests/check-static.mjs
node tests/check-analytics.mjs
node --check checklist.js
node --check checklist-core.js
node --check analytics.js
node --check faq.js
node --check faq-core.js
```

## Analytics is disabled by default

The repository deliberately ships with:

```json
"finalStatsEnabled": false,
"finalStatsUrl": ""
```

Normal GitHub Pages checklist functionality works without Google Apps Script or Supabase.

Only enable collection after the complete staging procedure in **[`SETUP-GUIDE.md`](SETUP-GUIDE.md)** has passed.

## Deployment/setup

Use the full bilingual chronological guide:

**[`SETUP-GUIDE.md`](SETUP-GUIDE.md)**

It covers, in order:

1. GitHub Pages publishing;
2. Supabase Free project creation;
3. running `supabase/schema.sql`;
4. obtaining a modern backend-only `sb_secret_...` key;
5. creating the Apps Script project;
6. installing `Code.gs`, `Compat.gs` and `appsscript.json`;
7. reviewing `OWNER_SETUP`;
8. running Apps Script self-tests and `setupReceiver()`;
9. configuring Script Properties;
10. validating Supabase connectivity;
11. deploying the Apps Script `/exec` Web App;
12. health checking;
13. staging the GitHub Pages client;
14. verifying Sheets and Supabase together;
15. enabling `SUPABASE_REQUIRED`;
16. activating analytics in production;
17. monitoring, rotation, rollback and future-season updates.

---

<a id="русский"></a>

# Русский

## Что это за проект

**4ek-lis** — статический веб-органайзер без runtime-зависимостей для сезонных марафонов LiveJournal, хешмобов, тем публикаций и челленджей. Обычная работа пользователя выполняется полностью в браузере и остаётся совместимой с **GitHub Pages** и любым обычным статическим хостингом.

Текущий чек-лист предоставляет:

- 21 структурированную категорию и 289 заданий;
- 8 настраиваемых пользователем целей/квот на сезон;
- checkbox выполнения заданий;
- сердечки/избранное для каждого задания;
- одно или несколько полей ссылок для выполненного задания;
- обнаружение некорректных ссылок;
- обнаружение дубликатов и статистику уникальных ссылок;
- статистику челленджей и подсчёт выполненных челленджей;
- прогресс по каждой категории;
- общий completed/total progress и процент;
- сворачивание/разворачивание категорий и кнопки «свернуть всё / развернуть всё»;
- лёгкие milestone-поздравления;
- локальное хранение в браузере без регистрации;
- JSON backup/export и восстановление;
- сброс с подтверждением;
- отдельную страницу ЧАВО;
- необязательную отправку расширенного **производного аналитического снимка** по итогам сезона.

Frontend остаётся обычным **HTML + CSS + JavaScript**. Нет frontend-фреймворка, bundler, analytics SDK, Supabase browser client, обязательного package/runtime dependency, tracker или обязательного application server.

## Текущая архитектура

```text
GitHub Pages / статический хостинг
        |
        | сырое состояние чек-листа остаётся в браузере
        |
        | необязательный HTTPS POST только производной аналитики
        v
Google Apps Script gateway
        |
        +------------------------+
        |                        |
        v                        v
Google Sheets                Supabase PostgreSQL
нормализованные отчёты      нормализованная аналитическая БД
```

### Важная граница безопасности

Браузер **не подключается к Supabase напрямую**.

Современный Supabase ключ `sb_secret_...` хранится только в **Google Apps Script Script Properties**. Он никогда не размещается в HTML/JavaScript GitHub Pages, не commit-ится в Git, не возвращается gateway и не появляется в публичном исходном коде браузера.

Браузер также **не отправляет реальные URL пользовательских постов или содержимое публикаций** в аналитический backend.

## Последнее расширение аналитики и безопасности

Первая усиленная версия намеренно уменьшила финальную статистику до очень маленького payload. Это было безопасно, но убрало часть полезного статистического сигнала. Текущая schema v2 возвращает богатую производную аналитику, не отправляя сырой пользовательский контент.

### Analytics schema v2 может отправлять

#### Технический контекст доставки

- версию schema;
- версию analytics implementation;
- UUID конкретной отправки;
- постоянный псевдонимный UUID участника в данном браузере;
- версию шаблона/чек-листа;
- source origin;
- timestamp создания снимка.

#### Общий прогресс

- всего заданий;
- отмечено заданий;
- процент выполнения;
- всего категорий;
- начатые категории;
- полностью завершённые категории;
- общее количество введённых ссылок;
- количество корректных ссылок;
- количество уникальных корректных ссылок;
- количество дубликатов;
- количество некорректных ссылок;
- количество избранных заданий;
- количество ссылок в челленджах;
- количество выполненных челленджей;
- задания со ссылками;
- задания с несколькими ссылками;
- максимальное количество ссылок у одного задания.

#### Производная статистика по категориям

Для каждого category ID:

- всего заданий;
- выполнено;
- процент выполнения;
- избранное;
- введённые ссылки;
- корректные ссылки;
- уникальные корректные ссылки;
- дубликаты;
- некорректные ссылки;
- выполненные челленджи, где применимо.

#### Производная статистика по заданиям

Для каждого task ID:

- category ID;
- выполнено/не выполнено;
- favorite/not favorite;
- количество введённых ссылок;
- количество корректных ссылок;
- количество уникальных корректных ссылок;
- количество дубликатов;
- количество некорректных ссылок;
- количество выполненных челленджей.

Backend уже знает доверенный шаблон для соответствующей `templateVersion`, поэтому клиенту не требуется отправлять текст задания или название категории.

#### Цели на сезон

Для каждого quota ID:

- числовая цель или `null`, если не задана.

#### Engagement/progression aggregates

- первое открытие;
- последняя активность;
- количество активных дней;
- количество сессий;
- суммарное активное время;
- количество export;
- попытки import;
- успешные import;
- количество reset;
- task toggles;
- favorite toggles;
- category toggles;
- collapse-all;
- expand-all;
- подтверждённые редактирования ссылок;
- время первого выполненного задания;
- время первой добавленной корректной ссылки;
- время первого выполненного челленджа;
- момент достижения половины чек-листа;
- время последнего выполненного задания.

#### Дневные агрегаты

Локально может храниться до 730 дней агрегированной истории:

- активные секунды;
- sessions;
- task toggles;
- favorite toggles;
- category toggles;
- link commits;
- exports;
- import attempts/successes;
- resets.

Это специально **не** сырая поминутная/посекундная история кликов.

#### Низкоэнтропийный client context

- грубая категория ширины viewport;
- touch/pointer/mixed input;
- reduced-motion preference;
- light/dark preference;
- язык браузера.

Код специально не собирает raw User-Agent fingerprint.

## Что остаётся локально и не отправляется

Аналитика намеренно исключает:

- реальные URL постов;
- содержимое постов;
- текст заданий;
- текст категорий;
- содержимое импортированных backup-файлов;
- произвольное содержимое `localStorage`;
- browser history;
- raw clickstream;
- raw User-Agent;
- пароли, email, телефоны или auth credentials;
- Supabase keys или database credentials.

## Псевдонимный participant ID

Analytics layer создаёт случайный локальный `participantId` через `crypto.randomUUID()` отдельно от `submissionId` конкретной отправки.

Это позволяет считать returning participants и сравнивать сезоны без обязательной регистрации пользователя.

Это **не аутентификация**: очистка browser storage создаёт новый identifier, а злоумышленник может подделать UUID.

## Google Apps Script gateway

Apps Script является единственной публичной точкой приёма аналитики.

Он:

- проверяет точную analytics schema;
- валидирует UUID, template version, counts, bounds и разрешённые IDs;
- проверяет инварианты агрегатов, а не доверяет произвольным total значениям;
- отклоняет неизвестные поля и опасные object keys;
- проверяет source origin по allowlist;
- защищает Google Sheets от spreadsheet-formula injection;
- применяет best-effort global rate limiting;
- использует `LockService` для критических записей;
- использует один submission UUID во всех storage sinks;
- позволяет безопасно повторить отправку при частичном сбое;
- никогда не возвращает Supabase secret в public health/error responses.

Gateway создаёт пять нормализованных вкладок Google Sheets:

- `Submissions`
- `Categories`
- `Tasks`
- `Quotas`
- `Daily`

## Supabase PostgreSQL backend

`supabase/schema.sql` создаёт:

- `analytics_submissions`
- `analytics_categories`
- `analytics_tasks`
- `analytics_quotas`
- `analytics_daily`

и аналитические views:

- `analytics_template_summary`
- `analytics_task_popularity`
- `analytics_category_performance`
- `analytics_daily_engagement`

### Безопасность базы данных

Предоставленный SQL:

- включает Row Level Security для analytics tables;
- отзывает table access у `public`, `anon`, `authenticated`;
- не предоставляет GitHub Pages browser прямой доступ к analytics tables;
- разрешает ingestion только elevated backend role;
- использует `SECURITY DEFINER` RPC с фиксированным `search_path`;
- записывает parent + child rows в одной транзакции;
- использует `submission_id` как основной idempotency key.

Современный Supabase secret key имеет elevated/service-role доступ и обходит RLS, поэтому он обязан оставаться server-side. В этой архитектуре он существует только в Apps Script Script Properties.

## Надёжность двух storage sinks

Один submission UUID используется браузером, Apps Script, Sheets и Supabase.

Если Sheets успешно записал данные, а Supabase временно не ответил — или наоборот — browser сохраняет pending UUID. Повтор не дублирует уже успешный sink:

- Sheets проверяет существующий `submissionId`;
- Supabase использует submission UUID как primary idempotency key.

## Сохранённые security remediation

Analytics expansion сохраняет предыдущие исправления:

- устранён persistent DOM-XSS через импорт;
- trusted repository template отделён от untrusted mutable backup/progress state;
- render использует DOM/text APIs вместо unsafe HTML sinks;
- строгий Content Security Policy;
- executable JavaScript вынесен в same-origin files;
- import ограничен 5 MiB;
- строгая schema/type/known-ID validation;
- защита от prototype pollution/dangerous keys;
- только HTTP(S) dynamic URLs;
- `noopener noreferrer` для new-tab links;
- storage corruption/quota/security failures не ломают приложение;
- migration старого duplicated task ID;
- исправлена статистика duplicate links;
- исправлен расчёт челленджей через floor division;
- безопасный import/export lifecycle.

## Accessibility/mobile/performance

Усиленный UI сохраняет:

- skip links;
- semantic heading/section structure;
- labels и accessible names;
- native `<progress>`;
- ARIA state/error relationships;
- заметный keyboard focus;
- reduced-motion support;
- forced-colors support;
- более крупные mobile targets;
- mobile-safe input sizing;
- grid/flex overflow hardening;
- перенос длинных токенов/URL;
- safe-area-aware measured footer clearance;
- зарезервированный aspect ratio обложки против layout shift.

Основные взаимодействия используют incremental updates, delegated events, indexed URL occurrences и компактное mutable state вместо постоянной полной перестройки/сохранения шаблона.

## Разделение JavaScript

```text
checklist.js
   loader
   |
   +--> checklist-core.js   основной hardened checklist
   |
   +--> analytics.js        derived analytics + optional submit

faq.js
   loader/privacy adapter
   |
   +--> faq-core.js         hardened FAQ renderer
```

Так analytics logic меньше рискует сломать основную функциональность чек-листа.

## Файлы Apps Script

- `google-apps-script/Code.gs` — validation, Google Sheets writes, Supabase mirroring, idempotency и rate controls.
- `google-apps-script/Compat.gs` — небольшой compatibility shim для различий Apps Script V8 и browser JavaScript APIs.
- `google-apps-script/appsscript.json` — V8 manifest с явными OAuth scopes для Sheets и external requests.
- `google-apps-script/README.md` — краткая component-specific документация.

## Файлы Supabase

- `supabase/schema.sql` — полная schema, permissions, RPC и views.
- `supabase/README.md` — краткая component-specific документация и запросы.

## Testing/evidence

Основные файлы:

- `tests/check-static.mjs`
- `tests/check-analytics.mjs`
- browser/Playwright regression scripts в `tests/`
- `REMEDIATION-EVIDENCE.md`
- `SECURITY-REVIEW.md`
- `ANALYTICS-SECURITY.md`

Локальные проверки:

```powershell
node tests/check-static.mjs
node tests/check-analytics.mjs
node --check checklist.js
node --check checklist-core.js
node --check analytics.js
node --check faq.js
node --check faq-core.js
```

## Аналитика по умолчанию отключена

Репозиторий специально поставляется с:

```json
"finalStatsEnabled": false,
"finalStatsUrl": ""
```

Обычный чек-лист GitHub Pages работает без Google Apps Script и Supabase.

Включайте сбор только после полного staging-процесса из **[`SETUP-GUIDE.md`](SETUP-GUIDE.md)**.

## Установка и настройка

Используйте полный двуязычный хронологический guide:

**[`SETUP-GUIDE.md`](SETUP-GUIDE.md)**

Он последовательно описывает:

1. GitHub Pages;
2. создание Supabase Free project;
3. запуск `supabase/schema.sql`;
4. получение современного backend-only `sb_secret_...`;
5. создание Google Apps Script project;
6. установку `Code.gs`, `Compat.gs`, `appsscript.json`;
7. проверку `OWNER_SETUP`;
8. self-tests и `setupReceiver()`;
9. Script Properties;
10. проверку Supabase connection;
11. deployment Apps Script `/exec` Web App;
12. health check;
13. staging GitHub Pages client;
14. совместную проверку Sheets + Supabase;
15. включение `SUPABASE_REQUIRED`;
16. production activation analytics;
17. monitoring, key rotation, rollback и обновление нового сезона.
