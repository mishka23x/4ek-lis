# Supabase analytics backend

The static frontend never connects to Supabase directly. Apps Script is the only gateway.

## Setup

1. Create a Supabase project on the Free plan.
2. Open SQL Editor and run `schema.sql`.
3. In **Settings → API Keys**, create/copy a modern `sb_secret_...` key for this gateway.
4. Store it only in Apps Script Script Properties:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_REQUIRED=false
```

5. Run Apps Script `validateSupabaseConfiguration()`.
6. Complete the end-to-end staging checklist in `google-apps-script/README.md`.
7. Set `SUPABASE_REQUIRED=true` only after both sinks are proven.

## Data model

- `analytics_submissions`: one aggregate snapshot per submission UUID.
- `analytics_categories`: per-category derived metrics.
- `analytics_tasks`: per-task booleans/counts, no task text and no URLs.
- `analytics_quotas`: quota IDs and numeric targets.
- `analytics_daily`: daily aggregate engagement counters.

Views:

- `analytics_template_summary`
- `analytics_task_popularity`
- `analytics_category_performance`
- `analytics_daily_engagement`

## Security

All analytics tables have RLS enabled. `public`, `anon` and `authenticated` receive no table privileges and cannot execute the ingestion RPC. Only `service_role` is granted access; the modern Supabase secret key maps to that elevated role and therefore must remain server-side.

The ingestion RPC is `SECURITY DEFINER`, uses a fixed `search_path`, stores a full snapshot transactionally and treats duplicate `submission_id` as idempotent success.

Do not expose a Supabase publishable key for these analytics tables unless you intentionally design and audit a separate RLS-based public/read path.

## Useful queries

```sql
select * from public.analytics_template_summary;
select * from public.analytics_task_popularity order by completion_rate_percent desc;
select * from public.analytics_category_performance order by avg_completion_percent desc;
select * from public.analytics_daily_engagement order by day;
```

Returning-participant example:

```sql
select participant_id, count(distinct template_version) seasons
from public.analytics_submissions
group by participant_id
order by seasons desc;
```

## Retention

The repository intentionally does not impose a retention period. The owner should choose and document one for nicknames and pseudonymous analytics, then periodically delete data older than that policy requires.
