# Security review — 4ek-lis remediation

Date: 2026-08-31
Baseline: `e63cc76efe9420b902f90be6597e60392daf7371`
Scope: static checklist/FAQ, local persistence and backup boundary, outbound links/assets, final-statistics client contract, and the supplied Google Apps Script receiver.

## Executive result

The confirmed persistent DOM-XSS path through imported template content has been removed. Imported JSON now contributes only strictly validated mutable progress/settings; all repository template and FAQ content is rendered from trusted embedded JSON with DOM APIs and `textContent`. The static pages have a script-restrictive Content Security Policy, dynamic URLs accept only HTTP(S), and all new-tab links receive `noopener noreferrer`.

The final-statistics design no longer treats a public client token as a secret and no longer transmits individual links, task text, categories, or backup state. The supplied receiver validates one aggregate row and adds size/schema/count/origin checks, formula neutralization, script locking, durable UUID replay control, and global quota-oriented throttling.

This does **not** make the public Apps Script endpoint authenticated. A determined distributed actor can forge aggregate submissions or consume the receiver's quota. That residual risk is inherent in an anonymous static client and is documented below.

## Trust boundaries and protected assets

- Repository template/FAQ JSON is trusted release content.
- `localStorage` and selected backup files are untrusted, attacker-controllable input.
- Task/nickname/link fields are user data; they must remain local except for the explicitly activated aggregate final submission.
- LiveJournal and the cover-image host are external navigations/resources, not trusted code origins.
- Google Apps Script is an optional anonymous public receiver; Google Sheets is owner-controlled persistent storage.
- The owner’s spreadsheet ID and Script Properties must not be exposed by public health/error responses.

## Confirmed findings and disposition

Code evidence index:

| Control | Location |
|---|---|
| Strict state normalization/migration and recovery | `checklist.js:245-324` |
| HTTP(S)-only URL parsing and incremental duplicate index | `checklist.js:346-466` |
| Safe DOM rich-text/task rendering | `checklist.js:482-610`, `faq.js:36-80` |
| Per-field validation and dynamic warning semantics | `checklist.js:716-738` |
| Aggregate final client, timeout, retry UUID, response handling | `checklist.js:899-963` |
| Export URL cleanup and bounded import | `checklist.js:966-994` |
| Page CSP and protected external cover | `checklist.html:6`, `checklist.html:192`; `index.html:6` |
| Receiver owner configuration and non-secret boundary | `google-apps-script/Code.gs:1-63` |
| Receiver request/validation path | `google-apps-script/Code.gs:120-233` |
| Sheet replay, global budgets, formula safety | `google-apps-script/Code.gs:318-354` |
| Receiver self-tests | `google-apps-script/Code.gs:393-420` |

### SEC-01 — imported-state persistent DOM XSS — fixed in repository

The old application imported template fields and rendered them through generated HTML. The new import boundary in `checklist.js` validates only known mutable records and ignores imported template/cover content. Checklist rendering uses explicit DOM nodes (`appendRichText`) and FAQ rendering does the same in `faq.js`; neither file contains `innerHTML`, `outerHTML`, `insertAdjacentHTML`, dynamic code evaluation, or inline event handlers. `checklist.html` and `index.html` restrict scripts to same-origin external files.

Validation evidence:

- malicious template/cover/event-handler fixture imported without executing its marker;
- no request to the malicious fixture’s external host;
- trusted title, cover, categories, and 289 tasks remained intact;
- structural test rejects dangerous HTML/eval sinks and inline event attributes.

### SEC-02 — arbitrary backup objects and unsafe URLs — fixed in repository

`normalizeState()` enforces schema, type, size/count/string bounds, known IDs, safe integers, allowed fields, and dangerous-key rejection. Files over 5 MiB fail with the existing visible error copy and the file input is cleared. URL parsing accepts only `http:`/`https:`; `javascript:`, malformed values, and invalid imported URLs never become executable anchors. Imported template/network fields are not applied.

Prototype-pollution and malformed fixtures failed without changing `Object.prototype` or replacing valid progress. Corrupt local state falls back to an in-memory empty state while retaining the raw value under the recovery key where storage permits.

### SEC-03 — public `FINAL_TOKEN` used as authentication — client/server design remediated, residual anonymous-abuse risk remains

No client token is used. The disabled-by-default client sends exactly:

`schemaVersion`, `type`, `submissionId`, `templateVersion`, `sourceOrigin`, `nick`, and `checkedCount`.

