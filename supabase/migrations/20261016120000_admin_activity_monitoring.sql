-- Private operational telemetry for admins; no transaction descriptions or amounts are exposed.
create table if not exists public.admin_service_errors (
  id bigint generated always as identity primary key,
  service text not null check (service in ('api', 'database', 'storage', 'auth')),
  route text not null check (char_length(route) <= 120),
  status_code integer not null check (status_code between 400 and 599),
  created_at timestamptz not null default now()
);
create index if not exists admin_service_errors_created_at_idx on public.admin_service_errors (created_at desc);
alter table public.admin_service_errors enable row level security;
revoke all on public.admin_service_errors from public, anon, authenticated;
grant insert, select on public.admin_service_errors to service_role;
grant usage, select on sequence public.admin_service_errors_id_seq to service_role;

create table if not exists public.admin_retention_runs (
  id bigint generated always as identity primary key,
  deleted_count integer not null default 0 check (deleted_count >= 0),
  cutoff_date date not null,
  created_at timestamptz not null default now()
);
alter table public.admin_retention_runs enable row level security;
revoke all on public.admin_retention_runs from public, anon, authenticated;
grant insert, select on public.admin_retention_runs to service_role;
grant usage, select on sequence public.admin_retention_runs_id_seq to service_role;

create or replace function public.admin_get_activity(period_days integer default 30)
returns table (active_users bigint, new_transactions bigint, period_days integer)
language sql stable security definer set search_path = ''
as $$
  select
    (select count(distinct t.user_id)::bigint from public.transactions t where t.created_at >= now() - make_interval(days => least(greatest(period_days, 1), 365))),
    (select count(*)::bigint from public.transactions t where t.created_at >= now() - make_interval(days => least(greatest(period_days, 1), 365))),
    least(greatest(period_days, 1), 365)
  where exists (select 1 from public.admin_users a where a.user_id = auth.uid());
$$;

create or replace function public.admin_get_retention_metrics()
returns table (expiring_soon bigint, overdue_pending bigint, purged_last_30_days bigint)
language sql stable security definer set search_path = ''
as $$
  with cutoff as (
    select ((now() at time zone 'UTC')::date - interval '2 months')::date as date
  )
  select
    (select count(*)::bigint from public.transactions t, cutoff c where t.date >= c.date and t.date < c.date + 30),
    (select count(*)::bigint from public.transactions t, cutoff c where t.date < c.date),
    (select coalesce(sum(r.deleted_count), 0)::bigint from public.admin_retention_runs r where r.created_at >= now() - interval '30 days')
  where exists (select 1 from public.admin_users a where a.user_id = auth.uid());
$$;

create or replace function public.admin_get_recent_errors()
returns table (id bigint, service text, route text, status_code integer, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select e.id, e.service, e.route, e.status_code, e.created_at
  from public.admin_service_errors e
  where exists (select 1 from public.admin_users a where a.user_id = auth.uid())
  order by e.created_at desc
  limit 20;
$$;

revoke all on function public.admin_get_activity(integer) from public, anon;
revoke all on function public.admin_get_retention_metrics() from public, anon;
revoke all on function public.admin_get_recent_errors() from public, anon;
grant execute on function public.admin_get_activity(integer) to authenticated;
grant execute on function public.admin_get_retention_metrics() to authenticated;
grant execute on function public.admin_get_recent_errors() to authenticated;
