# Rekomendasi Fitur Admin CatatUang

Dokumen ini menjelaskan batas akses panel admin CatatUang. Panel UI tersedia di `/admin`, `/admin/users`, `/admin/audit`, dan `/admin/settings`; role admin tetap diverifikasi oleh backend untuk setiap endpoint.

## Menyiapkan Tahap 1

1. Jalankan migrasi berurutan secara manual di **Supabase Dashboard → SQL Editor → New query**: `supabase/migrations/20261013220000_add_admin_panel.sql`, `supabase/migrations/20261013230000_restrict_user_status_updates.sql`, `supabase/migrations/20261014060000_add_admin_dashboard_aggregates.sql`, lalu `supabase/migrations/20261016120000_admin_activity_monitoring.sql`. Tinjau isinya terlebih dahulu. Aplikasi tidak menjalankan migrasi.
2. Buat akun owner melalui halaman pendaftaran aplikasi seperti pengguna biasa.
3. Di SQL Editor, jalankan perintah contoh pada bagian akhir migrasi setelah mengganti `owner@example.com` dengan email akun owner. Perintah itu menetapkan role langsung pada `public.admin_users`; tidak ada endpoint pendaftaran admin.
4. Atur `SUPABASE_SERVICE_ROLE_KEY` pada environment server saja, lalu restart backend. Untuk pengembangan lokal, `server.ts` memuat `.env.local` lebih dahulu lalu `.env`; nilai environment proses yang sudah ada tetap menang. Jangan menaruhnya pada `VITE_*`, frontend, atau source control. Key ini hanya dipakai backend untuk verifikasi role dan administrasi akun; fungsi metrik tetap memverifikasi identitas melalui JWT.
5. Admin masuk melalui halaman terpisah `/admin/login`. Backend memverifikasi kredensial, status akun, dan role sebelum membuat sesi admin. Login pengguna biasa tetap berada di `/login`; akun tanpa role admin ditolak dan sesi pengguna biasa yang tertinggal dibersihkan. Sesi admin berakhir setelah 30 menit tidak aktif.

Migrasi aktivitas admin menambahkan ringkasan pengguna aktif dan transaksi per periode, filter akun menurut status/tanggal daftar, health check API/database/Auth/Storage, serta log error operasional tanpa isi transaksi atau data sensitif. Ekspor CSV hanya berisi metrik agregat. Riwayat retensi menghitung transaksi yang mendekati batas dan mencatat jumlah yang dihapus oleh cron setelah migrasi ini diterapkan; data penghapusan sebelum itu tidak dapat dihitung kembali.

Jika login menampilkan pesan sementara yang generik, periksa log server: server membedakan key server yang belum dikonfigurasi dari tabel/migrasi admin yang belum tersedia tanpa menampilkan rincian tersebut ke browser. Nilai lokal pada `.env.local` atau `.env` tidak disimpan di source control; `.env.local` memiliki prioritas atas `.env`, dan environment proses memiliki prioritas atas keduanya.

Role `admin`, `support`, dan `owner` dapat ditetapkan atau dicabut secara manual melalui SQL Editor. Batasi akses SQL Editor dan service-role key hanya kepada operator tepercaya.

Role `support` hanya dapat membaca overview, status layanan, daftar akun, dan audit log. Role `admin` dan `owner` dapat melakukan perubahan akun, pengumuman, mode pemeliharaan, dan ekspor metrik. Belum ada endpoint untuk mengelola role admin; lakukan itu hanya melalui SQL Editor tepercaya.

Daftar akun hanya memuat nama, email, tanggal pembuatan, status, dan alasan penonaktifan. API admin tidak menyediakan akses untuk membaca/mengubah transaksi, foto bukti, saldo awal, password, atau token. Penonaktifan menolak login baru dan membatalkan penggunaan sesi aplikasi yang ada. Penghapusan akun mensyaratkan email yang cocok dan alasan; admin tidak dapat menonaktifkan atau menghapus akunnya sendiri.

## Tujuan panel admin

Grafik pertumbuhan akun dan total penggunaan storage berasal dari fungsi agregat yang hanya mengembalikan tanggal/jumlah serta hitungan/ukuran total. Fungsi tidak mengembalikan path, nama bucket, metadata per file, atau data transaksi. Informasi pengumuman dan status pemeliharaan yang memang ditujukan ke pengguna tersedia melalui route publik terpisah; route tersebut tidak memberikan akses ke pengaturan lain.

Panel admin sebaiknya membantu pemilik aplikasi menjaga akun dan layanan tetap berjalan, bukan menjadi cara untuk melihat keuangan pribadi pengguna. Admin dapat mengelola akun serta memantau angka agregat layanan, tetapi tidak dapat membaca transaksi atau foto bukti milik pengguna.

## Fitur yang disarankan

### Prioritas 1 — MVP

1. **Dashboard admin**
   - Jumlah akun terdaftar dan akun baru per periode.
   - Jumlah pengguna aktif secara agregat, jika definisi “aktif” sudah ditentukan.
   - Status layanan penting: koneksi database, Supabase Auth, dan Storage.
   - Ringkasan error teknis yang sudah disanitasi; jangan tampilkan isi transaksi atau token.

2. **Manajemen akun**
   - Daftar pengguna dengan pencarian/paginasi dan kolom minimum: nama, email, tanggal pembuatan, serta status akun.
   - Melihat status konfirmasi email atau status nonaktif bila tersedia dari sumber autentikasi.
   - Menonaktifkan dan mengaktifkan kembali akun melalui backend yang terverifikasi.
   - Menghapus akun hanya sebagai tindakan terpisah dengan konfirmasi kuat dan pencatatan audit.
   - Jangan tampilkan saldo awal pengguna pada daftar akun kecuali benar-benar dibutuhkan dan disetujui.

