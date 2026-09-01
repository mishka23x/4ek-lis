-- 4ek-lis Supabase/PostgreSQL analytics schema
-- Run in the Supabase SQL Editor before enabling SUPABASE_REQUIRED in Apps Script.
-- No browser client accesses these tables. Apps Script calls the RPC with an
-- sb_secret_... key stored only in Apps Script Script Properties.

begin;

create table if not exists public.analytics_submissions (
  submission_id uuid primary key,
  participant_id uuid not null,
  template_version text not null check (char_length(template_version) between 1 and 100),
  source_origin text not null check (char_length(source_origin) between 1 and 255),
  generated_at timestamptz not null,
  received_at timestamptz not null default now(),
  analytics_version text not null check (char_length(analytics_version) between 1 and 40),
  nickname text not null check (char_length(nickname) between 1 and 512),
  viewport_bucket text not null check (viewport_bucket in ('xs<=480','sm481-768','md769-1024','lg1025-1440','xl>1440')),
  input_mode text not null check (input_mode in ('touch','pointer','mixed','unknown')),
  reduced_motion boolean not null,
  color_scheme text not null check (color_scheme in ('light','dark')),
  language text not null check (char_length(language) <= 20),
  total_tasks integer not null check (total_tasks > 0),
  checked_count integer not null check (checked_count between 0 and total_tasks),
  completion_percent numeric(6,2) not null check (completion_percent between 0 and 100),
  total_categories integer not null check (total_categories > 0),
  categories_started integer not null check (categories_started between 0 and total_categories),
  completed_categories integer not null check (completed_categories between 0 and total_categories),
  total_entered_links integer not null check (total_entered_links >= 0),
  valid_links integer not null check (valid_links >= 0),
  unique_valid_links integer not null check (unique_valid_links >= 0),
  duplicate_links integer not null check (duplicate_links >= 0),
  invalid_links integer not null check (invalid_links >= 0),
  favorite_count integer not null check (favorite_count between 0 and total_tasks),
  challenge_links integer not null check (challenge_links >= 0),
  completed_challenges integer not null check (completed_challenges >= 0),
  tasks_with_links integer not null check (tasks_with_links between 0 and total_tasks),
  tasks_with_multiple_links integer not null check (tasks_with_multiple_links between 0 and total_tasks),
  max_links_on_single_task integer not null check (max_links_on_single_task >= 0),
  first_opened_at timestamptz not null,
  last_active_at timestamptz not null,
  active_days integer not null check (active_days >= 0),
  session_count integer not null check (session_count >= 0),
  total_active_seconds bigint not null check (total_active_seconds >= 0),
  export_count integer not null check (export_count >= 0),
  import_attempt_count integer not null check (import_attempt_count >= 0),
  import_success_count integer not null check (import_success_count between 0 and import_attempt_count),
  reset_count integer not null check (reset_count >= 0),
  task_toggle_count integer not null check (task_toggle_count >= 0),
  favorite_toggle_count integer not null check (favorite_toggle_count >= 0),
  category_toggle_count integer not null check (category_toggle_count >= 0),
  collapse_all_count integer not null check (collapse_all_count >= 0),
  expand_all_count integer not null check (expand_all_count >= 0),
  link_commit_count integer not null check (link_commit_count >= 0),
  first_task_completed_at timestamptz,
  first_post_linked_at timestamptz,
  first_challenge_completed_at timestamptz,
  halfway_reached_at timestamptz,
  last_task_completed_at timestamptz,
  schema_version integer not null check (schema_version = 2),
  receiver_version text,
  constraint analytics_link_totals check (total_entered_links = valid_links + invalid_links),
  constraint analytics_unique_totals check (valid_links = unique_valid_links + duplicate_links)
);

