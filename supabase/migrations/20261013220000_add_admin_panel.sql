-- Tahap 1 panel admin CatatUang.
-- Jalankan manual melalui Supabase Dashboard -> SQL Editor -> New query.

-- Status disimpan pada profil aplikasi; RLS pengguna tetap membatasi profilnya
-- sendiri, sementara perubahan lintas akun hanya dilakukan backend tepercaya.
alter table public.users
  add column if not exists account_status text not null default 'active',
  add column if not exists disabled_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_account_status_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_account_status_check
      check (
        (account_status = 'active' and disabled_reason is null)
        or (account_status = 'disabled' and disabled_reason is not null
          and char_length(trim(disabled_reason)) between 1 and 500)
      );
  end if;
end;
$$;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'support', 'owner')),
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_role text not null check (actor_role in ('admin', 'support', 'owner')),
  action text not null check (char_length(trim(action)) between 1 and 100),
  target_user_id uuid,
  reason text check (reason is null or char_length(reason) <= 500),
  result text not null check (result in ('pending', 'success', 'denied')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_logs_actor_user_id_idx
  on public.admin_audit_logs (actor_user_id, created_at desc);

create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  announcement text check (announcement is null or char_length(announcement) <= 1000),
  maintenance_mode boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.admin_users enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.app_settings enable row level security;

-- Tidak ada policy untuk klien anon/authenticated: akses tabel baru hanya dari
-- backend yang memakai service-role key di server.
revoke all on public.admin_users from public, anon, authenticated;
revoke all on public.admin_audit_logs from public, anon, authenticated;
revoke all on public.app_settings from public, anon, authenticated;
grant select (id, name, email, created_at, account_status, disabled_reason)
  on public.users to service_role;
grant update (account_status, disabled_reason)
  on public.users to service_role;
grant select, insert, update, delete on public.admin_users to service_role;
grant select, insert, update, delete on public.admin_audit_logs to service_role;
grant select, insert, update, delete on public.app_settings to service_role;
grant usage, select on sequence public.admin_audit_logs_id_seq to service_role;

create or replace function public.admin_get_overview()
returns table (
  total_accounts bigint,
  new_accounts_30d bigint,
  active_accounts bigint,
  disabled_accounts bigint,
  total_transactions bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.admin_users as admins
    where admins.user_id = (select auth.uid())
  ) then
    raise exception 'Akses admin diperlukan.' using errcode = '42501';
  end if;

  return query
  select
    (select count(*) from public.users),
    (select count(*) from public.users where created_at >= now() - interval '30 days'),
    (select count(*) from public.users where account_status = 'active'),
    (select count(*) from public.users where account_status = 'disabled'),
    (select count(*) from public.transactions);
end;
$$;

revoke all on function public.admin_get_overview() from public, anon;
grant execute on function public.admin_get_overview() to authenticated;

-- Tetapkan admin pertama secara manual setelah akun tersebut dibuat di aplikasi.
-- Ganti alamat email contoh, lalu jalankan bagian berikut di SQL Editor:
-- insert into public.admin_users (user_id, role)
-- select id, 'owner' from auth.users where lower(email) = lower('owner@example.com')
-- on conflict (user_id) do update set role = excluded.role;
