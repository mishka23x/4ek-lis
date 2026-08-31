# Local regression checks

Production remains plain static HTML/CSS/JavaScript and has no package/runtime dependency.

Run the dependency-free structural/security/copy check:

```powershell
node tests/check-static.mjs
```

Serve the repository locally for browser checks:

```powershell
py -m http.server 4174 --bind 127.0.0.1
```

Use the locally installed/ephemeral Playwright CLI for Chrome, Edge, Firefox, and WebKit. The comprehensive viewport, axe, malicious-import, storage, migration, visual, and 4x-CPU evidence is intentionally local to conserve GitHub Free Actions minutes. Do not add a broad Actions matrix without owner approval.

The reusable Playwright CLI callbacks cover the highest-risk scenarios:

- `playwright-local-validation.js`: 320px overflow, long URLs/many rows, link-versus-checkbox behavior, category collapse while editing, input sizing, and footer clearance.
- `playwright-final-mock.js`: aggregate final-submission contract, rejected-request retry, UUID idempotency, and pending/sent state transitions using a mocked `/exec` endpoint.
- `playwright-final-failures.js`: invalid/HTTP error response and 15-second network-timeout recovery while retaining the retry UUID.
- `playwright-cls.js`: slow-cover reservation and layout-shift measurement.
- `playwright-large-state.js`: 2,890-link interaction benchmark intended to run with Chromium 4x CPU throttling.

Example (after starting the local server):

```powershell
npx --yes @playwright/cli -s=local open http://127.0.0.1:4174/checklist.html --browser chrome
npx --yes @playwright/cli --raw -s=local run-code --filename tests/playwright-local-validation.js
```

These callbacks are development-only input to Playwright CLI; the browser never loads them and production has no Playwright dependency.

Fixtures:

- `legacy-v1.json` proves current-template migration and the duplicated legacy task-ID split.
- `malicious-template-v1.json` proves imported template/cover markup is ignored while safe mutable progress migrates.
- `prototype-pollution.json` must fail safely without modifying object prototypes or replacing current progress.
