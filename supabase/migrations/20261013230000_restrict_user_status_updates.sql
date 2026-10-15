-- Batasi perubahan profil pengguna agar status akun hanya dapat diubah backend tepercaya.
-- Migrasi ini aman dijalankan ulang dan mempertahankan kolom yang dibutuhkan pengguna.
revoke update on table public.users from public, anon, authenticated;
revoke update (account_status, disabled_reason) on table public.users from public, anon, authenticated;
grant update (name, initial_balance) on table public.users to authenticated;

-- Pastikan tabel administrasi tetap tidak dapat diakses langsung oleh klien.
revoke all on table public.admin_users from public, anon, authenticated;
revoke all on table public.admin_audit_logs from public, anon, authenticated;
revoke all on table public.app_settings from public, anon, authenticated;
