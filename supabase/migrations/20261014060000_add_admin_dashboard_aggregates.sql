-- Sediakan agregat harian akun dan penggunaan storage tanpa membuka data per pengguna.
create or replace function public.admin_get_account_growth()
returns table (day date, accounts bigint)
language sql
security definer
set search_path = ''
as $$
  select
    dates.day::date,
    count(users.id)::bigint
  from generate_series(
    (now() at time zone 'UTC')::date - 29,
    (now() at time zone 'UTC')::date,
    interval '1 day'
  ) as dates(day)
  left join public.users as users
    on users.created_at >= dates.day
    and users.created_at < dates.day + interval '1 day'
  where exists (
    select 1
    from public.admin_users as admins
    where admins.user_id = auth.uid()
  )
  group by dates.day
  order by dates.day;
$$;

create or replace function public.admin_get_storage_usage()
returns table (object_count bigint, total_bytes bigint)
language sql
security definer
set search_path = ''
as $$
  select
    count(*)::bigint,
    coalesce(sum(
      case
        when storage_objects.metadata->>'size' ~ '^[0-9]+$'
          then (storage_objects.metadata->>'size')::bigint
        else 0
      end
    ), 0)::bigint
  from storage.objects as storage_objects
  where exists (
    select 1
    from public.admin_users as admins
    where admins.user_id = auth.uid()
  );
$$;

revoke all on function public.admin_get_account_growth() from public, anon;
revoke all on function public.admin_get_storage_usage() from public, anon;
grant execute on function public.admin_get_account_growth() to authenticated;
grant execute on function public.admin_get_storage_usage() to authenticated;
