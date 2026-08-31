# Remediation evidence — 4ek-lis

Date: 2026-08-31
Repository: <https://github.com/365grain/4ek-lis.git>
Baseline/default branch: `main` at `e63cc76efe9420b902f90be6597e60392daf7371`
Local branch: `codex/ui-a11y-security-performance-hardening-20260831`
Remote mutation status: none; no commit, push, pull request, or merge has been performed.

## Product and architecture preserved

The result remains a dependency-free static LiveJournal marathon checklist and FAQ: two HTML pages, same-origin JavaScript, embedded JSON content, and the existing remote cover. There is no framework, bundler, runtime package, analytics, font CDN, tracker, service worker, or build step. It still works on GitHub Pages and ordinary static hosting.

Visible Russian template/FAQ content, ordering, punctuation, emoji, hashtags, LiveJournal URLs, buttons, labels, placeholders, status/error strings, and reset behavior remain equivalent. The executable code moved out of inline HTML so CSP can block inline scripts; trusted content remains embedded as `application/json`.

## Finding disposition

| Finding | Result | Primary remediation |
|---|---|---|
| DATA-01 duplicate task persistence ID | Fixed | New ID for the second distinct task; idempotent legacy state clone preserves both saved interpretations. |
| SEC-01 imported persistent DOM XSS | Fixed | Imported templates ignored; strict mutable-state normalization; DOM/text rendering; no HTML/eval sinks; CSP. |
| PERF-01 full rerender/write cascade | Fixed | Static DOM built once; incremental task/category/link/stat updates; delegated events; debounced text saves; compact state. |
| MOBILE-01 horizontal overflow | Fixed | Intrinsic grid/flex minimums, long-token wrapping, mobile control wrapping, root-cause layout fixes. |
| REL-01 storage failures/data replacement | Fixed | Guarded reads/writes, in-memory fallback, raw corrupt-state recovery copy, safe defaults, idempotent migration. |
| DATA-02 duplicate links counted/submitted | Fixed | Canonical URL occurrence index, duplicate warnings on every occurrence, first-occurrence-only statistics. |
| EXT-01 public final endpoint was `/dev` | Fixed in supplied integration | Client accepts only disabled-by-default HTTPS `script.google.com/.../exec`; full owner receiver/deployment guide included. Live deployment still owner-gated. |
| DATA-03 challenge count fell at non-multiples | Fixed | `Math.floor(validUniqueLinks / 10)` per challenge task. |
| SEC-02 arbitrary import graph/network fields | Fixed | 5 MiB cap, exact schema/types/bounds/IDs, dangerous-key rejection, trusted embedded template retained. |
| MOBILE-02 small targets/footer assumptions | Fixed | 44px mobile toggle/heart/action targets, 16px mobile inputs, safe-area/footer ResizeObserver clearance. |
| PERF-02 cover CLS/transfer risk | Fixed where repository-controlled | Static final title/progress, visible reserved 2459:432 cover box, explicit dimensions, async decoding, no-referrer. Remote transfer remains intentional. |
| SEC-03 public client token | Replaced, residual documented | Token removed from contract; aggregate anonymous receiver with validation, lock, UUID replay control, formula safety, and budgets. Not authentication. |
| PRIV-01 FAQ promise/payload mismatch | Fixed | Only aggregate nickname/template/origin/submission ID/checked count leaves the browser when explicitly enabled. |
| UX-01 unintended visible final-send control | Fixed | Control remains truly hidden until valid owner configuration activates it. |
| REL-02 export/import lifecycle | Fixed | Object URL revocation, input reset, size/schema validation, existing visible failure copy. |
| SEC-04 no CSP | Fixed | Same-origin external scripts and constrained script/image/connect/object/base/form policies. |

## Accessibility and interaction changes

