-- Supabase Auth owns credentials and password hashing. This table contains
-- only the application's user profile and initial balance.
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  email text not null unique check (email = lower(email)),
  initial_balance numeric(14, 0) not null default 0 check (initial_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  date date not null,
  amount numeric(14, 0) not null check (amount > 0),
  description text not null check (char_length(trim(description)) between 1 and 200),
  type text not null check (type in ('income', 'expense')),
  category text not null default 'Lainnya' check (char_length(trim(category)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

create or replace function public.create_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
begin
  profile_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    case
      when char_length(split_part(new.email, '@', 1)) >= 2 then split_part(new.email, '@', 1)
      else 'Pengguna'
    end
  );

  insert into public.users (id, name, email)
  values (new.id, left(profile_name, 100), lower(new.email));

  return new;
end;
$$;

create trigger auth_user_created_profile
after insert on auth.users
for each row execute function public.create_user_profile();

alter table public.users enable row level security;
alter table public.transactions enable row level security;

create policy "users can read own profile"
on public.users for select to authenticated
using ((select auth.uid()) = id);

create policy "users can update own profile"
on public.users for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "users can read own transactions"
on public.transactions for select to authenticated
using ((select auth.uid()) = user_id);

create policy "users can insert own transactions"
on public.transactions for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "users can update own transactions"
on public.transactions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "users can delete own transactions"
on public.transactions for delete to authenticated
using ((select auth.uid()) = user_id);

grant select on public.users to authenticated;
grant update (name, initial_balance) on public.users to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;

create or replace function public.dashboard_summary()
returns table (
  initial_balance numeric,
  total_income numeric,
  total_expense numeric,
  transaction_count bigint,
  income_count bigint,
  expense_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    u.initial_balance,
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0),
    count(t.id),
    count(t.id) filter (where t.type = 'income'),
    count(t.id) filter (where t.type = 'expense')
  from public.users as u
  left join public.transactions as t on t.user_id = u.id
  where u.id = (select auth.uid())
  group by u.initial_balance;
$$;

revoke all on function public.dashboard_summary() from public, anon;
grant execute on function public.dashboard_summary() to authenticated;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = (select auth.uid());
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- connect-pg-simple stores only opaque server-side session records here.
create table if not exists public.sessions (
  sid varchar not null primary key,
  sess json not null,
  expire timestamp(6) not null
);

create index if not exists sessions_expire_idx on public.sessions (expire);
alter table public.sessions enable row level security;
revoke all on public.sessions from public, anon, authenticated, service_role;