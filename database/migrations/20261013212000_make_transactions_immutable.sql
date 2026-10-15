-- Cegah perubahan pada data inti transaksi setelah transaksi dibuat.
create or replace function public.prevent_transaction_core_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.amount is distinct from old.amount
    or new.type is distinct from old.type
    or new.date is distinct from old.date
    or new.category is distinct from old.category
    or new.description is distinct from old.description
  then
    raise exception using
      errcode = '23514',
      message = 'Transaksi bersifat final. Hapus transaksi dan input ulang untuk mengubah datanya.';
  end if;

  return new;
end;
$$;

-- Pasang ulang trigger secara idempotent; pembaruan receipt_* tetap diizinkan.
drop trigger if exists transactions_prevent_core_update on public.transactions;
create trigger transactions_prevent_core_update
before update on public.transactions
for each row execute function public.prevent_transaction_core_update();