The receiver’s `doPost()` and validation path enforce an 8 KiB body limit, exact fields, UUIDv4, known template/count limits, exact configured HTTPS origins, nickname bounds/control-character rejection, and integer counts. Sheet writes are serialized with `LockService`; submission IDs are checked durably in the sheet before append; formula-leading text is prefixed safely; `CacheService` provides approximate global minute/hour budgets. Public responses do not include spreadsheet IDs or internal exception details.

The mocked client test proved a failed attempt retains its pending UUID, the retry uses the same UUID, and success clears pending state. The receiver’s twelve pure self-tests cover valid input, all common formula prefixes, extra fields, origin, count, UUID, nickname controls, template, type, schema, and origin normalization.

### SEC-04 — no browser CSP defense in depth — fixed in repository

Both pages use meta CSP with `script-src 'self'`, no script `unsafe-inline`/`unsafe-eval`, no object embedding, no base-URL rewriting, and no form submission. Checklist image/connect sources are restricted to the actual LiveJournal image and Google Apps Script hosts. `upgrade-insecure-requests` is intentionally omitted because WebKit applies it to local same-origin HTTP scripts, which would break legitimate dependency-free local hosting; every allowed remote application URL is independently HTTPS-validated.

## Additional safeguards

- New-tab anchors, including safely parsed Markdown-like task links, use `rel="noopener noreferrer"`.
- The cover uses `referrerpolicy="no-referrer"`; it cannot receive page path/referrer or checklist state.
- Export object URLs are revoked after the download click.
- Storage read/write/quota/security exceptions are contained; the page continues in memory and announces the limitation.
- Final collection is hidden unless explicitly enabled with an HTTPS `script.google.com/.../exec` URL.
- Receiver configuration is stored in Script Properties; owner setup values are non-secret allowlists/limits.
- Sheet schema mismatch stops writes rather than silently appending incompatible data.
- The Apps Script manifest uses V8 and only the Sheets OAuth scope.

## Residual risks and owner actions

1. **Anonymous endpoint abuse:** `sourceOrigin` is client-asserted and is not authentication. Anonymous submissions can be forged, replayed with new UUIDs, or distributed to exhaust quotas. The repository can limit and validate abuse but cannot establish user identity without a real authenticated server workflow. If identity becomes a requirement, add server-managed authentication/rate controls outside the static client; do not put a secret in browser JavaScript.
2. **Apps Script not live-tested here:** `Code.gs` compiles under the local V8-compatible syntax check and its twelve side-effect-free tests pass, but Google authorization, deployment policy, redirects/CORS, concurrent sheet writes, and account-specific quotas require owner staging deployment. Follow `google-apps-script/README.md` before enabling the client.
3. **Meta CSP limitations:** GitHub Pages source cannot set response headers from this repository. Meta CSP cannot provide directives such as `frame-ancestors`. A configurable host should also send CSP, `X-Content-Type-Options: nosniff`, a suitable `Referrer-Policy`, and framing protections as HTTP response headers. This is hosting configuration, not a reason to make the app non-static.
4. **Remote cover request:** loading the existing LiveJournal-hosted cover necessarily exposes ordinary request metadata such as IP address and user agent to that host. No nickname, task links, progress, local storage, or imported data is included. Self-hosting the unchanged image would remove that request if the owner has redistribution rights.
5. **Spreadsheet governance:** the owner must control sharing, retention, deletion, monitoring, and collaborator access for collected nicknames/counts. These policies are outside this repository.
6. **Rate counters are approximate:** Apps Script cache is not durable. UUID deduplication in the sheet is the durable replay control; rate limiting remains best-effort and global.

## Security validation performed locally

- `node tests/check-static.mjs` — passed; exact copy hashes, unique IDs, CSP/sink checks, and 12 receiver tests.
- `node --check checklist.js` and `node --check faq.js` — passed.
- `npx --yes html-validate checklist.html index.html` — passed.
- Malformed JSON, hostile template/cover markup, prototype keys, oversized backup, corrupt storage, unavailable storage, invalid/dangerous URLs, duplicates, and legacy state were exercised in real browsers.
- Final POST was intercepted and inspected: seven aggregate keys only; no detailed user data or token.
- Chrome, Edge, Firefox, WebKit, iOS Safari emulation, and Android Chrome emulation completed without console errors.

Security status is therefore: confirmed repository-side injection/data-boundary findings remediated and locally tested; anonymous receiver abuse and live Apps Script deployment remain explicit external/operational risks.
