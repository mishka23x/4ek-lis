# Analytics security model

## Objective

Collect high-value season/product analytics while keeping raw user-created content out of the backend.

## Data that stays client-side

- actual post URLs;
- post contents;
- task/category display text;
- arbitrary localStorage values;
- JSON backup contents;
- browsing history;
- raw User-Agent;
- Supabase credentials.

## Data that may leave the browser

Only after the owner configures/enables the final statistics endpoint and the user triggers final submission:

- UUIDv4 submission/participant IDs;
- template/source metadata;
- nickname;
- coarse viewport/input/preferences/language;
- overall derived counts;
- per-category IDs + derived counts;
- per-task IDs + checked/favorite/count metrics;
- quota IDs + numeric targets;
- aggregate engagement counters/milestones;
- daily aggregate engagement rows.

## Trust boundaries

### Browser

Untrusted. All analytics fields can be forged by a determined caller. Client-side validation exists for correctness and UX, not authority.

### Apps Script

Canonical public gateway. It performs strict schema/range/invariant validation, origin allowlisting, rate controls, idempotency and sheet formula protection. It contains the Supabase secret only in Script Properties.

### Google Sheets

Owner-controlled operational/reporting copy. Normalized tables make inspection/pivots easy. Formula-leading nickname text is neutralized.

### Supabase

Owner-controlled analytical database. The secret key maps to an elevated role that bypasses RLS, therefore it is backend-only. Browser roles receive no privileges on analytics tables or ingestion RPC.

## Idempotency

`submissionId` is the cross-sink idempotency key.

- Browser preserves it after failed delivery.
- Sheets checks it before writing.
- PostgreSQL uses it as the parent primary key.
- The RPC returns duplicate success for a previously stored UUID.

## Integrity checks

The Apps Script gateway validates:

- exact field sets;
- body size;
- UUIDs;
- origin/template policy;
- task/category/quota/day uniqueness;
- bounded integers/strings/timestamps;
- entered = valid + invalid;
- valid = unique + duplicate;
- per-task -> category aggregation;
- category -> overall aggregation;
- daily -> engagement totals;
- completion-percent calculations;
- bounded challenge calculations.

PostgreSQL adds CHECK constraints, PK/FK relationships and transactional inserts.

## Residual risks

1. Anonymous clients can fabricate plausible data. Strong authentication would require a real identity/auth flow.
2. Distributed abuse can bypass a simple global cache rate budget.
3. `sourceOrigin` is client-asserted and is an anti-accident signal, not authentication.
4. A compromised Apps Script project/account could expose the Supabase secret.
5. Nickname + persistent random participant ID are pseudonymous data and need an owner retention/access policy.
6. Low-entropy client context is deliberately coarse, but combining any persistent identifier with usage history increases privacy sensitivity. Access should remain restricted.

## Why Supabase is not called from GitHub Pages

A modern `sb_secret_...` key has elevated access and bypasses Row Level Security. It must not be placed in public JavaScript. The browser therefore talks only to Apps Script; Apps Script talks to Supabase server-to-server.
