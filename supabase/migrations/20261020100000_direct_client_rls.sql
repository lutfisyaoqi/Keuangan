-- CatatUang browser-client access. This migration keeps all financial data
-- behind the user's Supabase JWT and RLS; it does not require service-role access.

create or replace function public.account_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.id = (select auth.uid()) and u.account_status = 'active'
  );
$$;
revoke all on function public.account_is_active() from public, anon;
grant execute on function public.account_is_active() to authenticated;

drop policy if exists "users can read own transactions" on public.transactions;
drop policy if exists "users can insert own transactions" on public.transactions;
drop policy if exists "users can update own transactions" on public.transactions;
drop policy if exists "users can delete own transactions" on public.transactions;

create policy "active users can read own transactions"
on public.transactions for select to authenticated
using ((select auth.uid()) = user_id and (select public.account_is_active()));
create policy "active users can insert own transactions"
on public.transactions for insert to authenticated
with check ((select auth.uid()) = user_id and (select public.account_is_active()));
create policy "active users can update own transactions"
on public.transactions for update to authenticated
using ((select auth.uid()) = user_id and (select public.account_is_active()))
with check ((select auth.uid()) = user_id and (select public.account_is_active()));
create policy "active users can delete own transactions"
on public.transactions for delete to authenticated
using ((select auth.uid()) = user_id and (select public.account_is_active()));