create table if not exists public.analytics_categories (
  submission_id uuid not null references public.analytics_submissions(submission_id) on delete cascade,
  participant_id uuid not null,
  template_version text not null,
  category_id text not null check (category_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  task_count integer not null check (task_count > 0),
  checked_count integer not null check (checked_count between 0 and task_count),
  completion_percent numeric(6,2) not null check (completion_percent between 0 and 100),
  favorite_count integer not null check (favorite_count between 0 and task_count),
  entered_link_count integer not null check (entered_link_count >= 0),
  valid_link_count integer not null check (valid_link_count >= 0),
  unique_valid_link_count integer not null check (unique_valid_link_count >= 0),
  duplicate_link_count integer not null check (duplicate_link_count >= 0),
  invalid_link_count integer not null check (invalid_link_count >= 0),
  completed_challenges integer not null check (completed_challenges >= 0),
  primary key (submission_id, category_id),
  constraint category_link_totals check (entered_link_count = valid_link_count + invalid_link_count),
  constraint category_unique_totals check (valid_link_count = unique_valid_link_count + duplicate_link_count)
);

create table if not exists public.analytics_tasks (
  submission_id uuid not null references public.analytics_submissions(submission_id) on delete cascade,
  participant_id uuid not null,
  template_version text not null,
  category_id text not null check (category_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  task_id text not null check (task_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  checked boolean not null,
  favorite boolean not null,
  entered_link_count integer not null check (entered_link_count >= 0),
  valid_link_count integer not null check (valid_link_count >= 0),
  unique_valid_link_count integer not null check (unique_valid_link_count >= 0),
  duplicate_link_count integer not null check (duplicate_link_count >= 0),
  invalid_link_count integer not null check (invalid_link_count >= 0),
  completed_challenges integer not null check (completed_challenges >= 0),
  primary key (submission_id, task_id),
  constraint task_link_totals check (entered_link_count = valid_link_count + invalid_link_count),
  constraint task_unique_totals check (valid_link_count = unique_valid_link_count + duplicate_link_count)
);

create table if not exists public.analytics_quotas (
  submission_id uuid not null references public.analytics_submissions(submission_id) on delete cascade,
  participant_id uuid not null,
  template_version text not null,
  quota_id text not null check (quota_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  target integer check (target between 0 and 1000000),
  primary key (submission_id, quota_id)
);

create table if not exists public.analytics_daily (
  submission_id uuid not null references public.analytics_submissions(submission_id) on delete cascade,
  participant_id uuid not null,
  template_version text not null,
  day date not null,
  active_seconds integer not null check (active_seconds between 0 and 86400),
  sessions integer not null check (sessions >= 0),
  task_toggles integer not null check (task_toggles >= 0),
  favorite_toggles integer not null check (favorite_toggles >= 0),
  category_toggles integer not null check (category_toggles >= 0),
  link_commits integer not null check (link_commits >= 0),
  exports integer not null check (exports >= 0),
  import_attempts integer not null check (import_attempts >= 0),
  import_successes integer not null check (import_successes between 0 and import_attempts),
  resets integer not null check (resets >= 0),
  primary key (submission_id, day)
);

create index if not exists analytics_submissions_participant_idx on public.analytics_submissions(participant_id, generated_at desc);
create index if not exists analytics_submissions_template_idx on public.analytics_submissions(template_version, generated_at desc);
create index if not exists analytics_tasks_template_task_idx on public.analytics_tasks(template_version, task_id);
create index if not exists analytics_categories_template_category_idx on public.analytics_categories(template_version, category_id);
create index if not exists analytics_daily_template_day_idx on public.analytics_daily(template_version, day);

alter table public.analytics_submissions enable row level security;
alter table public.analytics_categories enable row level security;
alter table public.analytics_tasks enable row level security;
alter table public.analytics_quotas enable row level security;
alter table public.analytics_daily enable row level security;

revoke all on public.analytics_submissions, public.analytics_categories, public.analytics_tasks, public.analytics_quotas, public.analytics_daily from public, anon, authenticated;
grant select, insert, update, delete on public.analytics_submissions, public.analytics_categories, public.analytics_tasks, public.analytics_quotas, public.analytics_daily to service_role;

create or replace function public.ingest_analytics_submission(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_submission_id uuid;
  v_participant_id uuid;
  v_inserted integer;
  v_overall jsonb;
  v_engagement jsonb;
  v_context jsonb;
begin
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload';
  end if;
  if (p_payload->>'schemaVersion')::integer <> 2 or p_payload->>'type' <> 'final_analytics' then
    raise exception 'unsupported_schema_or_type';
  end if;

  v_submission_id := (p_payload->>'submissionId')::uuid;
  v_participant_id := (p_payload->>'participantId')::uuid;
  v_overall := p_payload->'overall';
  v_engagement := p_payload->'engagement';
  v_context := p_payload->'clientContext';

  insert into public.analytics_submissions (
    submission_id, participant_id, template_version, source_origin, generated_at, analytics_version, nickname,
    viewport_bucket, input_mode, reduced_motion, color_scheme, language,
    total_tasks, checked_count, completion_percent, total_categories, categories_started, completed_categories,
    total_entered_links, valid_links, unique_valid_links, duplicate_links, invalid_links, favorite_count,
    challenge_links, completed_challenges, tasks_with_links, tasks_with_multiple_links, max_links_on_single_task,
    first_opened_at, last_active_at, active_days, session_count, total_active_seconds, export_count,
    import_attempt_count, import_success_count, reset_count, task_toggle_count, favorite_toggle_count,
    category_toggle_count, collapse_all_count, expand_all_count, link_commit_count,
    first_task_completed_at, first_post_linked_at, first_challenge_completed_at, halfway_reached_at,
    last_task_completed_at, schema_version
  ) values (
    v_submission_id, v_participant_id, p_payload->>'templateVersion', p_payload->>'sourceOrigin',
    (p_payload->>'generatedAt')::timestamptz, p_payload->>'analyticsVersion', p_payload->>'nick',
    v_context->>'viewportBucket', v_context->>'inputMode', (v_context->>'reducedMotion')::boolean,
    v_context->>'colorScheme', v_context->>'language',
    (v_overall->>'totalTasks')::integer, (v_overall->>'checkedCount')::integer, (v_overall->>'completionPercent')::numeric,
    (v_overall->>'totalCategories')::integer, (v_overall->>'categoriesStarted')::integer, (v_overall->>'completedCategories')::integer,
    (v_overall->>'totalEnteredLinks')::integer, (v_overall->>'validLinks')::integer, (v_overall->>'uniqueValidLinks')::integer,
    (v_overall->>'duplicateLinks')::integer, (v_overall->>'invalidLinks')::integer, (v_overall->>'favoriteCount')::integer,
    (v_overall->>'challengeLinks')::integer, (v_overall->>'completedChallenges')::integer,
    (v_overall->>'tasksWithLinks')::integer, (v_overall->>'tasksWithMultipleLinks')::integer,
    (v_overall->>'maxLinksOnSingleTask')::integer,
    (v_engagement->>'firstOpenedAt')::timestamptz, (v_engagement->>'lastActiveAt')::timestamptz,
    (v_engagement->>'activeDays')::integer, (v_engagement->>'sessionCount')::integer,
    (v_engagement->>'totalActiveSeconds')::bigint, (v_engagement->>'exportCount')::integer,
    (v_engagement->>'importAttemptCount')::integer, (v_engagement->>'importSuccessCount')::integer,
    (v_engagement->>'resetCount')::integer, (v_engagement->>'taskToggleCount')::integer,
    (v_engagement->>'favoriteToggleCount')::integer, (v_engagement->>'categoryToggleCount')::integer,
    (v_engagement->>'collapseAllCount')::integer, (v_engagement->>'expandAllCount')::integer,
    (v_engagement->>'linkCommitCount')::integer,
    nullif(v_engagement->>'firstTaskCompletedAt','')::timestamptz,
    nullif(v_engagement->>'firstPostLinkedAt','')::timestamptz,
    nullif(v_engagement->>'firstChallengeCompletedAt','')::timestamptz,
    nullif(v_engagement->>'halfwayReachedAt','')::timestamptz,
    nullif(v_engagement->>'lastTaskCompletedAt','')::timestamptz,
    2
  ) on conflict (submission_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('ok', true, 'duplicate', true, 'submissionId', v_submission_id);
  end if;

  insert into public.analytics_categories (
    submission_id, participant_id, template_version, category_id, task_count, checked_count,
    completion_percent, favorite_count, entered_link_count, valid_link_count, unique_valid_link_count,
    duplicate_link_count, invalid_link_count, completed_challenges
  )
  select
    v_submission_id, v_participant_id, p_payload->>'templateVersion', row->>'categoryId',
    (row->>'taskCount')::integer, (row->>'checkedCount')::integer, (row->>'completionPercent')::numeric,
    (row->>'favoriteCount')::integer, (row->>'enteredLinkCount')::integer, (row->>'validLinkCount')::integer,
    (row->>'uniqueValidLinkCount')::integer, (row->>'duplicateLinkCount')::integer,
    (row->>'invalidLinkCount')::integer, (row->>'completedChallenges')::integer
  from jsonb_array_elements(p_payload->'categoryStats') as row;

  insert into public.analytics_tasks (
    submission_id, participant_id, template_version, category_id, task_id, checked, favorite,
    entered_link_count, valid_link_count, unique_valid_link_count, duplicate_link_count, invalid_link_count,
    completed_challenges
  )
  select
    v_submission_id, v_participant_id, p_payload->>'templateVersion', row->>'categoryId', row->>'taskId',
    (row->>'checked')::boolean, (row->>'favorite')::boolean, (row->>'enteredLinkCount')::integer,
    (row->>'validLinkCount')::integer, (row->>'uniqueValidLinkCount')::integer,
    (row->>'duplicateLinkCount')::integer, (row->>'invalidLinkCount')::integer,
    (row->>'completedChallenges')::integer
  from jsonb_array_elements(p_payload->'taskStats') as row;

  insert into public.analytics_quotas (submission_id, participant_id, template_version, quota_id, target)
  select
    v_submission_id, v_participant_id, p_payload->>'templateVersion', row->>'quotaId',
    case when row->'target' = 'null'::jsonb then null else (row->>'target')::integer end
  from jsonb_array_elements(p_payload->'quotaStats') as row;

  insert into public.analytics_daily (
    submission_id, participant_id, template_version, day, active_seconds, sessions, task_toggles,
    favorite_toggles, category_toggles, link_commits, exports, import_attempts, import_successes, resets
  )
  select
    v_submission_id, v_participant_id, p_payload->>'templateVersion', (row->>'day')::date,
    (row->>'activeSeconds')::integer, (row->>'sessions')::integer, (row->>'taskToggles')::integer,
    (row->>'favoriteToggles')::integer, (row->>'categoryToggles')::integer, (row->>'linkCommits')::integer,
    (row->>'exports')::integer, (row->>'importAttempts')::integer, (row->>'importSuccesses')::integer,
    (row->>'resets')::integer
  from jsonb_array_elements(p_payload->'dailyStats') as row;

  return jsonb_build_object('ok', true, 'duplicate', false, 'submissionId', v_submission_id);
exception
  when others then
    -- If any child insert fails, PostgreSQL rolls the entire RPC transaction back.
    raise;
end;
$$;

revoke all on function public.ingest_analytics_submission(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_analytics_submission(jsonb) to service_role;

create or replace view public.analytics_template_summary as
select
  template_version,
  count(*) as submissions,
  count(distinct participant_id) as participants,
  round(avg(completion_percent), 2) as avg_completion_percent,
  percentile_cont(0.5) within group (order by completion_percent) as median_completion_percent,
  round(avg(unique_valid_links), 2) as avg_unique_valid_links,
  percentile_cont(0.5) within group (order by unique_valid_links) as median_unique_valid_links,
  round(avg(completed_challenges), 2) as avg_completed_challenges,
  round(avg(active_days), 2) as avg_active_days,
  round(avg(total_active_seconds), 2) as avg_active_seconds
from public.analytics_submissions
group by template_version;

create or replace view public.analytics_task_popularity as
select
  template_version,
  task_id,
  count(*) as submissions,
  sum(case when checked then 1 else 0 end) as checked_submissions,
  round(100.0 * avg(case when checked then 1 else 0 end), 2) as completion_rate_percent,
  round(100.0 * avg(case when favorite then 1 else 0 end), 2) as favorite_rate_percent,
  round(avg(unique_valid_link_count), 2) as avg_unique_links
from public.analytics_tasks
group by template_version, task_id;

create or replace view public.analytics_category_performance as
select
  template_version,
  category_id,
  count(*) as submissions,
  round(avg(completion_percent), 2) as avg_completion_percent,
  round(avg(unique_valid_link_count), 2) as avg_unique_links,
  round(avg(favorite_count), 2) as avg_favorites,
  round(avg(completed_challenges), 2) as avg_completed_challenges
from public.analytics_categories
group by template_version, category_id;

create or replace view public.analytics_daily_engagement as
select
  template_version,
  day,
  count(distinct participant_id) as participants,
  sum(active_seconds) as active_seconds,
  sum(sessions) as sessions,
  sum(task_toggles) as task_toggles,
  sum(favorite_toggles) as favorite_toggles,
  sum(link_commits) as link_commits
from public.analytics_daily
group by template_version, day;

revoke all on public.analytics_template_summary, public.analytics_task_popularity, public.analytics_category_performance, public.analytics_daily_engagement from public, anon, authenticated;
grant select on public.analytics_template_summary, public.analytics_task_popularity, public.analytics_category_performance, public.analytics_daily_engagement to service_role;

commit;