- Russian document language retained; banner, main, complementary/status, and content-info structure added/refined.
- Skip links focus the `main` target; headings form a usable hierarchy.
- Inputs have programmatic visible labels/names; URL warnings use `aria-invalid` and `aria-describedby`.
- Category toggles expose descriptive names, `aria-expanded`, and `aria-controls`.
- Hearts expose `aria-pressed` and a non-color accessible name.
- Progress is a native `<progress>` with text and `aria-valuetext`.
- Status/error changes use restrained live regions.
- Task links no longer sit inside checkbox labels; link clicks do not toggle completion, while non-link task text remains clickable and checkboxes retain complete accessible names.
- Strong `:focus-visible`, forced-colors support, mobile targets, and footer-aware scroll margins keep keyboard focus visible.
- Reduced-motion users receive a static milestone message and no particles.

## Local validation results

### Structural and copy

- `node tests/check-static.mjs`: pass; 8 quotas, 21 categories, 289 tasks, unique task IDs, 12 receiver tests.
- Checklist trusted visible-data SHA-256: `b65dac90a8e17ee48b085871b36516e57a0975c0bd9a787a415931bd618c883e` (exact baseline fixture hash).
- FAQ trusted visible-data SHA-256: `431bec28630a26c250a0fa14dac68467b912a3a5c273fe3390e98b56b0305da2` (exact baseline fixture hash).
- Normalized baseline versus remediated rendered `body.innerText` SHA-256 (excluding the added non-visible skip-link text and correctly hidden final-send button): `153a73872c1bc30b2e584e128fc44b60ab67a85c5baa890132c974ee4f676a30`, length 25,103 on both.
- `node --check checklist.js`, `node --check faq.js`, and V8-compatible `Code.gs` syntax: pass.
- `npx --yes html-validate checklist.html index.html`: pass.

### Responsive/mobile

Every required width returned `scrollWidth === clientWidth`: 320, 360, 375, 390, 412, 430, 480, 600, 768, 820, 1024, 1280, 1440, and 1920 CSS px.

Additional passes:

- 2× text scale at 320/360/768/1024: no page overflow; dynamic footer height remained reserved.
- 20 very long URL rows at 320px: no page overflow.
- iPhone emulation URL input: computed 16.8px, `visualViewport.scale === 1` after focus.
- End-of-page at 320px and 2× text: main content finished above the fixed footer with 154–175px clearance in the tested state.
- Fixed footer focus test: focused URL field bottom 565.8px, footer top 653.8px; focus ring visible.
- Slow cover: before/after box exactly 1280×224.86px; PerformanceObserver CLS `0`.

### Browser/interaction

Chrome, Edge, Firefox, WebKit/Safari, iPhone Safari emulation, and Android Chrome emulation each rendered 289 tasks with `0 / 289`, no horizontal overflow, and no console errors. Checkbox, heart, URL, category collapse/expand, and reload persistence passed in each engine during the primary matrix.

Keyboard evidence:

- first Tab exposes a 46px-high skip link with a solid focus outline;
- Enter focuses `mainContent`;
- Enter toggles category state;
- Space toggles a task checkbox;
- link focus is not obscured by the footer;
- FAQ native `details/summary` works with Enter/Space and retains focus.

### Accessibility

Local axe-core 4.10.3 WCAG 2 A/AA/2.2 AA scans at 320 and 1280:

- checklist with a completed task and invalid-link error: zero violations;
- FAQ: zero violations.

The remaining axe incomplete item is manual color review for the non-text disclosure glyph. Its foreground contrast is 6.50:1 against the page paper and its control border is 3.67:1, exceeding relevant text/non-text thresholds. Automated results do not constitute a claim of complete accessibility; manual keyboard, semantics, focus, zoom, target-size, reduced-motion, and forced-colors checks were also performed.

### Persistence/import/export/reliability