drop policy if exists "users can read own transaction receipts" on storage.objects;
drop policy if exists "users can upload own transaction receipts" on storage.objects;
drop policy if exists "users can update own transaction receipts" on storage.objects;
drop policy if exists "users can delete own transaction receipts" on storage.objects;
create policy "active users can read own transaction receipts"
on storage.objects for select to authenticated
using (bucket_id = 'transaction-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.account_is_active()));
create policy "active users can upload own transaction receipts"
on storage.objects for insert to authenticated
with check (bucket_id = 'transaction-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.account_is_active()));
create policy "active users can update own transaction receipts"
on storage.objects for update to authenticated
using (bucket_id = 'transaction-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.account_is_active()))
with check (bucket_id = 'transaction-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.account_is_active()));
create policy "active users can delete own transaction receipts"
on storage.objects for delete to authenticated
using (bucket_id = 'transaction-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.account_is_active()));

create or replace function public.admin_get_my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.role from public.admin_users a
  join public.users u on u.id = a.user_id and u.account_status = 'active'
  where a.user_id = (select auth.uid());
$$;
revoke all on function public.admin_get_my_role() from public, anon;
grant execute on function public.admin_get_my_role() to authenticated;

create or replace function public.get_public_service_status()
returns table (announcement text, maintenance_mode boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.announcement, s.maintenance_mode
  from public.app_settings s where s.id = true;
$$;
revoke all on function public.get_public_service_status() from public;
grant execute on function public.get_public_service_status() to anon, authenticated;

create or replace function public.admin_get_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.admin_get_my_role() is null then
    raise exception 'Akses admin diperlukan.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'checks', jsonb_build_object(
      'database', true,
      'auth', to_regclass('auth.users') is not null,
      'storage', to_regclass('storage.objects') is not null,
      'rls', (select relrowsecurity from pg_class where oid = 'public.transactions'::regclass)
    )
  );
end;
$$;
revoke all on function public.admin_get_health() from public, anon;
grant execute on function public.admin_get_health() to authenticated;

create or replace function public.admin_list_users(
  p_page integer default 1,
  p_page_size integer default 25,
  p_search text default '',
  p_sort_by text default 'created_at',
  p_sort_order text default 'desc',
  p_status text default null,
  p_created_from date default null,
  p_created_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  admin_role text := public.admin_get_my_role();
  safe_page integer := greatest(coalesce(p_page, 1), 1);
  safe_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  total_rows bigint;
  users_json jsonb;
begin
  if admin_role is null then raise exception 'Akses admin diperlukan.' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('active', 'disabled') then raise exception 'Filter status tidak valid.' using errcode = '22023'; end if;
  if p_sort_by not in ('created_at', 'name', 'email', 'account_status') then raise exception 'Pengurutan tidak valid.' using errcode = '22023'; end if;
  if p_sort_order not in ('asc', 'desc') then raise exception 'Arah pengurutan tidak valid.' using errcode = '22023'; end if;

  with filtered as (
    select u.id, u.name, coalesce(a.email, u.email) as email, u.created_at,
      u.account_status, u.disabled_reason, (a.email_confirmed_at is not null) as email_confirmed
    from public.users u
    left join auth.users a on a.id = u.id
    where (p_status is null or u.account_status = p_status)
      and (p_created_from is null or u.created_at >= p_created_from::timestamptz)
      and (p_created_to is null or u.created_at < (p_created_to + 1)::timestamptz)
      and (coalesce(trim(p_search), '') = '' or u.name ilike '%' || trim(p_search) || '%' or a.email ilike '%' || trim(p_search) || '%')
  ) select count(*) into total_rows from filtered;

  with filtered as (
    select u.id, u.name, coalesce(a.email, u.email) as email, u.created_at,
      u.account_status, u.disabled_reason, (a.email_confirmed_at is not null) as email_confirmed
    from public.users u
    left join auth.users a on a.id = u.id
    where (p_status is null or u.account_status = p_status)
      and (p_created_from is null or u.created_at >= p_created_from::timestamptz)
      and (p_created_to is null or u.created_at < (p_created_to + 1)::timestamptz)
      and (coalesce(trim(p_search), '') = '' or u.name ilike '%' || trim(p_search) || '%' or a.email ilike '%' || trim(p_search) || '%')
  ), page_rows as (
    select * from filtered
    order by
      case when p_sort_by = 'created_at' and p_sort_order = 'asc' then created_at end asc,
      case when p_sort_by = 'created_at' and p_sort_order = 'desc' then created_at end desc,
      case when p_sort_by = 'name' and p_sort_order = 'asc' then lower(name) end asc,
      case when p_sort_by = 'name' and p_sort_order = 'desc' then lower(name) end desc,
      case when p_sort_by = 'email' and p_sort_order = 'asc' then lower(email) end asc,
      case when p_sort_by = 'email' and p_sort_order = 'desc' then lower(email) end desc,
      case when p_sort_by = 'account_status' and p_sort_order = 'asc' then account_status end asc,
      case when p_sort_by = 'account_status' and p_sort_order = 'desc' then account_status end desc
    limit safe_size offset (safe_page - 1) * safe_size
  ) select coalesce(jsonb_agg(to_jsonb(page_rows)), '[]'::jsonb) into users_json from page_rows;

  return jsonb_build_object('users', users_json, 'total', total_rows, 'page', safe_page, 'pageSize', safe_size);
end;
$$;
revoke all on function public.admin_list_users(integer, integer, text, text, text, text, date, date) from public, anon;
grant execute on function public.admin_list_users(integer, integer, text, text, text, text, date, date) to authenticated;

create or replace function public.admin_list_audit_logs(
  p_page integer default 1,
  p_page_size integer default 50,
  p_action text default null,
  p_actor_role text default null,
  p_actor_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_page integer := greatest(coalesce(p_page, 1), 1);
  safe_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  total_rows bigint;
  logs_json jsonb;
begin
  if public.admin_get_my_role() is null then raise exception 'Akses admin diperlukan.' using errcode = '42501'; end if;
  with filtered as (
    select l.id, l.actor_user_id, l.actor_role, l.action, l.target_user_id, l.reason, l.result, l.details, l.created_at
    from public.admin_audit_logs l
    where (p_action is null or l.action = p_action)
      and (p_actor_role is null or l.actor_role = p_actor_role)
      and (p_actor_id is null or l.actor_user_id = p_actor_id)
      and (p_from is null or l.created_at >= p_from::timestamptz)
      and (p_to is null or l.created_at < (p_to + 1)::timestamptz)
  ) select count(*) into total_rows from filtered;
  with filtered as (
    select l.id, l.actor_user_id, l.actor_role, l.action, l.target_user_id, l.reason, l.result, l.details, l.created_at
    from public.admin_audit_logs l
    where (p_action is null or l.action = p_action)
      and (p_actor_role is null or l.actor_role = p_actor_role)
      and (p_actor_id is null or l.actor_user_id = p_actor_id)
      and (p_from is null or l.created_at >= p_from::timestamptz)
      and (p_to is null or l.created_at < (p_to + 1)::timestamptz)
    order by l.created_at desc
    limit safe_size offset (safe_page - 1) * safe_size
  ) select coalesce(jsonb_agg(to_jsonb(filtered)), '[]'::jsonb) into logs_json from filtered;
  return jsonb_build_object('logs', logs_json, 'total', total_rows, 'page', safe_page, 'pageSize', safe_size);
end;
$$;
revoke all on function public.admin_list_audit_logs(integer, integer, text, text, uuid, date, date) from public, anon;
grant execute on function public.admin_list_audit_logs(integer, integer, text, text, uuid, date, date) to authenticated;

create or replace function public.admin_get_settings()
returns table (announcement text, maintenance_mode boolean, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.admin_get_my_role() is null then raise exception 'Akses admin diperlukan.' using errcode = '42501'; end if;
  return query select s.announcement, s.maintenance_mode, s.updated_at from public.app_settings s where s.id = true;
end;
$$;
revoke all on function public.admin_get_settings() from public, anon;
grant execute on function public.admin_get_settings() to authenticated;

create or replace function public.admin_disable_user(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid(); actor_role text := public.admin_get_my_role(); target_role text;
begin
  if actor_role is null or actor_role not in ('admin', 'owner') then raise exception 'Akses tulis admin diperlukan.' using errcode = '42501'; end if;
  if p_user_id = actor then raise exception 'Akun sendiri tidak dapat dinonaktifkan.' using errcode = '22023'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 1 and 500 then raise exception 'Alasan wajib diisi.' using errcode = '22023'; end if;
  select a.role into target_role from public.admin_users a where a.user_id = p_user_id;
  if target_role = 'owner' and actor_role <> 'owner' then raise exception 'Hanya owner yang dapat mengubah akun owner.' using errcode = '42501'; end if;
  update public.users set account_status = 'disabled', disabled_reason = trim(p_reason) where id = p_user_id;
  if not found then raise exception 'Akun tidak ditemukan.' using errcode = 'P0002'; end if;
  insert into public.admin_audit_logs(actor_user_id, actor_role, action, target_user_id, reason, result)
  values(actor, actor_role, 'user.disable', p_user_id, trim(p_reason), 'success');
end;
$$;
revoke all on function public.admin_disable_user(uuid, text) from public, anon;
grant execute on function public.admin_disable_user(uuid, text) to authenticated;

create or replace function public.admin_enable_user(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid(); actor_role text := public.admin_get_my_role(); target_role text;
begin
  if actor_role is null or actor_role not in ('admin', 'owner') then raise exception 'Akses tulis admin diperlukan.' using errcode = '42501'; end if;
  if p_user_id = actor then raise exception 'Akun sendiri tidak dapat diubah.' using errcode = '22023'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 1 and 500 then raise exception 'Alasan wajib diisi.' using errcode = '22023'; end if;
  select a.role into target_role from public.admin_users a where a.user_id = p_user_id;
  if target_role = 'owner' and actor_role <> 'owner' then raise exception 'Hanya owner yang dapat mengubah akun owner.' using errcode = '42501'; end if;
  update public.users set account_status = 'active', disabled_reason = null where id = p_user_id;
  if not found then raise exception 'Akun tidak ditemukan.' using errcode = 'P0002'; end if;
  insert into public.admin_audit_logs(actor_user_id, actor_role, action, target_user_id, reason, result)
  values(actor, actor_role, 'user.enable', p_user_id, trim(p_reason), 'success');
end;
$$;
revoke all on function public.admin_enable_user(uuid, text) from public, anon;
grant execute on function public.admin_enable_user(uuid, text) to authenticated;

create or replace function public.admin_delete_user(p_user_id uuid, p_email text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid(); actor_role text := public.admin_get_my_role(); target_email text; target_role text;
begin
  if actor_role is null or actor_role not in ('admin', 'owner') then raise exception 'Akses tulis admin diperlukan.' using errcode = '42501'; end if;
  if p_user_id = actor then raise exception 'Akun sendiri tidak dapat dihapus.' using errcode = '22023'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 1 and 500 then raise exception 'Alasan wajib diisi.' using errcode = '22023'; end if;
  select u.email, a.role into target_email, target_role
  from auth.users u left join public.admin_users a on a.user_id = u.id where u.id = p_user_id;
  if target_email is null then raise exception 'Akun tidak ditemukan.' using errcode = 'P0002'; end if;
  if lower(target_email) <> lower(trim(p_email)) then raise exception 'Email konfirmasi tidak cocok.' using errcode = '22023'; end if;
  if target_role = 'owner' and actor_role <> 'owner' then raise exception 'Hanya owner yang dapat menghapus akun owner.' using errcode = '42501'; end if;
  insert into public.admin_audit_logs(actor_user_id, actor_role, action, target_user_id, reason, result)
  values(actor, actor_role, 'user.delete', p_user_id, trim(p_reason), 'success');
  delete from auth.users where id = p_user_id;
end;
$$;
revoke all on function public.admin_delete_user(uuid, text, text) from public, anon;
grant execute on function public.admin_delete_user(uuid, text, text) to authenticated;

create or replace function public.admin_update_announcement(p_announcement text, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid(); actor_role text := public.admin_get_my_role(); saved text;
begin
  if actor_role is null or actor_role not in ('admin', 'owner') then raise exception 'Akses tulis admin diperlukan.' using errcode = '42501'; end if;
  if p_announcement is not null and char_length(p_announcement) > 1000 then raise exception 'Pengumuman terlalu panjang.' using errcode = '22023'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 1 and 500 then raise exception 'Alasan wajib diisi.' using errcode = '22023'; end if;
  insert into public.app_settings(id, announcement, updated_by, updated_at) values(true, nullif(trim(p_announcement), ''), actor, now())
  on conflict(id) do update set announcement = excluded.announcement, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  insert into public.admin_audit_logs(actor_user_id, actor_role, action, reason, result, details)
  values(actor, actor_role, 'settings.announcement.update', trim(p_reason), 'success', jsonb_build_object('announcementSet', nullif(trim(p_announcement), '') is not null));
  select announcement into saved from public.app_settings where id = true;
  return saved;
end;
$$;
revoke all on function public.admin_update_announcement(text, text) from public, anon;
grant execute on function public.admin_update_announcement(text, text) to authenticated;

create or replace function public.admin_update_maintenance(p_enabled boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid(); actor_role text := public.admin_get_my_role();
begin
  if actor_role not in ('admin', 'owner') then raise exception 'Akses tulis admin diperlukan.' using errcode = '42501'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 1 and 500 then raise exception 'Alasan wajib diisi.' using errcode = '22023'; end if;
  insert into public.app_settings(id, maintenance_mode, updated_by, updated_at) values(true, p_enabled, actor, now())
  on conflict(id) do update set maintenance_mode = excluded.maintenance_mode, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  insert into public.admin_audit_logs(actor_user_id, actor_role, action, reason, result, details)
  values(actor, actor_role, 'settings.maintenance.update', trim(p_reason), 'success', jsonb_build_object('enabled', p_enabled));
end;
$$;
revoke all on function public.admin_update_maintenance(boolean, text) from public, anon;
grant execute on function public.admin_update_maintenance(boolean, text) to authenticated;
