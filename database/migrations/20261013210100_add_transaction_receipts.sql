-- Tambahkan metadata bukti transaksi tanpa mengubah baris transaksi yang sudah ada.
alter table public.transactions
  add column if not exists receipt_path text,
  add column if not exists receipt_mime text,
  add column if not exists receipt_size integer;

-- Buat atau perbarui bucket privat khusus gambar bukti transaksi.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'transaction-receipts',
  'transaction-receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Izinkan pengguna membaca bukti hanya dari folder UID miliknya.
drop policy if exists "users can read own transaction receipts" on storage.objects;
create policy "users can read own transaction receipts"
on storage.objects for select to authenticated
using (
  bucket_id = 'transaction-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Izinkan pengguna menambahkan bukti hanya ke folder UID miliknya.
drop policy if exists "users can upload own transaction receipts" on storage.objects;
create policy "users can upload own transaction receipts"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'transaction-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Batasi perubahan objek bukti pada folder UID pemiliknya.
drop policy if exists "users can update own transaction receipts" on storage.objects;
create policy "users can update own transaction receipts"
on storage.objects for update to authenticated
using (
  bucket_id = 'transaction-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'transaction-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Izinkan pengguna menghapus bukti hanya dari folder UID miliknya.
drop policy if exists "users can delete own transaction receipts" on storage.objects;
create policy "users can delete own transaction receipts"
on storage.objects for delete to authenticated
using (
  bucket_id = 'transaction-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
