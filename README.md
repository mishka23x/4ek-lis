# 4ek-lis — LiveJournal Marathon Checklist / Чек-лист марафона LiveJournal

> **Languages / Языки:** [English](#english) · [Русский](#русский)
>
> This fork contains a reviewable hardening/remediation branch for the original `365grain/4ek-lis` static web application. The original owner's `main` branch is not modified by this branch.
>
> Этот форк содержит отдельную ветку с исправлениями и усилением исходного статического веб-приложения `365grain/4ek-lis`. Ветка `main` владельца исходного репозитория этой веткой не изменяется.

---

<a id="english"></a>

# English

## 1. What this project is

**4ek-lis** is a dependency-free static web organizer for LiveJournal seasonal marathons, hashtags, writing prompts and challenges.

It is designed to help a participant:

- browse a large structured list of writing ideas and marathon tasks;
- choose which tasks they want to complete;
- mark tasks as completed;
- save one or more post links for completed tasks;
- mark interesting tasks with a heart/favorite;
- define personal seasonal publication targets;
- see per-category and overall progress;
- count valid unique post links and challenge completions;
- collapse or expand categories to make a very large checklist manageable;
- preserve progress locally in the browser without requiring an account;
- export progress to a JSON backup and restore it later;
- use a separate FAQ page explaining the checklist and its behavior;
- optionally submit a **minimal aggregate end-of-season result** to an owner-controlled Google Apps Script receiver when that feature is explicitly configured and enabled.

The application remains intentionally simple: production is still ordinary **HTML + CSS + JavaScript + the existing image asset**. There is no frontend framework, bundler, runtime package manager, analytics SDK, tracker, font CDN, service worker or mandatory backend.

It can be hosted directly with **GitHub Pages** or any normal static web server.

---

## 2. Repository comparison and remediation status

The remediation work was made from the current upstream baseline:

- **Original repository:** `365grain/4ek-lis`
- **Original baseline branch:** `main`
- **Baseline commit:** `e63cc76efe9420b902f90be6597e60392daf7371`
- **Fork:** `mishka23x/4ek-lis`
- **Remediation branch:** `codex/ui-a11y-security-performance-hardening-20260831`
- **Remediation code head before this documentation update:** `ecac32bfb2bf9c227b0f4f22e1fb5140885dd67b`

Before this expanded README documentation commit, the remediation branch was:

- **3 commits ahead** of upstream `main`;
- **0 commits behind** upstream `main`;
- based directly on the same upstream merge base;
- changing **21 files** in total;
- adding approximately **2,739 lines** and removing approximately **629 lines**;
- modifying three original files (`README.md`, `index.html`, `checklist.html`) and adding the remaining remediation/support files.

The three implementation commits are:

1. `d3adfd9d148c898f78ae71e652157f80e4de2306` — **Harden checklist state, rendering, responsive UI and accessibility**
2. `17a42d136fd806a73c4c4803934242b8332d3168` — **Add aggregate Google Apps Script statistics receiver**
3. `ecac32bfb2bf9c227b0f4f22e1fb5140885dd67b` — **Add local regression fixtures and remediation evidence**

This README is documentation on top of those implementation commits.

---

## 3. Product behavior intentionally preserved

The remediation is not a redesign of the product concept and does not replace the owner's checklist content.

The following were intentionally preserved:

- Russian-language user-facing checklist content;
- FAQ questions and answers;
- category/task ordering;
- punctuation and emoji;
- hashtags;
- LiveJournal links;
- buttons, labels, placeholders and status/error wording where the original behavior depended on them;
- the overall visual identity: warm paper background, green/amber palette and card-based checklist presentation;
- browser-local progress storage;
- JSON backup/restore workflow;
- reset semantics;
- hearts/favorites;
- category collapsing;
- progress/statistics concept;
- celebration/milestone behavior;
- static-hosting architecture.

The validation pass compared trusted visible checklist/FAQ data and normalized rendered text against the baseline so that implementation hardening did not silently rewrite the actual marathon content.

---

## 4. Current functionality and capabilities

### 4.1 No registration or password required

The site is a static client-side application. A user does not need to register or sign in.

The nickname field is a local label used by the checklist and, if end-of-season aggregate submission is later enabled, may be included in that aggregate submission.

### 4.2 Seasonal targets

The checklist currently contains **8 seasonal target/quota fields**. Participants can enter their own goals for different types of posts or marathon activity.

Quota values are saved with the rest of browser-local progress.

### 4.3 Large structured checklist

The current trusted template contains:

- **21 categories**;
- **289 tasks**;
- category descriptions where applicable;
- task text that may contain safe bold text or HTTP(S) links.

The template itself is trusted repository content rather than user-controlled imported content.

### 4.4 Task completion

Each task has a checkbox.

When checked:

- the task is visually marked as complete;
- the category completion count is updated;
- the global progress count and percentage are updated;
- link-entry fields become available for that task;
- progress is persisted locally.

Clicking ordinary task text toggles the checkbox for convenience, while clicking an actual link inside task text **does not** toggle the task.

### 4.5 Hearts / favorites

Each task has a heart button that can be toggled independently of completion.

The favorite state is stored locally and exposes proper pressed-state semantics to assistive technology.

### 4.6 Post-link organizer

A completed task can contain one or more post URLs.

The link editor:

- automatically provides another empty link field after the last populated field;
- accepts normal HTTP and HTTPS URLs;
- rejects malformed or non-HTTP(S) values from statistics/navigation use;
- displays an invalid-link warning;
- detects duplicate URLs across the checklist;
- removes URL fragments when determining duplicate identity, so the same page with a different `#fragment` is still treated as the same underlying post;
- keeps meaningful URL paths distinct;
- never converts `javascript:` or other unsafe schemes into executable navigation.

### 4.7 Duplicate-aware statistics

Duplicate post links are warned about on every occurrence but count only once in statistics.

The local statistics card currently shows:

- total number of **valid unique post links**;
- valid unique links belonging to the `Челленджи` category;
- number of completed challenges.

Challenge completion uses the configured threshold of **10 valid unique links per completed challenge** and now correctly uses `Math.floor(count / 10)`. For example:

- 10 links = 1 completed challenge;
- 11 links = still 1 completed challenge;
- 20 links = 2 completed challenges.

### 4.8 Category and global progress

Each category displays its own completed-task count.

The fixed footer displays:

- completed tasks / total tasks;
- a native progress bar;
- completion percentage.

The footer dynamically reserves enough page space so content and keyboard focus are not hidden behind it.

### 4.9 Collapse / expand controls

Every category can be collapsed or expanded individually.

There are also global controls to:

- collapse all categories;
- expand all categories.

Collapsed state is saved locally and restored on reload.

### 4.10 Milestone celebrations

The checklist retains the original lightweight gamification/celebration concept.

Milestone messages/particles can appear after configured link-count milestones, including global milestones and multiple links associated with one task.

Users who request reduced motion receive the milestone message without the animated particle effect.

### 4.11 Browser-local persistence

Normal user progress is stored in `localStorage` under:

```text
ljMarathonState_v1
```

Persisted mutable data includes relevant items such as:

- nickname;
- seasonal quota targets;
- task completion;
- task links;
- hearts/favorites;
- collapsed categories;
- milestone state;
- optional final-submission state.

The application intentionally does **not** require cloud synchronization.

Because storage is browser-local, progress is normally specific to that browser/device. Clearing site/browser storage or reinstalling the browser can remove it unless the user has exported a backup.

### 4.12 Backup and restore

Users can export their progress to:

```text
marathon-progress.json
```

and later restore it through the existing import control.

The hardened importer now:

- limits imports to **5 MiB**;
- validates structure, types, bounds and known IDs;
- rejects dangerous object keys such as `__proto__`, `constructor` and `prototype`;
- does not allow a backup to replace the trusted repository template, cover or network configuration;
- safely migrates supported legacy state;
- clears the file input after success/failure so the same file can be selected again;
- preserves the current application when an invalid import fails.

Export-created object URLs are revoked after download rather than leaking for the remainder of the page session.

### 4.13 Reset

The reset action clears progress-related state such as:

- checkboxes;
- post links;
- quota targets;
- milestone state.

It keeps the nickname, matching the intended existing behavior.

The reset requires explicit confirmation.

### 4.14 FAQ page

`index.html` is the FAQ page and `checklist.html` is the main checklist.

The FAQ:

- uses native `<details>/<summary>` disclosure controls;
- explains registration, nickname use, local browser storage, backup behavior, hearts, celebrations, URL warnings, marathon/challenge philosophy and other common questions;
- links back to the checklist;
- links to the LiveJournal 4ek-lis page for additional contact/information.

### 4.15 Optional end-of-season aggregate submission

A hardened optional final-statistics path is supplied, but **collection is disabled by default**.

The send control remains hidden unless both of the following are true:

1. `finalStatsEnabled` is `true`;
2. `finalStatsUrl` is a valid HTTPS `script.google.com/.../exec` deployment URL.

The client no longer uses a browser-visible token as if it were a secret.

When explicitly enabled, the current client sends only this aggregate contract:

- `schemaVersion`;
- `type`;
- `submissionId` (UUID);
- `templateVersion`;
- `sourceOrigin`;
- `nick`;
- `checkedCount`.

It does **not** send the user's saved post links, task text, categories, imported backup, or full local progress.

A failed submission keeps the same pending UUID so a retry can be deduplicated instead of creating accidental duplicate rows.

---

## 5. Architecture before and after remediation

### Original baseline

The original repository was an extremely small static project containing essentially:

- `README.md`;
- `index.html`;
- `checklist.html`;
- `favicon.png`.

Most application logic lived inline inside the HTML pages.

### Hardened branch

The product is still static, but responsibilities are now clearer:

| File / area | Current responsibility |
|---|---|
| `checklist.html` | Semantic/responsive checklist shell, styles, trusted embedded template JSON, application configuration and CSP |
| `checklist.js` | State validation/migration, safe rendering, interaction logic, link indexing/statistics, persistence, backup/restore, celebrations and optional final-submission client |
| `index.html` | Semantic/responsive FAQ shell, trusted FAQ JSON and CSP |
| `faq.js` | Safe FAQ rendering and safe rich-text/link handling |
| `favicon.png` | Existing favicon asset |
| `google-apps-script/Code.gs` | Optional aggregate end-of-season receiver |
| `google-apps-script/appsscript.json` | Minimal Apps Script manifest |
| `google-apps-script/README.md` | Receiver deployment/staging/operations runbook |
| `tests/check-static.mjs` | Dependency-free structural/security/copy regression check |
| `tests/fixtures/` | Legacy, malicious-import and prototype-pollution fixtures |
| `tests/playwright-*.js` | Reusable local browser regression/performance callbacks |
| `tests/README.md` | Local regression-test instructions |
| `SECURITY-REVIEW.md` | Security findings, trust boundaries and residual risks |
| `REMEDIATION-EVIDENCE.md` | Detailed evidence and validation results |
| `.gitignore` | Excludes local Playwright/test artifacts and dependencies |

JavaScript was moved out of executable inline `<script>` blocks into same-origin external files so the pages can use a much stricter script Content Security Policy. Trusted checklist/FAQ data remains embedded as non-executable `application/json`.

---

## 6. Security improvements

### 6.1 Imported persistent DOM-XSS path removed

The baseline imported state could include data that later flowed through generated HTML rendering.

The hardened version separates:

- **trusted release/template content** from the repository; and
- **untrusted mutable progress** from `localStorage` or imported backups.

Imported backups can update only validated mutable state. They cannot replace trusted title/template/category/task/cover/network content.

Checklist and FAQ dynamic content is constructed with DOM APIs and text nodes rather than unsafe HTML injection sinks. The hardened application contains no application `innerHTML`, `outerHTML`, `insertAdjacentHTML` or dynamic code-evaluation path for this rendering workflow.

### 6.2 Content Security Policy

Both pages now define a restrictive CSP.

The checklist policy restricts scripts to same-origin files and constrains image/connect/object/base/form behavior. The FAQ has an even smaller network surface.

Inline executable JavaScript is no longer required.

### 6.3 Safer dynamic links

Dynamic links are limited to HTTP(S).

New-tab links use:

```text
rel="noopener noreferrer"
```

to prevent opener-based attacks and reduce referrer exposure.

### 6.4 Import schema and prototype-pollution defense

Imported/local state is normalized against explicit fields, types, maximum sizes/counts and known IDs.

Dangerous prototype-related keys are rejected.

A malicious template fixture and prototype-pollution fixture are included in `tests/fixtures/`.

### 6.5 Public client token removed

The baseline contained a `FINAL_TOKEN` in browser JavaScript and pointed to an Apps Script `/dev` URL.

Anything embedded in public browser source is visible to every user and therefore cannot be treated as a secret.

The hardened design removes that token and changes the optional receiver to a validated anonymous aggregate endpoint.

### 6.6 `/exec` only when enabled

The client accepts the optional final endpoint only when it is:

- HTTPS;
- hosted at `script.google.com`;
- ending in `/exec`;
- explicitly enabled in application configuration.

An editor-only `/dev` deployment is no longer accepted for the production client path.

### 6.7 Hardened receiver

The supplied Google Apps Script receiver includes:

- strict expected-field validation;
- maximum request-body size;
- UUIDv4 validation;
- known-template/count bounds;
- configured origin allowlist as an anti-accident signal;
- nickname bounds/control-character checks;
- spreadsheet formula-prefix neutralization;
- `LockService` serialization around writes;
- durable submission-ID duplicate detection in the sheet;
- approximate global minute/hour rate budgets;
- safe public error/health responses that do not reveal spreadsheet IDs or internal configuration.

This is defensive validation for an **anonymous public endpoint**, not user authentication.

---

## 7. Data correctness and reliability improvements

### Duplicate task persistence ID

Two distinct tasks shared a legacy persistence ID. The remediation gives the second task its own ID and includes an idempotent migration that clones the legacy state so previously saved progress is not silently lost.

### Duplicate links

Duplicate URLs are now represented consistently, warn on every duplicate occurrence and contribute only once to unique-link statistics.

### Challenge-count bug

The old logic incremented completed challenges only when a task's link count was an exact multiple of the threshold. That meant 11 links could incorrectly stop representing one completed challenge.

The new calculation uses floor division, so accumulated challenge progress remains correct between exact multiples.

### Storage failure handling

`localStorage` access can fail because of browser privacy/security settings, quota exhaustion or storage corruption.

The hardened version:

- catches storage read/write failures;
- keeps the application usable in memory;
- displays a polite storage limitation message;
- preserves raw corrupt state under `ljMarathonState_v1_recovery` when possible before falling back to a clean state.

### Final-submission retry state

A pending submission UUID is persisted before sending. Network/server failures retain it; successful submission clears the pending state. This reduces accidental duplicate rows on retry.

---

## 8. Performance improvements

The baseline repeatedly rebuilt large portions of the application and wrote much larger state representations during common interactions.

The hardened version instead uses:

- one-time construction of the static checklist DOM;
- targeted task/category/link/stat/progress updates;
- delegated event handlers;
- a URL occurrence index rather than repeatedly rebuilding all duplicate information;
- debounced text/quota/nickname persistence;
- immediate persistence only where appropriate;
- compact mutable-only stored state rather than serializing the trusted full template into normal progress state.

Local Chromium measurements with **4× CPU throttling** recorded approximately:

| Scenario | Baseline | Hardened |
|---|---:|---:|
| First checkbox | ~230 ms | ~26 ms in initial benchmark; ~13 ms in the 2,890-link state |
| First URL input event | ~924 ms | ~4.4–6 ms |
| Category toggle | ~9.6 ms | ~1.8 ms normal; ~5.6 ms in large state |
| URL focusout with 2,890 links | full-dataset architecture | ~35 ms targeted occurrence update |
| Stored state after one task/link | ~62,431 characters | ~623 characters |

An intentionally extreme fixture with **2,880 populated URL inputs / 17,458 elements** was also exercised. Initial creation at 4× CPU throttle is still expensive (~8.7 seconds), but after construction the primary interactions remain responsive. This upper-bound cost is documented rather than hidden by virtualization that could interfere with find-in-page, accessibility or focus behavior.

---

## 9. Responsive/mobile improvements

The layout was hardened against the types of failures common in a very large form/checklist:

- explicit `min-width: 0` where grid/flex children previously forced overflow;
- `minmax(0, 1fr)` grid columns;
- safe wrapping for long headings, hashtags and URLs;
- mobile toolbar/control wrapping;
- URL controls that can shrink inside task cards;
- larger mobile interactive targets;
- at least 16px-equivalent mobile inputs to avoid unwanted iOS focus zoom;
- safe-area-aware footer spacing;
- dynamically measured fixed-footer clearance using `ResizeObserver`;
- reserved cover aspect ratio and explicit image dimensions to prevent layout shift;
- asynchronous cover decoding and `referrerpolicy="no-referrer"`.

Validated viewport widths included:

```text
320, 360, 375, 390, 412, 430, 480, 600,
768, 820, 1024, 1280, 1440, 1920 CSS px
```

Each required width returned no page-level horizontal overflow in the validation pass.

Additional checks included 2× text scale, long URL rows, iPhone-style input focus and end-of-page content clearance above the fixed progress footer.

---

## 10. Accessibility improvements

The remediation improves keyboard, semantic and assistive-technology behavior without changing the basic product workflow.

Notable changes include:

- Russian document language retained;
- skip links to the main content;
- semantic `main`, sections, headings, footer/status structure;
- improved heading hierarchy;
- visible/programmatic labels for inputs;
- native `<progress>` rather than a visual-only progress bar;
- category toggles with `aria-expanded` and `aria-controls`;
- heart buttons with `aria-pressed` and accessible names;
- invalid/duplicate URL fields with `aria-invalid` and `aria-describedby`;
- restrained live regions for status/error changes;
- strong `:focus-visible` outlines;
- forced-colors support;
- reduced-motion behavior;
- 44px-oriented mobile target sizing for important controls;
- fixed-footer-aware focus/scroll clearance;
- task links separated from checkbox activation so opening a task link does not unexpectedly toggle completion;
- native keyboard-accessible FAQ `<details>/<summary>` controls.

Local axe-core 4.10.3 WCAG 2 A/AA/2.2 AA scans at narrow and desktop widths reported **zero violations** for the tested checklist state and FAQ. Automated scanning is not treated as proof of perfect accessibility; manual keyboard, focus, zoom, reduced-motion, forced-colors and target-size checks were also performed.

---

## 11. Privacy model

### Normal operation

Checklist progress remains local to the user's browser/device.

The application does not need a user account and does not send normal task/link progress to a backend.

### Optional aggregate final statistics

If the owner later deploys and explicitly enables the supplied receiver, only the documented aggregate fields are sent.

Individual post links, task text, categories and backup data are not included in that submission.

### Existing remote cover image

The existing cover is still hosted by LiveJournal's image infrastructure. Loading any remote image naturally exposes ordinary request metadata such as IP address and browser/user-agent information to that image host. The checklist does not include local progress/nickname/links in the image request, and the image uses `referrerpolicy="no-referrer"`.

---

## 12. Validation and regression evidence

### Dependency-free structural check

Run:

```powershell
node tests/check-static.mjs
```

The recorded remediation pass validated:

- **8 quotas**;
- **21 categories**;
- **289 tasks**;
- unique task IDs;
- trusted visible-data/copy hashes;
- prohibited rendering/security sink checks;
- CSP expectations;
- receiver self-tests.

### Syntax and HTML

The remediation evidence records successful checks for:

```text
node --check checklist.js
node --check faq.js
V8-compatible Code.gs syntax
npx --yes html-validate checklist.html index.html
```

### Browsers

The primary manual/browser matrix included:

- Chrome;
- Edge;
- Firefox;
- WebKit/Safari;
- iPhone Safari emulation;
- Android Chrome emulation.

The tested engines rendered all 289 tasks without console errors or horizontal overflow, and exercised checkboxes, hearts, URLs, category collapse/expand and persistence.

### Security/reliability fixtures

Regression fixtures cover:

- valid legacy state migration;
- malicious imported template/cover/event markup;
- prototype-pollution keys;
- corrupt/malformed state;
- storage failure/quota errors;
- oversized imports;
- dangerous URL schemes;
- duplicate links;
- final-submission retry/failure behavior.

For the full evidence record see:

- [`REMEDIATION-EVIDENCE.md`](REMEDIATION-EVIDENCE.md)
- [`SECURITY-REVIEW.md`](SECURITY-REVIEW.md)
- [`tests/README.md`](tests/README.md)

---

## 13. Local development and manual preview

No dependency installation is required just to run the site.

From the repository root:

```powershell
py -m http.server 4174 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:4174/
http://127.0.0.1:4174/checklist.html
```

Run the structural regression check with:

```powershell
node tests/check-static.mjs
```

The Playwright helper scripts under `tests/` are development/test inputs only. Production does not load Playwright and has no Playwright runtime dependency.

---

## 14. GitHub Pages review workflow

The remediation branch is suitable for a separate GitHub Pages preview so the owner can manually test it without changing the upstream production branch.

Recommended model:

```text
365grain/4ek-lis:main
        │
        │ upstream baseline — do not modify during preview
        │
        └── mishka23x/4ek-lis
              └── codex/ui-a11y-security-performance-hardening-20260831
                    └── GitHub Pages manual preview/testing
```

Because this remains a static site, GitHub Pages can publish the remediation branch directly from `/ (root)` without a build step.

After manual acceptance, the branch can be proposed to the upstream owner through a pull request. Nothing reaches upstream `main` unless the owner explicitly merges that PR.

---

## 15. Optional Google Apps Script receiver

Collection is deliberately disabled in the repository defaults.

The complete receiver and deployment guide are here:

- [`google-apps-script/Code.gs`](google-apps-script/Code.gs)
- [`google-apps-script/appsscript.json`](google-apps-script/appsscript.json)
- [`google-apps-script/README.md`](google-apps-script/README.md)

After staging and deploying a public Apps Script web app, the owner would configure only the JSON block in `checklist.html`, for example:

```json
{
  "templateVersion": "2026-11-22",
  "challengeCategoryName": "Челленджи",
  "challengeCompleteThreshold": 10,
  "finalStatsEnabled": true,
  "finalStatsUrl": "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
}
```

Do **not** activate this until the owner has completed the staging checklist in `google-apps-script/README.md`.

---

## 16. Known limitations / residual risks

The remediation intentionally documents what remains outside the guarantees of a static site:

1. **Browser-local state is not cloud sync.** Another device/browser will not automatically receive the same progress.
2. **Clearing browser/site storage can remove progress.** Export a JSON backup when preservation matters.
3. **The optional Apps Script endpoint is anonymous.** Origin values and browser data cannot authenticate a person. Distributed abuse remains possible even with validation/rate controls.
4. **Apps Script production behavior still requires owner staging.** Google authorization, account quotas, deployment policy, Sheets permissions and real concurrency must be tested in the owner's environment before enabling collection.
5. **GitHub Pages cannot set all ideal HTTP response security headers from repository files.** Meta CSP provides strong browser-side defense, but a configurable host can additionally provide CSP headers, `X-Content-Type-Options`, framing policy and other response headers.
6. **The remote cover remains an external request.** Self-hosting it would remove that request if the owner has the necessary rights.
7. **The intentionally extreme thousands-of-links state has a non-trivial initial render cost.** Normal interactions remain optimized after construction.

---

## 17. Change/finding summary

| Area | Baseline issue / risk | Hardened result |
|---|---|---|
| Data | Duplicate persistence ID shared by two tasks | Separate ID + legacy migration preserves prior saved interpretation |
| Security | Imported persistent DOM-XSS path | Trusted template separated from imported mutable state; safe DOM rendering |
| Security | No CSP | Restrictive page CSP added; scripts moved to same-origin external files |
| Security | Unsafe/unbounded import graph | Exact schema/types/bounds/known IDs + 5 MiB limit + dangerous-key rejection |
| Security | Public `FINAL_TOKEN` treated as secret | Token removed; anonymous validated aggregate receiver design |
| Integration | `/dev` Apps Script URL in public client | Optional feature accepts enabled HTTPS `/exec` only |
| Privacy | Detailed/legacy final payload concerns | Optional submission reduced to seven aggregate fields |
| Data | Duplicate URLs could distort statistics | Canonical occurrence index; duplicate warnings; first occurrence counts |
| Data | Challenge counts wrong between threshold multiples | Floor-based completion calculation |
| Reliability | Storage corruption/errors could break or replace state | Guarded storage, in-memory fallback and recovery copy |
| Reliability | Import/export lifecycle weaknesses | Bounded validation, input reset, object-URL cleanup |
| Performance | Full re-render/write cascade | Static DOM + incremental updates + event delegation + compact state |
| Mobile | Horizontal overflow/long-token failures | Grid/flex minimum fixes, wrapping and tested responsive widths |
| Mobile | Small targets / iOS input zoom / footer overlap | Larger targets, mobile input sizing, safe-area + measured footer clearance |
| Layout | Cover could cause layout shift | Reserved aspect ratio + dimensions; measured CLS 0 in slow-cover test |
| Accessibility | Weak semantics/focus/state communication | Landmarks, labels, ARIA states, native progress, focus styles, reduced motion |
| UX | Final-send control visibility could be inconsistent | Hidden unless configuration is valid and explicitly enabled |

---

## 18. File-by-file remediation summary

- **`.gitignore`** — excludes local browser/test artifacts and dependency folders.
- **`README.md`** — project purpose, features, architecture, remediation summary, testing and operational documentation.
- **`checklist.html`** — hardened semantic/responsive shell, embedded trusted template/config JSON, CSP, stable cover/footer layout and external script loading.
- **`checklist.js`** — trusted-template validation, state schema/migration, safe DOM rendering, incremental UI, URL validation/deduplication/statistics, accessibility state, persistence, import/export/reset, celebrations and optional aggregate final submission.
- **`index.html`** — hardened semantic/responsive FAQ shell, CSP and embedded trusted FAQ data.
- **`faq.js`** — safe FAQ/rich-text renderer without unsafe HTML injection.
- **`google-apps-script/Code.gs`** — optional aggregate receiver with validation, locking, idempotency, formula safety and rate budgets.
- **`google-apps-script/appsscript.json`** — V8 Apps Script manifest with minimal Sheets scope.
- **`google-apps-script/README.md`** — owner setup, staging, deployment and operations guide.
- **`tests/check-static.mjs`** — dependency-free structural/security/copy regression test.
- **`tests/fixtures/legacy-v1.json`** — legacy migration fixture.
- **`tests/fixtures/malicious-template-v1.json`** — hostile imported-template fixture.
- **`tests/fixtures/prototype-pollution.json`** — prototype-pollution fixture.
- **`tests/playwright-local-validation.js`** — overflow, long URLs, task/link behavior, mobile input and footer checks.
- **`tests/playwright-final-mock.js`** — final-submission contract/retry/idempotency checks with a mocked receiver.
- **`tests/playwright-final-failures.js`** — invalid response and network-timeout recovery checks.
- **`tests/playwright-cls.js`** — cover layout-shift measurement.
- **`tests/playwright-large-state.js`** — very-large-state performance checks.
- **`tests/README.md`** — local regression workflow.
- **`SECURITY-REVIEW.md`** — detailed threat boundaries, security findings and residual risks.
- **`REMEDIATION-EVIDENCE.md`** — detailed validation evidence, measurements and finding disposition.

---

<a id="русский"></a>

# Русский

## 1. Что это за проект

**4ek-lis** — это статический веб-органайзер без внешних зависимостей для сезонных марафонов LiveJournal, хешмобов, тем для публикаций и челленджей.

Он помогает участнику:

- просматривать большой структурированный список тем и заданий;
- выбирать задания, которые хочется выполнить;
- отмечать выполненные задания;
- сохранять одну или несколько ссылок на посты для выполненных заданий;
- отмечать понравившиеся задания сердечком;
- задавать личные цели на сезон;
- видеть прогресс по категориям и общий прогресс;
- считать корректные уникальные ссылки и выполненные челленджи;
- сворачивать и разворачивать категории, чтобы было удобнее работать с большим списком;
- сохранять прогресс локально в браузере без регистрации;
- экспортировать прогресс в JSON-файл и позже восстанавливать его;
- пользоваться отдельной страницей ЧАВО с объяснением работы чек-листа;
- при необходимости и только после явной настройки отправлять **минимальный агрегированный итог сезона** в Google Apps Script, контролируемый владельцем.

Проект намеренно остаётся простым: рабочая версия по-прежнему состоит из обычных **HTML + CSS + JavaScript + существующего изображения**. Нет frontend-фреймворка, сборщика, обязательного package manager, аналитики, трекеров, внешнего CDN шрифтов, service worker или обязательного backend-сервера.

Сайт можно размещать напрямую на **GitHub Pages** или любом обычном статическом хостинге.

---

## 2. Сравнение репозиториев и состояние исправлений

Работа по усилению выполнена от текущей исходной базы:

- **Исходный репозиторий:** `365grain/4ek-lis`
- **Исходная ветка:** `main`
- **Базовый commit:** `e63cc76efe9420b902f90be6597e60392daf7371`
- **Форк:** `mishka23x/4ek-lis`
- **Ветка с исправлениями:** `codex/ui-a11y-security-performance-hardening-20260831`
- **Последний commit кода до этого обновления документации:** `ecac32bfb2bf9c227b0f4f22e1fb5140885dd67b`

До этого расширенного commit с README ветка исправлений была:

- на **3 commit впереди** исходного `main`;
- на **0 commit позади** исходного `main`;
- построена непосредственно от той же общей базы;
- содержала изменения в **21 файле**;
- добавляла примерно **2 739 строк** и удаляла примерно **629 строк**;
- изменяла три исходных файла (`README.md`, `index.html`, `checklist.html`) и добавляла остальные файлы исправлений, тестов и документации.

Три основных commit реализации:

1. `d3adfd9d148c898f78ae71e652157f80e4de2306` — **Harden checklist state, rendering, responsive UI and accessibility**
2. `17a42d136fd806a73c4c4803934242b8332d3168` — **Add aggregate Google Apps Script statistics receiver**
3. `ecac32bfb2bf9c227b0f4f22e1fb5140885dd67b` — **Add local regression fixtures and remediation evidence**

Этот README является отдельной документацией поверх этих трёх commit реализации.

---

## 3. Что в продукте специально сохранено

Исправления не меняют смысл проекта и не заменяют авторский контент чек-листа.

Специально сохранены:

- русскоязычный пользовательский контент чек-листа;
- вопросы и ответы ЧАВО;
- порядок категорий и заданий;
- пунктуация и emoji;
- хештеги;
- ссылки LiveJournal;
- кнопки, подписи, placeholder и сообщения статуса/ошибок там, где от них зависит существующее поведение;
- общий визуальный стиль: тёплый фон бумаги, зелёно-янтарная палитра и карточная структура;
- локальное сохранение прогресса в браузере;
- экспорт/импорт JSON;
- логика сброса;
- сердечки/избранное;
- сворачивание категорий;
- идея прогресса и статистики;
- поздравления за достигнутые этапы;
- возможность обычного статического хостинга.

Во время проверки сравнивались доверенные данные чек-листа/ЧАВО и нормализованный видимый текст с исходной версией, чтобы техническое усиление не переписало незаметно сами задания марафона.

---

## 4. Текущие функции и возможности

### 4.1 Регистрация и пароль не нужны

Сайт является статическим клиентским приложением. Пользователю не нужно регистрироваться или входить в аккаунт.

Поле ника используется как локальная подпись пользователя и, если владелец позднее включит агрегированную отправку итогов сезона, может входить в этот минимальный агрегированный результат.

### 4.2 Цели на сезон

В текущем чек-листе есть **8 полей целей/квот на сезон**. Пользователь может указать собственные планы по различным видам публикаций или активности в марафоне.

Эти значения сохраняются вместе с остальным локальным прогрессом.

### 4.3 Большой структурированный чек-лист

Текущий доверенный шаблон содержит:

- **21 категорию**;
- **289 заданий**;
- описания категорий там, где они предусмотрены;
- текст заданий, который может содержать безопасное жирное выделение и HTTP(S)-ссылки.

Сам шаблон считается доверенным контентом репозитория и больше не заменяется содержимым пользовательского backup-файла.

### 4.4 Выполнение заданий

У каждого задания есть checkbox.

После отметки:

- карточка визуально показывает выполнение;
- обновляется счётчик категории;
- обновляются общий прогресс и процент;
- для задания появляются поля ссылок;
- состояние сохраняется локально.

Нажатие по обычному тексту задания переключает checkbox для удобства, но нажатие по реальной ссылке внутри текста **не** должно случайно отмечать/снимать выполнение задания.

### 4.5 Сердечки / избранное

У каждого задания есть отдельная кнопка-сердечко.

Избранное не зависит от checkbox выполнения, сохраняется локально и имеет корректное состояние `aria-pressed` для вспомогательных технологий.

### 4.6 Органайзер ссылок на посты

Для выполненного задания можно хранить одну или несколько ссылок на публикации.

Редактор ссылок:

- автоматически добавляет новое пустое поле после последнего заполненного;
- принимает обычные HTTP и HTTPS URL;
- не использует некорректные или не-HTTP(S) значения в статистике/навигации;
- показывает предупреждение о некорректной ссылке;
- обнаруживает дубликаты по всему чек-листу;
- при сравнении дубликатов убирает `#fragment`, поэтому одна и та же страница с разными фрагментами считается одной ссылкой;
- сохраняет различия значимых URL-путей;
- никогда не превращает `javascript:` и другие опасные схемы в исполняемую навигацию.

### 4.7 Статистика с учётом дубликатов

Дубликаты подсвечиваются во всех местах, где они повторяются, но в статистике учитываются только один раз.

Локальная карточка статистики показывает:

- общее количество **корректных уникальных ссылок**;
- количество корректных уникальных ссылок в категории `Челленджи`;
- количество выполненных челленджей.

Порог завершения челленджа сейчас равен **10 корректным уникальным ссылкам на одно задание**, а расчёт исправлен на `Math.floor(count / 10)`. Например:

- 10 ссылок = 1 выполненный челлендж;
- 11 ссылок = всё ещё 1 выполненный челлендж;
- 20 ссылок = 2 выполненных челленджа.

### 4.8 Прогресс по категориям и общий прогресс

Каждая категория показывает количество выполненных заданий внутри неё.

Закреплённая нижняя панель показывает:

- выполнено заданий / всего заданий;
- нативный progress bar;
- процент выполнения.

Высота нижней панели измеряется динамически, чтобы контент и keyboard focus не скрывались за ней.

### 4.9 Сворачивание и разворачивание

Каждую категорию можно отдельно свернуть или развернуть.

Также есть общие кнопки:

- свернуть все категории;
- развернуть все категории.

Состояние свёрнутых категорий сохраняется локально и восстанавливается после перезагрузки страницы.

### 4.10 Поздравления за этапы

Сохранена исходная лёгкая игровая механика/поздравления.

После определённых этапов по количеству ссылок могут появляться сообщение и анимированные emoji — как для общего количества, так и для большого количества ссылок внутри одного задания.

Если пользователь включил системную настройку reduced motion, сообщение остаётся, а лишняя анимация частиц отключается.

### 4.11 Локальное хранение в браузере

Обычный пользовательский прогресс хранится в `localStorage` по ключу:

```text
ljMarathonState_v1
```

Среди сохраняемых изменяемых данных:

- ник;
- цели/квоты на сезон;
- выполнение заданий;
- ссылки на посты;
- сердечки/избранное;
- свёрнутые категории;
- состояние milestone;
- состояние необязательной финальной отправки.

Приложению специально не нужна облачная синхронизация.

Так как хранение локальное, прогресс обычно относится к конкретному браузеру/устройству. Очистка данных сайта/браузера или переустановка браузера может удалить его, если заранее не был сделан backup.

### 4.12 Backup и восстановление

Пользователь может экспортировать прогресс в файл:

```text
marathon-progress.json
```

и позже восстановить его существующей кнопкой импорта.

Усиленный импорт теперь:

- ограничивает размер файла **5 MiB**;
- проверяет структуру, типы, ограничения и известные ID;
- отклоняет опасные ключи объектов, включая `__proto__`, `constructor`, `prototype`;
- не позволяет backup-файлу заменить доверенный шаблон, обложку или сетевую конфигурацию;
- безопасно мигрирует поддерживаемое старое состояние;
- очищает input после успешного или неуспешного импорта, чтобы тот же файл можно было выбрать снова;
- не уничтожает текущее состояние приложения при ошибочном импорте.

Object URL, созданный для экспорта, теперь освобождается после скачивания.

### 4.13 Сброс

Сброс очищает прогресс, включая:

- checkbox;
- ссылки;
- цели/квоты;
- milestone.

Ник сохраняется — это соответствует существовавшему ожидаемому поведению.

Перед сбросом требуется явное подтверждение.

### 4.14 Страница ЧАВО

`index.html` — страница ЧАВО, а `checklist.html` — основной чек-лист.

ЧАВО:

- использует нативные `<details>/<summary>`;
- объясняет отсутствие регистрации, использование ника, локальное хранение, backup, сердечки, поздравления, предупреждения ссылок, смысл марафонских заданий/челленджей и другие частые вопросы;
- содержит переход обратно к чек-листу;
- содержит ссылку на LiveJournal 4ek-lis для связи/дополнительной информации.

### 4.15 Необязательная агрегированная отправка итогов сезона

Усиленный механизм финальной статистики подготовлен, но **по умолчанию отключён**.

Кнопка отправки остаётся скрытой, пока одновременно не выполнены два условия:

1. `finalStatsEnabled` установлен в `true`;
2. `finalStatsUrl` является корректным HTTPS URL вида `script.google.com/.../exec`.

Клиент больше не использует видимый в браузере token как будто это секрет.

При явном включении клиент отправляет только следующий агрегированный набор:

- `schemaVersion`;
- `type`;
- `submissionId` (UUID);
- `templateVersion`;
- `sourceOrigin`;
- `nick`;
- `checkedCount`.

Не отправляются сохранённые пользователем ссылки на посты, текст заданий, категории, импортированный backup или полный локальный прогресс.

При неудачной отправке сохраняется тот же pending UUID, чтобы повтор можно было распознать и не создать случайно вторую строку.

---

## 5. Архитектура до и после исправлений

### Исходная версия

Исходный репозиторий был очень маленьким статическим проектом и фактически содержал:

- `README.md`;
- `index.html`;
- `checklist.html`;
- `favicon.png`.

Большая часть логики приложения находилась внутри HTML в inline JavaScript.

### Усиленная ветка

Продукт всё ещё остаётся статическим, но ответственность разделена яснее:

| Файл / область | Текущая роль |
|---|---|
| `checklist.html` | Семантическая/адаптивная оболочка чек-листа, стили, доверенный JSON шаблона, конфигурация и CSP |
| `checklist.js` | Проверка/миграция состояния, безопасный render, взаимодействия, индекс/статистика ссылок, хранение, backup/restore, поздравления и необязательный клиент финальной отправки |
| `index.html` | Семантическая/адаптивная оболочка ЧАВО, доверенный JSON ЧАВО и CSP |
| `faq.js` | Безопасный render ЧАВО и ссылок/форматированного текста |
| `favicon.png` | Существующая иконка |
| `google-apps-script/Code.gs` | Необязательный агрегированный receiver итогов сезона |
| `google-apps-script/appsscript.json` | Минимальный manifest Apps Script |
| `google-apps-script/README.md` | Инструкция владельцу по setup/staging/deploy/эксплуатации receiver |
| `tests/check-static.mjs` | Проверка структуры/security/copy без зависимостей |
| `tests/fixtures/` | Fixtures старого состояния, вредоносного импорта и prototype pollution |
| `tests/playwright-*.js` | Локальные browser regression/performance сценарии |
| `tests/README.md` | Инструкция по локальным тестам |
| `SECURITY-REVIEW.md` | Security findings, trust boundaries и остаточные риски |
| `REMEDIATION-EVIDENCE.md` | Подробные доказательства и результаты проверки |
| `.gitignore` | Исключение локальных Playwright/test артефактов и зависимостей |

Исполняемый JavaScript вынесен из inline `<script>` в same-origin файлы, чтобы страницы могли использовать существенно более строгую политику Content Security Policy. Доверенные данные чек-листа/ЧАВО остаются встроенными как неисполняемый `application/json`.

---

## 6. Улучшения безопасности

### 6.1 Устранён persistent DOM-XSS через импорт

В исходной версии импортированное состояние могло содержать данные, которые позже проходили через генерацию HTML.

В усиленной версии разделены:

- **доверенный release/template-контент** из репозитория;
- **недоверенный изменяемый прогресс** из `localStorage` или backup-файла.

Импорт может менять только строго проверенное изменяемое состояние. Он не может заменить доверенные title/template/category/task/cover/network данные.

Динамический контент чек-листа и ЧАВО строится DOM API и текстовыми узлами, а не опасной HTML-инъекцией. Для этого workflow больше не используется application `innerHTML`, `outerHTML`, `insertAdjacentHTML` или динамическое выполнение кода.

### 6.2 Content Security Policy

На обе страницы добавлен ограничивающий CSP.

Политика чек-листа разрешает scripts только с same-origin и ограничивает image/connect/object/base/form. У ЧАВО сетевой доступ ещё уже.

Inline исполняемый JavaScript больше не требуется.

### 6.3 Более безопасные динамические ссылки

Динамические ссылки ограничены HTTP(S).

Ссылки, открываемые в новой вкладке, используют:

```text
rel="noopener noreferrer"
```

что защищает от opener-атак и уменьшает передачу referrer.

### 6.4 Проверка импорта и защита от prototype pollution

Импортированное/локальное состояние нормализуется по точному списку полей, типам, максимальным размерам/количествам и известным ID.

Опасные prototype-ключи отклоняются.

В `tests/fixtures/` добавлены отдельные malicious-template и prototype-pollution fixtures.

### 6.5 Удалён публичный client token

В исходной версии в браузерном JavaScript находился `FINAL_TOKEN`, а endpoint указывал на Apps Script `/dev`.

Любое значение, помещённое в публичный JavaScript, видит каждый пользователь, поэтому оно не может считаться секретом.

В новой схеме token удалён, а необязательный receiver работает как проверяемый анонимный агрегированный endpoint.

### 6.6 Только `/exec` при явном включении

Клиент принимает финальный endpoint только если он:

- HTTPS;
- находится на `script.google.com`;
- заканчивается на `/exec`;
- явно включён в конфигурации приложения.

Editor-only `/dev` больше не принимается как production-путь клиента.

### 6.7 Усиленный receiver

Предоставленный Google Apps Script receiver включает:

- точную проверку ожидаемых полей;
- максимальный размер request body;
- проверку UUIDv4;
- разрешённые template/count пределы;
- настроенный список origin как anti-accident сигнал;
- ограничения ника и control characters;
- нейтрализацию spreadsheet formula prefixes;
- `LockService` вокруг записи;
- устойчивую проверку duplicate `submissionId` в таблице;
- приблизительные глобальные лимиты запросов в минуту/час;
- безопасные публичные ответы без spreadsheet ID и внутренней конфигурации.

Это защита **анонимного публичного endpoint**, а не аутентификация пользователя.

---

## 7. Исправления корректности данных и надёжности

### Дублированный persistence ID задания

У двух разных заданий был общий legacy ID сохранения. Теперь второе задание имеет собственный ID, а миграция идемпотентно копирует старое состояние, чтобы существующий сохранённый прогресс не исчез.

### Дублированные ссылки

Дубли URL теперь обрабатываются единообразно: предупреждение показывается у каждого повторения, а в статистике ссылка учитывается только один раз.

### Ошибка подсчёта челленджей

Раньше completed challenge увеличивался только когда количество ссылок было точным кратным порогу. Из-за этого 11 ссылок могли некорректно перестать представлять один уже выполненный челлендж.

Теперь используется floor-расчёт, поэтому накопленный результат между точными кратными не теряется.

### Ошибки хранилища

Доступ к `localStorage` может завершаться ошибкой из-за privacy/security настроек браузера, quota или повреждённых данных.

Теперь приложение:

- перехватывает ошибки чтения/записи;
- остаётся работоспособным в памяти;
- показывает понятное сообщение об ограничении хранения;
- по возможности сохраняет исходные повреждённые данные в `ljMarathonState_v1_recovery`, прежде чем загрузить чистое состояние.

### Повтор финальной отправки

Pending UUID сохраняется до отправки. Ошибка сети/сервера оставляет его для повтора, а успех очищает pending state. Это уменьшает риск случайных дублированных строк.

---

## 8. Улучшения производительности

Исходная версия при обычных действиях часто перестраивала большие части интерфейса и записывала существенно более крупное состояние.

Теперь используются:

- однократное построение статической части DOM;
- точечное обновление конкретной задачи/категории/ссылки/статистики/progress;
- делегированные event handlers;
- индекс вхождений URL вместо постоянной полной перестройки duplicate-информации;
- debounce для сохранения текста/целей/ника;
- немедленное сохранение только там, где это действительно нужно;
- компактное mutable-only состояние вместо обычного сохранения полного доверенного шаблона.

Локальные измерения Chromium с **4× CPU throttling** показали приблизительно:

| Сценарий | Исходная версия | Усиленная версия |
|---|---:|---:|
| Первый checkbox | ~230 ms | ~26 ms в первоначальном benchmark; ~13 ms в состоянии с 2 890 ссылками |
| Первый URL input event | ~924 ms | ~4.4–6 ms |
| Сворачивание категории | ~9.6 ms | ~1.8 ms обычно; ~5.6 ms в большом состоянии |
| URL focusout при 2 890 ссылках | архитектура с полной обработкой dataset | ~35 ms точечного обновления occurrence |
| Сохранённое состояние после одной задачи/ссылки | ~62 431 символ | ~623 символа |

Также тестировался намеренно экстремальный fixture с **2 880 заполненными URL input / 17 458 DOM-элементами**. Первичное построение при 4× CPU throttling всё ещё тяжёлое (~8.7 секунды), но основные действия после построения остаются отзывчивыми. Этот предел задокументирован, а не скрыт виртуализацией, которая могла бы ломать поиск по странице, accessibility или focus.

---

## 9. Улучшения mobile/responsive

Layout усилен против типичных проблем большого form/checklist интерфейса:

- `min-width: 0` в местах, где flex/grid children раньше могли растягивать страницу;
- `minmax(0, 1fr)` в grid columns;
- перенос длинных заголовков, хештегов и URL;
- перенос toolbar/control на маленьких экранах;
- URL input может корректно сжиматься внутри карточки;
- увеличенные touch targets;
- mobile input размер не ниже примерно 16px, чтобы избежать нежелательного zoom на iOS;
- safe-area-aware отступ под footer;
- динамическое измерение высоты fixed footer через `ResizeObserver`;
- зарезервированное aspect ratio и размеры обложки против layout shift;
- асинхронное декодирование обложки и `referrerpolicy="no-referrer"`.

Проверялись ширины:

```text
320, 360, 375, 390, 412, 430, 480, 600,
768, 820, 1024, 1280, 1440, 1920 CSS px
```

На всех обязательных ширинах тест не обнаружил горизонтального overflow всей страницы.

Дополнительно проверялись 2× text scale, длинные URL, поведение iPhone-style input focus и окончание страницы над fixed footer.

---

## 10. Улучшения accessibility

Исправления улучшают keyboard navigation, семантику и работу с assistive technology, не меняя основной workflow пользователя.

В частности:

- сохранён `lang="ru"`;
- добавлены skip links к основному контенту;
- улучшены semantic `main`, sections, headings, footer/status;
- улучшена иерархия заголовков;
- у input есть программные/видимые labels;
- используется нативный `<progress>` вместо purely visual progress bar;
- category toggle имеет `aria-expanded` и `aria-controls`;
- сердечки имеют `aria-pressed` и доступные названия;
- ошибочные/дублированные URL имеют `aria-invalid` и `aria-describedby`;
- status/error сообщения используют сдержанные live regions;
- заметные `:focus-visible` outlines;
- поддержка forced colors;
- поддержка reduced motion;
- mobile targets ориентированы примерно на 44px для важных контролов;
- focus/scroll учитывает fixed footer;
- task links отделены от checkbox activation, поэтому открытие ссылки не меняет случайно выполнение;
- FAQ использует нативные keyboard-accessible `<details>/<summary>`.

Локальные axe-core 4.10.3 проверки WCAG 2 A/AA/2.2 AA на узкой и desktop ширине показали **0 violations** для проверенного состояния checklist и FAQ. Автоматический scan не считается доказательством идеальной accessibility, поэтому дополнительно выполнялись ручные проверки keyboard, focus, zoom, reduced motion, forced colors и target size.

---

## 11. Модель приватности

### Обычная работа

Прогресс чек-листа остаётся локально в браузере/на устройстве пользователя.

Аккаунт не требуется, и обычный прогресс по заданиям/ссылкам не отправляется на backend.

### Необязательная агрегированная финальная статистика

Если владелец позднее развернёт и явно включит предоставленный receiver, отправляются только задокументированные агрегированные поля.

Сами ссылки на посты, текст заданий, категории и backup туда не входят.

### Существующая внешняя обложка

Обложка по-прежнему загружается с инфраструктуры изображений LiveJournal. Любая внешняя картинка естественным образом сообщает этому серверу обычные сетевые данные вроде IP и browser/user-agent. Ник, локальный прогресс и ссылки пользователя в запрос картинки не добавляются; используется `referrerpolicy="no-referrer"`.

---

## 12. Проверка и regression evidence

### Проверка без внешних зависимостей

Запуск:

```powershell
node tests/check-static.mjs
```

В recorded remediation pass проверялись:

- **8 quotas**;
- **21 category**;
- **289 tasks**;
- уникальность task IDs;
- hashes доверенного видимого контента;
- отсутствие запрещённых rendering/security sinks;
- ожидаемый CSP;
- receiver self-tests.

### Syntax и HTML

В evidence зафиксировано успешное выполнение:

```text
node --check checklist.js
node --check faq.js
V8-compatible Code.gs syntax
npx --yes html-validate checklist.html index.html
```

### Браузеры

Основная browser matrix включала:

- Chrome;
- Edge;
- Firefox;
- WebKit/Safari;
- эмуляцию iPhone Safari;
- эмуляцию Android Chrome.

В проверенных движках отображались все 289 заданий без console errors и горизонтального overflow; проверялись checkbox, hearts, URL, collapse/expand и сохранение после reload.

### Security/reliability fixtures

Fixtures покрывают:

- миграцию корректного legacy state;
- вредоносный импорт template/cover/event markup;
- prototype-pollution keys;
- повреждённое/malformed состояние;
- storage failure/quota errors;
- oversized import;
- опасные URL schemes;
- duplicate links;
- retry/failure финальной отправки.

Подробные результаты:

- [`REMEDIATION-EVIDENCE.md`](REMEDIATION-EVIDENCE.md)
- [`SECURITY-REVIEW.md`](SECURITY-REVIEW.md)
- [`tests/README.md`](tests/README.md)

---

## 13. Локальный запуск и ручная проверка

Для обычного запуска сайта ничего устанавливать не требуется.

Из корня репозитория:

```powershell
py -m http.server 4174 --bind 127.0.0.1
```

Открыть:

```text
http://127.0.0.1:4174/
http://127.0.0.1:4174/checklist.html
```

Структурная regression-проверка:

```powershell
node tests/check-static.mjs
```

Playwright scripts внутри `tests/` используются только для разработки/тестирования. Production-сайт не загружает Playwright и не зависит от него во время работы.

---

## 14. Безопасный workflow GitHub Pages для проверки

Ветку исправлений можно публиковать как отдельный GitHub Pages preview, чтобы владелец вручную тестировал её без изменения исходного production `main`.

Рекомендуемая схема:

```text
365grain/4ek-lis:main
        │
        │ исходная база — не менять во время preview
        │
        └── mishka23x/4ek-lis
              └── codex/ui-a11y-security-performance-hardening-20260831
                    └── GitHub Pages manual preview/testing
```

Так как сайт остаётся статическим, GitHub Pages может публиковать ветку непосредственно из `/ (root)` без build step.

После ручного одобрения ветку можно предложить владельцу исходного репозитория через Pull Request. В upstream `main` ничего не попадёт, пока владелец сам явно не выполнит merge.

---

## 15. Необязательный Google Apps Script receiver

Сбор данных специально отключён в настройках репозитория по умолчанию.

Полный receiver и инструкция находятся здесь:

- [`google-apps-script/Code.gs`](google-apps-script/Code.gs)
- [`google-apps-script/appsscript.json`](google-apps-script/appsscript.json)
- [`google-apps-script/README.md`](google-apps-script/README.md)

После staging и deploy публичного Apps Script Web App владелец меняет только JSON-конфигурацию в `checklist.html`, например:

```json
{
  "templateVersion": "2026-11-22",
  "challengeCategoryName": "Челленджи",
  "challengeCompleteThreshold": 10,
  "finalStatsEnabled": true,
  "finalStatsUrl": "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
}
```

Не следует включать функцию до выполнения staging checklist из `google-apps-script/README.md`.

---

## 16. Известные ограничения / остаточные риски

Исправления специально документируют то, что статический сайт сам по себе гарантировать не может:

1. **Локальное состояние браузера не является cloud sync.** Другой браузер/устройство автоматически не получает тот же прогресс.
2. **Очистка данных браузера/сайта может удалить прогресс.** Если данные важны, стоит экспортировать JSON backup.
3. **Необязательный Apps Script endpoint анонимный.** `sourceOrigin` и данные браузера не могут подтвердить личность человека. Даже с validation/rate limits возможна распределённая злоупотребляющая нагрузка.
4. **Production Apps Script требует staging владельцем.** Google authorization, quotas аккаунта, deploy policy, Sheets permissions и реальная concurrency должны проверяться в окружении владельца до включения сбора.
5. **GitHub Pages не позволяет из файлов репозитория установить все желательные HTTP response security headers.** Meta CSP даёт хорошую client-side защиту, но на настраиваемом хостинге дополнительно можно отправлять CSP headers, `X-Content-Type-Options`, framing policy и другие headers.
6. **Удалённая обложка остаётся внешним запросом.** При наличии прав на изображение её можно self-host, чтобы убрать этот внешний запрос.
7. **Экстремальное состояние с тысячами заполненных ссылок имеет заметную стоимость первичного render.** После построения основные взаимодействия остаются оптимизированными.

---

## 17. Краткая таблица всех основных исправлений

| Область | Проблема / риск исходной версии | Результат исправлений |
|---|---|---|
| Data | Два задания использовали один persistence ID | Отдельный ID + legacy migration сохраняет старый прогресс |
| Security | Persistent DOM-XSS через импорт | Trusted template отделён от mutable state; безопасный DOM render |
| Security | Не было CSP | Добавлен строгий CSP; scripts вынесены в same-origin файлы |
| Security | Произвольная/неограниченная структура import | Точная schema/types/bounds/known IDs + 5 MiB limit + dangerous-key rejection |
| Security | Публичный `FINAL_TOKEN` считался секретом | Token удалён; валидируемый анонимный aggregate receiver |
| Integration | Публичный клиент использовал Apps Script `/dev` | Необязательная функция принимает только явно включённый HTTPS `/exec` |
| Privacy | Риск слишком подробного legacy payload | Финальная отправка уменьшена до семи агрегированных полей |
| Data | Duplicate URL искажали статистику | Canonical occurrence index; warnings; первый occurrence учитывается |
| Data | Неверный подсчёт челленджей между точными кратными | Floor-based calculation |
| Reliability | Storage error/corruption мог ломать состояние | Guarded storage, in-memory fallback, recovery copy |
| Reliability | Слабый import/export lifecycle | Bounded validation, input reset, object-URL cleanup |
| Performance | Полный rerender/write cascade | Static DOM + incremental updates + delegation + compact state |
| Mobile | Horizontal overflow и длинные строки | Grid/flex fixes, wrapping и проверенные responsive widths |
| Mobile | Маленькие targets / iOS zoom / footer overlap | Более крупные controls, mobile input sizing, safe-area + measured footer clearance |
| Layout | Обложка могла создавать layout shift | Зарезервирован aspect ratio + dimensions; CLS 0 в slow-cover test |
| Accessibility | Слабые semantics/focus/state announcements | Landmarks, labels, ARIA states, native progress, focus styles, reduced motion |
| UX | Финальная кнопка могла отображаться некорректно | Скрыта, пока конфигурация не валидна и функция явно не включена |

---

## 18. Что изменено по каждому файлу

- **`.gitignore`** — исключает локальные browser/test artifacts и dependency folders.
- **`README.md`** — назначение проекта, функции, архитектура, описание исправлений, тестирование и эксплуатационная документация на английском и русском.
- **`checklist.html`** — усиленная semantic/responsive оболочка, доверенный template/config JSON, CSP, стабильная обложка/footer и подключение внешнего JS.
- **`checklist.js`** — проверка trusted template, schema/migration состояния, безопасный DOM render, incremental UI, URL validation/dedup/statistics, accessibility state, persistence, import/export/reset, celebrations и необязательная агрегированная финальная отправка.
- **`index.html`** — усиленная semantic/responsive оболочка ЧАВО, CSP и доверенный FAQ JSON.
- **`faq.js`** — безопасный renderer ЧАВО/форматированного текста без unsafe HTML injection.
- **`google-apps-script/Code.gs`** — aggregate receiver с validation, locking, idempotency, formula safety и rate budgets.
- **`google-apps-script/appsscript.json`** — V8 manifest с минимальным Sheets scope.
- **`google-apps-script/README.md`** — setup, staging, deployment и operations инструкция владельцу.
- **`tests/check-static.mjs`** — regression test структуры/security/copy без runtime dependencies.
- **`tests/fixtures/legacy-v1.json`** — fixture миграции legacy state.
- **`tests/fixtures/malicious-template-v1.json`** — fixture вредоносного импортируемого template.
- **`tests/fixtures/prototype-pollution.json`** — prototype-pollution fixture.
- **`tests/playwright-local-validation.js`** — overflow, long URL, task/link behavior, mobile input и footer tests.
- **`tests/playwright-final-mock.js`** — contract/retry/idempotency финальной отправки с mock receiver.
- **`tests/playwright-final-failures.js`** — invalid response и network-timeout recovery.
- **`tests/playwright-cls.js`** — проверка layout shift обложки.
- **`tests/playwright-large-state.js`** — performance checks очень большого состояния.
- **`tests/README.md`** — workflow локальных regression tests.
- **`SECURITY-REVIEW.md`** — подробные trust boundaries, security findings и остаточные риски.
- **`REMEDIATION-EVIDENCE.md`** — подробные результаты, измерения и evidence исправлений.

---

## 19. Review guidance / Рекомендация по ревью

The safest adoption path remains:

```text
manual GitHub Pages testing
        ↓
review remediation evidence/security notes
        ↓
owner acceptance
        ↓
pull request to 365grain/4ek-lis:main
        ↓
owner-controlled merge only
```

Самый безопасный путь внедрения:

```text
ручное тестирование через GitHub Pages
        ↓
проверка REMEDIATION-EVIDENCE / SECURITY-REVIEW
        ↓
одобрение владельцем
        ↓
Pull Request в 365grain/4ek-lis:main
        ↓
merge выполняет только владелец после проверки
```

The remediation branch is intentionally suitable for review and manual staging without requiring the original live branch to be changed first.

Ветка исправлений специально подготовлена так, чтобы её можно было полноценно проверить и протестировать отдельно, не изменяя предварительно рабочую ветку владельца.
