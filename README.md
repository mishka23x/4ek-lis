# 4ek-lis

Все пояснения в базе 4lisa на github.

Dependency-free static LiveJournal marathon checklist and FAQ. Production consists only of HTML, CSS, JavaScript, and the existing image asset; it can be served by GitHub Pages or any ordinary static host without a build step.

## Local preview

```powershell
py -m http.server 4174 --bind 127.0.0.1
```

Open:

- <http://127.0.0.1:4174/>
- <http://127.0.0.1:4174/checklist.html>

## Local checks

```powershell
node tests/check-static.mjs
```

The structural check uses only Node's built-in modules. Comprehensive browser, viewport, accessibility, security-fixture, visual, and performance tests are run locally to conserve GitHub Free Actions minutes; see `tests/README.md`.

## Final-season statistics

Collection is disabled by default. A complete dependency-free Google Apps Script receiver and owner deployment guide are in `google-apps-script/`.

After deploying its public `/exec` web app, update the `appConfig` JSON block near the end of `checklist.html`:

```json
{
  "templateVersion": "2026-11-22",
  "challengeCategoryName": "Челленджи",
  "challengeCompleteThreshold": 10,
  "finalStatsEnabled": true,
  "finalStatsUrl": "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
}
```

Do not use an editor-only `/dev` URL. No client-side token is secret or required by the new aggregate receiver.

## Persistence compatibility

The browser keeps mutable progress in `localStorage` under `ljMarathonState_v1`. Schema migration preserves valid legacy progress while replacing imported template content with the trusted embedded repository template. JSON backup/import remains available through the existing buttons.
