-- Keep Express login sessions separate from any existing application table named "sessions".
create table if not exists public.catatuang_express_sessions (
  sid varchar not null primary key,
  sess json not null,
  expire timestamp(6) not null
);

create index if not exists catatuang_express_sessions_expire_idx
  on public.catatuang_express_sessions (expire);

alter table public.catatuang_express_sessions enable row level security;
revoke all on public.catatuang_express_sessions from public;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on public.catatuang_express_sessions from %I', role_name);
    end if;
  end loop;
end;
$$;