- Valid legacy v1 fixture migrated to schema 2 with nickname, checkbox, links, heart, quotas, collapsed state, and duplicated-ID progress preserved; migration is idempotent.
- Malicious imported title/cover/event payload did not execute, did not issue its external request, and could not replace trusted repository content.
- Prototype fixture failed safely; `({}).marks` remained undefined and current progress remained intact.
- Malformed local JSON loaded an empty in-memory state, retained original raw data under `ljMarathonState_v1_recovery`, and wrote valid schema 2 only after interaction.
- Storage throwing `SecurityError`/`QuotaExceededError` still rendered 289 tasks and allowed in-memory checking; a polite storage limitation status appeared with no page exception.
- Oversized import reset the file control and retained current progress.
- Export created one Blob URL and revoked the same URL after one second.
- Reset cleared tasks/links/quotas/milestones while retaining nickname, matching existing behavior.
- Canonical duplicates differing by host case/fragment generated two warnings, counted once, and cleared both warnings when separated; meaningful path trailing slashes remain distinct because servers may distinguish them.
- `javascript:` input stayed plain invalid field text and reduced unique-link statistics; it never became navigation.
- Challenge statistics: 10/11 valid unique links count as one completed challenge; 20 count as two.

### Performance (Chromium, 4× CPU throttle)

Synchronous event-handler timings from the same local machine:

| Scenario | Baseline | Hardened |
|---|---:|---:|
| First checkbox | ~230 ms | ~26 ms initial benchmark; ~13 ms in 2,890-link state |
| First URL input event | ~924 ms | ~4.4–6 ms |
| Category toggle | ~9.6 ms | ~1.8 ms normal; ~5.6 ms large state |
| URL focusout, 2,890 links | full-dataset architecture | ~35 ms after targeted occurrence update |
| Stored state after one task/link | ~62,431 characters | ~623 characters |

The adversarial large fixture rendered 2,880 populated URL inputs/17,458 elements and 113,856 storage characters with no overflow. Initial construction under 4× throttle was ~8.7 seconds; this is an intentionally extreme state, remains a known upper-bound cost, and was not hidden by virtualization that could break content/find/focus behavior. Once rendered, primary interactions remain responsive.

### Final statistics client/receiver

- Feature is disabled and hidden in repository defaults.
- Mocked `/exec` test: two attempts, same UUID, pending retained after rejection, pending cleared after success, sent UUID matched, success/rejection statuses rendered.
- Separate failure test returned an invalid HTML body with HTTP 503 and then held the endpoint past 15 seconds: the first request was handled as a safe error, the second ended `net::ERR_ABORTED`, both bodies used the same UUID, the button recovered, and pending retry state remained.
- Captured payload had exactly seven aggregate keys and no `links`, `tasks`, `rows`, detailed template data, or token.
- `Code.gs` twelve self-tests pass locally.
- Actual Apps Script authorization/deployment/CORS/Sheets/concurrency/quota behavior cannot be completed without owner Google access; the staging checklist in `google-apps-script/README.md` is mandatory before activation.

## Files changed/added

- `.gitignore` — local browser/test artifact exclusions.
- `README.md` — static hosting, local checks, persistence, and receiver overview.
- `checklist.html` — semantic/responsive shell, embedded trusted JSON, CSP, stable cover/footer, external script.
- `checklist.js` — validated state/migration, safe rendering, incremental interactions, accessibility, storage/import/export/final-client hardening.
- `index.html`, `faq.js` — semantic/CSP FAQ shell and safe renderer.
- `google-apps-script/Code.gs`, `appsscript.json`, `README.md` — receiver, manifest, owner deployment/runbook.
- `tests/` — dependency-free static check, hostile/legacy fixtures, reusable local Playwright callbacks, and instructions.
- `SECURITY-REVIEW.md` — threat boundary, fixed issues, and residual risks.
- `REMEDIATION-EVIDENCE.md` — this evidence record.

## External blockers / required owner work

1. Deploy the supplied Apps Script to a staging sheet, run its twelve editor self-tests and full staging checklist, and use the production `/exec` URL.
2. Only after that proof, set `finalStatsEnabled` to `true` and insert the `/exec` URL in `checklist.html`.
3. Decide spreadsheet access/retention/monitoring policy.
4. Review the local branch and explicitly authorize commit, push, and pull-request creation. Do not merge solely because automation is green.