3. **Audit aktivitas admin**
   - Catat siapa melakukan tindakan, tindakan apa, akun target, waktu, hasil, dan alasan.
   - Batasi akses dan retensi catatan audit.
   - Jangan mencatat password, session cookie, access/refresh token, signed URL, isi transaksi, atau gambar.

### Prioritas 2 — Dukungan pengguna

- Alur permintaan bantuan yang menggunakan ID akun/tiket, bukan akses luas ke isi transaksi.
- Status tiket: baru, diproses, menunggu pengguna, selesai.
- Catatan internal admin dengan kebijakan retensi dan pembatasan akses.
- Jika investigasi transaksi benar-benar diperlukan, buat akses terbatas berbasis persetujuan pengguna, alasan, masa berlaku, dan audit. Jangan jadikan akses tersebut permanen untuk semua admin.

### Prioritas 3 — Operasional produk

- Pengelolaan kategori transaksi bawaan atau pengumuman layanan, bila kategori/pengumuman memang akan dibuat dapat dikonfigurasi.
- Ringkasan pemakaian Storage dalam bentuk agregat, tanpa membuka foto bukti.
- Ekspor metrik operasional yang sudah dianonimkan untuk analisis produk.
- Pengaturan rate limit atau status pemeliharaan yang dikelola melalui konfigurasi server dan memiliki audit.

## Hal yang sebaiknya tidak diberikan secara default

- Membaca nominal, tipe, kategori, tanggal, deskripsi, atau foto bukti transaksi pengguna.
- Mengubah atau membuat transaksi atas nama pengguna.
- Mengubah saldo awal pengguna.
- Mengakses password atau token autentikasi.
- Menggunakan tombol “login sebagai pengguna” tanpa persetujuan, alasan, masa berlaku, dan audit yang ketat.
- Mengandalkan tombol/halaman yang disembunyikan di frontend sebagai perlindungan admin.

Karena CatatUang menyimpan informasi keuangan pribadi, akses ke data transaksi individual perlu alasan bisnis dan kebijakan privasi yang jelas. Pilihan paling aman adalah memberi admin data agregat, bukan data per transaksi.

## Role yang mungkin diperlukan

Mulai sesederhana mungkin:

- **Pengguna**: memakai fitur pencatatan untuk akun sendiri.
- **Support** (opsional): melihat status akun dan membantu tiket, tanpa akses ke transaksi pribadi.
- **Admin**: mengelola akun dan pengaturan operasional yang disetujui.
- **Owner/Superadmin** (opsional): memberikan atau mencabut role istimewa dan melakukan tindakan kritis.

Untuk MVP kecil, satu role admin mungkin cukup. Pisahkan role support hanya jika ada petugas dukungan yang tidak seharusnya mengelola konfigurasi atau role lain. Hindari banyak role sebelum kebutuhan aksesnya jelas.

## Persyaratan keamanan sebelum implementasi

1. Simpan role di sumber tepercaya di database atau klaim token yang hanya dapat ditulis oleh server tepercaya. Jangan gunakan `user_metadata`, email tertentu, parameter URL, atau state React sebagai bukti admin.
2. Tentukan cara menetapkan admin pertama secara manual dan aman. Jangan membuat endpoint publik untuk mendaftarkan admin.
3. Periksa role pada setiap endpoint admin di backend setelah sesi diverifikasi. Balas `401` untuk sesi tidak valid dan `403` untuk pengguna biasa.
4. Pertahankan RLS sebagai batas data. Kebijakan saat ini membatasi profil/transaksi ke pemilik; setiap akses lintas pengguna harus dirancang, dibatasi pada kolom yang diperlukan, dan dites.
5. Jangan pernah mengekspos Supabase `service_role` key ke browser. Bila operasi server membutuhkannya, simpan hanya di environment server dan gunakan hanya untuk operasi yang memang memerlukannya.
6. Gunakan MFA untuk akun admin, rate limit, paginasi, konfirmasi untuk tindakan berisiko, serta log audit yang tidak menyimpan rahasia.
7. Uji dengan akun pengguna biasa, support, admin, dan sesi anonim di staging sebelum dirilis.

## Checklist sebelum produksi

1. Tentukan kebutuhan: siapa adminnya, tindakan apa yang boleh dilakukan, dan apakah ada kebutuhan nyata melihat data transaksi.
2. Sepakati kebijakan privasi, retensi audit, serta proses meminta dan mencabut akses admin.
3. Migrasi membuat role dan kebijakan akses baru; tetapkan admin pertama melalui SQL Editor tanpa endpoint pendaftaran publik.
4. Middleware otorisasi dan endpoint backend admin sudah tersedia dengan data minimum.
5. UI admin sudah tersedia; halaman frontend hanya antarmuka, bukan mekanisme keamanan.
6. Tambahkan tes akses positif/negatif, kepemilikan, RLS, audit, serta tindakan penghapusan/penonaktifan.
7. Uji migrasi dan alur akun pada proyek Supabase staging sebelum produksi.

## Pertanyaan produk sebelum mulai membuat fitur

- Admin hanya mengelola akun dan layanan, atau perlu dukungan tiket juga?
- Bolehkah admin melihat data transaksi individual? Jika iya, untuk kasus apa dan dengan persetujuan seperti apa?
- Apakah satu role admin cukup, atau perlu support dan owner/superadmin?
- Apakah akun dinonaktifkan sementara atau dihapus permanen ketika ada masalah?
- Berapa lama tiket dan audit log disimpan?

Pertahankan isolasi data pengguna yang ada. Jangan menambahkan akses admin lintas akun ke transaksi pribadi hanya untuk membuat panel admin tampak berfungsi.
