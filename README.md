# CatatUang

CatatUang adalah aplikasi web pencatatan keuangan pribadi. Pengguna dapat menyimpan pemasukan dan pengeluaran, melihat ringkasan saldo, serta mengelola akun. Spesifikasi ini dirangkum dari source code, konfigurasi, migrasi SQL, dan test di repository ini; bukan klaim bahwa deployment production atau database remote sudah diperiksa.

## Status fitur

Status berarti implementasi yang ditemukan di repository, bukan jaminan seluruh konfigurasi layanan production sudah tersedia.

| Fitur | Status | Catatan berdasarkan kode |
| --- | --- | --- |
| Registrasi, login, logout, pemulihan dan reset password | Sudah diimplementasikan | Kredensial ditangani Supabase Auth; pemulihan password memakai email Supabase. Email/SMTP production harus dikonfigurasi di Supabase. |
| Session pengguna | Sudah diimplementasikan | Cookie `catatuang.sid`; record session dan token disimpan di PostgreSQL melalui `connect-pg-simple`. |
| Dashboard saldo dan ringkasan | Sudah diimplementasikan | Saldo awal, pemasukan, pengeluaran, hitungan transaksi. |
| Tambah pemasukan dan pengeluaran | Sudah diimplementasikan | Data transaksi disimpan melalui Supabase API. |
| Kategori transaksi | Sudah diimplementasikan | Kategori dibatasi dan divalidasi di backend. |
| Cari, filter, pagination, dan detail transaksi | Sudah diimplementasikan | Parameter query didukung oleh endpoint transaksi. |
| Ubah/hapus transaksi | Sebagian | Data inti transaksi tidak dapat diedit setelah dibuat; hapus lalu buat ulang. Metadata bukti dapat diperbarui. Penghapusan tersedia. |
| Foto bukti transaksi | Sebagian | Implementasi ada, tetapi migrasi receipt dan bucket Storage harus diterapkan agar fitur siap digunakan. |
| Ekspor laporan transaksi | Sudah diimplementasikan | Ekspor CSV oleh UI; endpoint admin juga menyediakan CSV metrik agregat. |
| Anggaran kategori, target tabungan, pengeluaran 6 bulan | Sebagian | Alat UI tersedia. Anggaran, target dan data jadwal disimpan di `localStorage`, bukan sebagai tabel sinkronisasi server. |
| Transaksi rutin dan pengingat | Sebagian | Ada UI/penjadwalan lokal. Tidak ditemukan worker/server scheduler yang otomatis membuat transaksi rutin atau mengirim push/email reminder. |
| Input transaksi dengan bahasa alami | Sebagian | Parser Gemini opsional dengan fallback lokal; route ini tersedia di Express app, tetapi tidak dipasang oleh adaptor Cloudflare Worker yang ada. |
| Pengaturan profil dan saldo awal | Sudah diimplementasikan | Nama dan saldo awal dapat diperbarui. |
| Ubah password dan hapus akun | Sudah diimplementasikan | Menggunakan Supabase Auth/RPC dan mengakhiri session. |
| Panel admin | Sebagian | API/UI ada. Penggunaan memerlukan migrasi admin, pemberian role, dan `SUPABASE_SERVICE_ROLE_KEY`; keberadaan konfigurasi di repository tidak membuktikan admin sudah disiapkan di production. |
| Pengumuman dan mode pemeliharaan | Sebagian | Dikelola panel admin dan endpoint status publik. Tampilan status di aplikasi ada; konfigurasi database/role tetap diperlukan. |
| Retensi otomatis transaksi lama | Sebagian | Vercel Cron dikonfigurasi harian; butuh `CRON_SECRET`, service-role key, migrasi admin/monitoring, dan konfigurasi deployment. |
| Aplikasi native/mobile, pembayaran, sinkronisasi multi-device untuk alat `localStorage` | Belum ada / tidak ditemukan | Tidak ditemukan implementasi dalam repository yang diperiksa. |

## Teknologi

Versi di bawah adalah rentang versi yang tercantum dalam `package.json`, bukan versi yang dipastikan sedang aktif di Vercel.

| Lapisan | Teknologi |
| --- | --- |
| Bahasa | TypeScript `^7.0.2`, JavaScript ESM |
| Frontend | React `^19.0.1`, React Router `^7.18.4`, Vite `^8.3.0`, Tailwind CSS `^4.3.3`, `@tailwindcss/vite` `^4.3.3`, `@vitejs/plugin-react` `^6.1.1`, Lucide React `^0.546.0` |
| Backend | Node.js, Express `^4.21.2`, `express-session` `^1.19.0`, `express-rate-limit` `^8.7.0`, Zod `^4.6.5` |
| Authentication/API data | Supabase Auth dan Supabase JS `^2.117.2` |
| PostgreSQL/session store | `pg` `^8.23.0`, `connect-pg-simple` `^10.0.0` |
| AI opsional | Google GenAI SDK `^2.4.0` |
| Konfigurasi lokal | `dotenv` `^17.2.3` |
| Tooling lokal/build | `tsx` `^4.21.0`, TypeScript; Wrangler `^4.151.1` untuk konfigurasi Cloudflare yang juga ada |
| Database/ORM | PostgreSQL di Supabase; tidak ditemukan ORM. Data aplikasi diakses melalui Supabase JS, dan PostgreSQL `pg` digunakan langsung untuk session store. |
| Email | Tidak ditemukan library email khusus. Email verifikasi/pemulihan diminta melalui Supabase Auth; pengiriman aktual bergantung pada pengaturan email/SMTP project Supabase. |

Paket build dan frontend yang hanya diperlukan untuk build berada di `devDependencies`. Backend production memerlukan dependency dari `dependencies`.

## Struktur repository

```text
.
├── api/
│   └── index.ts                 # adaptor Vercel Function untuk jalur /api/*
├── database/
│   └── migrations/              # skema awal, receipt, immutable transaction, session store
├── server/
│   ├── app.ts                   # Express app, route AI, middleware, API router
│   ├── api.ts                   # endpoint API, autentikasi, session dan query
│   └── logging.ts               # logger backend yang menyamarkan secret
├── src/
│   ├── auth/                    # provider autentikasi frontend
│   ├── components/              # UI dashboard, transaksi, auth dan alat keuangan
│   ├── pages/                   # halaman admin, password reset, pengaturan
│   ├── services/                # pemanggilan API dan layanan AI frontend
│   ├── server/                  # test API backend
│   ├── types/                   # tipe data keuangan
│   ├── utils/                   # validasi, format, kalkulasi, ekspor dan tests
│   ├── App.tsx                  # route dan susunan aplikasi
│   └── main.tsx                 # entry React
├── supabase/
│   └── migrations/              # migrasi panel admin dan monitoring
├── worker/
│   └── index.ts                 # adaptor Express untuk Cloudflare Worker
├── .env.example                 # contoh nama variabel; tanpa credential
├── index.html                   # shell HTML Vite
├── package.json                 # dependencies dan scripts
├── server.ts                    # entry server lokal/Express
├── vercel.json                  # build, rewrites, dan scheduled cron Vercel
├── vite.config.ts               # konfigurasi Vite
├── wrangler.jsonc               # konfigurasi Cloudflare
└── tsconfig.json                # konfigurasi TypeScript
```

Folder `node_modules/` dan `dist/` adalah hasil instalasi/build, bukan source aplikasi. Ada migrasi di dua lokasi: `database/migrations/` untuk skema aplikasi/session/receipt dan `supabase/migrations/` untuk panel admin/monitoring.

## Arsitektur dan autentikasi

```mermaid
flowchart LR
  Browser[React SPA / Vite build] -->|/api/* + cookie| VercelRewrite[Vercel rewrite]
  VercelRewrite --> Function[api/index.ts]
  Function --> Express[server/app.ts]
  Express --> Router[server/api.ts]
  Router -->|Auth, profile, transactions, Storage| Supabase[Supabase]
  Router -->|session records| Pg[(PostgreSQL session-mode pooler)]
  Express -->|optional AI parsing| Gemini[Google GenAI]
  Vercel -->|scheduled request| Cron[GET /api/cron/purge-old-transactions]
```

1. Vite membangun frontend statis ke `dist/`. Vercel menyajikan file tersebut; API diarahkan melalui rewrite ke `api/index.ts`.
2. `api/index.ts` mengubah path hasil rewrite kembali menjadi `/api/<path>` dan memuat `server/app.js`. Import ESM lokal menggunakan ekstensi `.js` sesuai output/runtime NodeNext TypeScript.
3. Express memasang middleware dan `createApiRouter()` dari `server/api.ts`. Route AI berada di `server/app.ts`.
4. Supabase Auth memverifikasi kredensial dan mengelola password serta JWT. Backend menggunakan Supabase client dengan token pengguna untuk operasi data yang dibatasi RLS.
5. Token access/refresh disimpan dalam session server-side PostgreSQL, bukan `localStorage` browser. Browser hanya menerima cookie `catatuang.sid` dengan `HttpOnly`, `SameSite=Lax`, `Path=/`, dan `Secure` di production. Session pengguna berumur rolling hingga 30 hari; session admin 30 menit.
6. Data transaksi dan profil berada di Supabase PostgreSQL melalui Supabase API. Library `pg` langsung dipakai untuk tabel session Express, bukan untuk query transaksi.
7. Semua method selain GET/HEAD/OPTIONS mendapat pemeriksaan Origin/Referer terhadap `APP_URL` sebagai perlindungan CSRF, dengan pengecualian terbatas untuk beberapa permintaan admin yang ditangani tanpa sesi.

Vite tidak diperlukan oleh Function API production. Import dinamis Vite hanya ada pada cabang server development di `server.ts`; server production/Vercel menggunakan static build.

## API

Semua endpoint di bawah adalah path publik lengkap. Route API dipasang di bawah `/api`. `Cookie` dikirim otomatis oleh browser untuk sesi yang ada. Request JSON membutuhkan `Content-Type: application/json`; mutasi juga harus berasal dari origin aplikasi yang benar.

### Auth, profil, dan transaksi

| Method dan path | Login | Fungsi/request utama | Respons sukses |
| --- | --- | --- | --- |
| `POST /api/auth/register` | Tidak | `{ "name": "Nama", "email": "user@example.com", "password": "...", "confirmPassword": "..." }` | `201 { "needsEmailConfirmation": true/false, "user": ... }` |
| `POST /api/auth/password/forgot` | Tidak | `{ "email": "user@example.com" }` | `202` pesan generik untuk menghindari pengungkapan keberadaan akun |
| `POST /api/auth/password/reset` | Token recovery | `{ "accessToken": "...", "refreshToken": "...", "newPassword": "...", "confirmPassword": "..." }` | `204`; token recovery dibatasi umur oleh aplikasi |
| `POST /api/auth/login` | Tidak | `{ "email": "user@example.com", "password": "..." }` | `{ "user": ... }` dan cookie session |
| `POST /api/auth/logout` | Tidak diwajibkan | Tidak ada body | `204`; session lokal dihancurkan dan cookie dihapus |
| `GET /api/auth/session` | Cookie opsional | Tidak ada body | `{ "user": null }` atau `{ "user": ... }` |
| `GET /api/dashboard-summary` | Ya | Ringkasan akun | `{ "initialBalance": 0, "totalIncome": 0, "totalExpense": 0, "transactionCount": 0, "incomeCount": 0, "expenseCount": 0 }` |
| `GET /api/transactions` | Ya | Filter pencarian, tipe, kategori, tanggal dan pagination | `{ "transactions": [...], "total": 0, "page": 1, "pageSize": ... }` |
| `GET /api/transactions/:id` | Ya | Detail milik pengguna | `{ "transaction": ... }` |
| `POST /api/transactions` | Ya | `{ "date": "YYYY-MM-DD", "amount": 10000, "description": "...", "type": "expense", "category": "Makanan" }` | `201 { "transaction": ... }` |
| `PATCH /api/transactions/:id` | Ya | Update metadata receipt yang didukung | `{ "transaction": ... }`; perubahan nilai inti transaksi ditolak |
| `POST /api/transactions/:id/receipt` | Ya | Upload JPG/PNG/WEBP, maksimum 5 MiB | `201` metadata receipt |
| `GET /api/transactions/:id/receipt-url` | Ya | Minta URL bukti untuk transaksi milik pengguna | Signed URL sementara (1 jam) |
| `DELETE /api/transactions/:id` | Ya | Hapus transaksi milik pengguna dan bukti terkait | `204` |
| `PATCH /api/profile` | Ya | `{ "name": "Nama baru" }` | `{ "user": ... }` |
| `PATCH /api/profile/balance` | Ya | `{ "initialBalance": 100000 }` | `204` |
| `PATCH /api/password` | Ya | Password saat ini, password baru, konfirmasi | `204`; verifikasi password lama dan pencabutan sesi |
| `DELETE /api/account` | Ya | Tidak ada body | `204`; hapus akun melalui RPC Supabase dan akhiri sesi |
| `POST /api/ai/parse-transaction` | Tidak | `{ "input": "makan siang 25 ribu" }` | `{ "success": true, "source": "gemini" atau "fallback", "data": ... }` |

Error API umumnya dikirim sebagai `{ "error": "..." }`. Status aktual bergantung validasi, autentikasi, ketersediaan konfigurasi, dan layanan eksternal.

### Status publik, cron, dan admin

| Method dan path | Login | Fungsi/request utama | Respons/hasil |
| --- | --- | --- | --- |
| `GET /api/public/service-status` | Tidak | Mengambil pengumuman dan maintenance mode | `{ "announcement": ..., "maintenanceMode": ... }`; service-role key diperlukan di server |
| `GET /api/cron/purge-old-transactions` | Header `Authorization: Bearer <CRON_SECRET>`; service-role key juga diperlukan | Hapus maksimal 100 transaksi melewati cutoff retensi dua bulan beserta receipt | `{ "deleted": ..., "cutoffDate": "...", "morePending": ... }` |
| `POST /api/admin/auth/login` | Kredensial admin | `{ "email": "...", "password": "..." }` | `{ "user": ..., "role": ... }` dan session admin |
| `POST /api/admin/login-check` | Admin | Cek session dan role | `{ "authenticated": true, "role": ... }` |
| `GET /api/admin/overview` | Admin | Metrik akun dan transaksi | Ringkasan agregat |
| `GET /api/admin/account-growth` | Admin | Pertumbuhan akun | `{ "points": [{ "day": "...", "accounts": 0 }] }` |
| `GET /api/admin/activity?period=30` | Admin | Aktivitas 7–365 hari | Metrik aktivitas |
| `GET /api/admin/retention` | Admin | Metrik retensi dan error operasional | Ringkasan retensi |
| `GET /api/admin/storage-usage` | Admin | Penggunaan Storage | `{ "objectCount": 0, "totalBytes": 0 }` |
| `GET /api/admin/health` | Admin | Pemeriksaan API, database, Auth, Storage | Status `ok` atau `degraded` |
| `GET /api/admin/users` | Admin | Cari/filter/status/tanggal/sort dan pagination akun | `{ "users": [...], "total": 0, "page": 1, ... }` |
| `POST /api/admin/users/:id/disable` | Admin; hak tulis sesuai role | `{ "reason": "..." }` | `204`; perubahan dicatat di audit |
| `POST /api/admin/users/:id/enable` | Admin; hak tulis sesuai role | `{ "reason": "..." }` | `204`; perubahan dicatat di audit |
| `DELETE /api/admin/users/:id` | Admin; hak tulis sesuai role | `{ "email": "...", "reason": "..." }` | `204`; email harus cocok, akun sendiri tidak dapat dihapus |
| `GET /api/admin/audit-logs` | Admin | Filter dan pagination | `{ "logs": [...], "total": 0, "page": 1, "pageSize": ... }` |
| `GET /api/admin/settings` | Admin | Ambil pengumuman dan maintenance | `{ "announcement": ..., "maintenanceMode": ..., "updatedAt": ... }` |
| `PATCH /api/admin/settings/announcement` | Admin; hak tulis sesuai role | `{ "announcement": "...", "reason": "..." }` | `{ "announcement": ... }` |
| `PATCH /api/admin/settings/maintenance` | Admin; hak tulis sesuai role | `{ "enabled": true, "reason": "..." }` | `{ "enabled": true }` |
| `GET /api/admin/export/metrics?period=30` | Admin | Ekspor metrik agregat untuk periode 7–365 hari | CSV |

Peran `support` tidak diberi hak untuk beberapa operasi tulis; kebijakan per operasi diterapkan oleh middleware/backend. Detail validasi dan field response dapat dilihat pada implementasi route di `server/api.ts`.

Contoh login:

```http
POST /api/auth/login
Content-Type: application/json
Origin: https://app.example

{"email":"user@example.com","password":"<password>"}
```

Contoh respons sukses (field profil dapat mengikuti implementasi):

```http
HTTP/1.1 200 OK
Set-Cookie: catatuang.sid=...; HttpOnly; Secure; SameSite=Lax; Path=/
Content-Type: application/json

{"user":{"id":"<uuid>","name":"Nama","email":"user@example.com"}}
```

Memeriksa session tidak memerlukan body. Tanpa cookie atau session yang valid, API mengembalikan `{ "user": null }`:

```http
GET /api/auth/session
```

```json
{"user":null}
```

Permintaan email pemulihan menggunakan respons generik:

```http
POST /api/auth/password/forgot
Content-Type: application/json
Origin: https://app.example

{"email":"user@example.com"}
```

```json
{"message":"Jika email terdaftar, tautan pemulihan akan segera dikirim."}
```

## Skema database

Skema berikut dirangkum dari SQL migrations yang ada. Tabel platform `auth.users` dan `storage.objects` dikelola Supabase, bukan dibuat aplikasi. Tipe yang ditulis adalah tipe PostgreSQL.

| Tabel | Kolom utama | Relasi/keterangan |
| --- | --- | --- |
| `public.users` | `id uuid` PK; `name text`; `email text` unik/lowercase; `initial_balance numeric(14,0)`; `created_at`, `updated_at timestamptz`; migrasi admin menambah `account_status text` dan `disabled_reason text` | `id` → `auth.users(id)` `ON DELETE CASCADE`; trigger membuat profil saat akun Auth dibuat |
| `public.transactions` | `id uuid` PK; `user_id uuid`; `date date`; `amount numeric(14,0)`; `description text`; `type text`; `category text`; `created_at`, `updated_at timestamptz`; migrasi receipt menambah `receipt_path text`, `receipt_mime text`, `receipt_size integer` | `user_id` → `public.users(id)` `ON DELETE CASCADE`; `type` hanya income/expense; RLS berdasarkan pemilik |
| `public.catatuang_express_sessions` | `sid varchar` PK; `sess json`; `expire timestamp(6)` | Tabel session yang dipakai Express, tidak memiliki FK aplikasi; akses dibatasi server |
| `public.sessions` | `sid varchar` PK; `sess json`; `expire timestamp(6)` | Tabel lama dari baseline migration; kode Express saat ini memakai tabel khusus `catatuang_express_sessions` |
| `public.admin_users` | `user_id uuid` PK; `role text`; `created_at timestamptz` | `user_id` → `auth.users(id)` `ON DELETE CASCADE`; role dibatasi `admin`, `support`, `owner` |
| `public.admin_audit_logs` | `id bigint` identity PK; `actor_user_id uuid`; `actor_role text`; `action text`; `target_user_id uuid`; `reason text`; `result text`; `details jsonb`; `created_at timestamptz` | actor → `auth.users(id)` `ON DELETE SET NULL`; target tidak memiliki FK pada migrasi |
| `public.app_settings` | `id boolean` PK; `announcement text`; `maintenance_mode boolean`; `updated_by uuid`; `updated_at timestamptz` | `updated_by` → `auth.users(id)` `ON DELETE SET NULL`; row singleton memakai `id=true` |
| `public.admin_service_errors` | `id bigint` identity PK; `service text`; `route text`; `status_code integer`; `created_at timestamptz` | Telemetri terbatas untuk admin; tidak berisi deskripsi/jumlah transaksi |
| `public.admin_retention_runs` | `id bigint` identity PK; `deleted_count integer`; `cutoff_date date`; `created_at timestamptz` | Ringkasan job retensi |

Kategori tidak dibuat sebagai tabel terpisah; definisi kategori berada di source frontend/backend. Anggaran/target lokal juga tidak memiliki tabel migrasi yang ditemukan. Tidak ditemukan schema ORM.

### Migrasi

File migrasi yang ada:

- `database/migrations/001_finance_auth.sql` — tabel profil/transaksi, trigger profil, RLS/policy, fungsi ringkasan dan hapus akun, tabel session lama.
- `database/migrations/20261015113000_add_express_session_store.sql` — tabel session yang digunakan Express.
- `database/migrations/20261013210100_add_transaction_receipts.sql` — metadata receipt, bucket privat, dan policy Storage.
- `database/migrations/20261013212000_make_transactions_immutable.sql` — trigger yang menolak perubahan data inti transaksi.
- `supabase/migrations/20261013220000_add_admin_panel.sql` — kolom status akun dan tabel/fungsi admin awal.
- `supabase/migrations/20261013230000_restrict_user_status_updates.sql` dan `20261014060000_add_admin_dashboard_aggregates.sql` — hardening dan agregat admin.
- `supabase/migrations/20261016120000_admin_activity_monitoring.sql` — telemetri error dan retensi.

Periksa keadaan database target sebelum menjalankan migrasi. Baseline tidak boleh dijalankan ulang pada database yang telah berisi aplikasi/data tanpa penilaian migrasi terlebih dahulu. Untuk database baru, jalankan baseline sekali, kemudian session-store migration; migrasi receipt/admin sesuai fitur yang akan dipakai. Tidak ditemukan kebutuhan seed transaksi/pengguna: profil dibuat oleh trigger Supabase Auth, dan row awal `app_settings` dibuat oleh migrasi admin.

## Environment variables

`.env.example` menyediakan nama variabel tanpa credential asli. Isi rahasia lokal di `.env.local` atau `.env`, dan masukkan nilai server-side di Vercel Project Settings → Environment Variables. Jangan memakai prefix `VITE_` untuk rahasia server.

| Nama | Wajib | Format/contoh non-rahasia |
| --- | --- | --- |
| `SUPABASE_URL` | Ya untuk API | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | Ya untuk API | `<Supabase publishable/anon key>` |
| `DATABASE_URL` | Ya untuk API/session store | `postgresql://<user>:<encoded-password>@<session-pooler-host>:5432/<database>?sslmode=require` |
| `AUTH_SECRET` | Ya | Random string minimal 32 karakter; generate lokal menggunakan `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `APP_URL` | Ya | Origin root, mis. `https://<app-domain>`; HTTPS wajib di production |
| `SUPABASE_SERVICE_ROLE_KEY` | Fitur admin/status/cron | `<service-role key>`; server-only |
| `CRON_SECRET` | Endpoint cron | `<random bearer secret>`; server-only |
| `GEMINI_API_KEY` | Opsional | `<Google GenAI API key>` |
| `TRUST_PROXY_HOPS` | Opsional | Bilangan 1–5 hanya bila jumlah proxy dipercaya diketahui |
| `PORT` | Opsional lokal | `3000` bila kosong |
| `NODE_ENV`, `VERCEL`, `VERCEL_ENV` | Runtime | Disediakan/dipilih oleh process/deployment platform; menentukan mode production |
| `DISABLE_HMR` | Opsional dev | `true` menonaktifkan HMR dan watch Vite |
| `HYPERDRIVE.connectionString` | Worker Cloudflare saja | Binding Cloudflare Hyperdrive; lihat `wrangler.jsonc` dan `worker/index.ts` |

`DATABASE_URL` yang dipakai oleh kode production harus memiliki `sslmode=require`, `verify-ca`, atau `verify-full`. Untuk Vercel, gunakan Supabase session-mode pooler; kode tidak mendukung pilihan URL transaction-mode pooler sebagai substitusi session pooler.

## Menjalankan lokal

### Prasyarat

- Node.js `20.19+` atau `22.12+` (sesuai dokumentasi/prasyarat repository dan kompatibilitas tooling).
- npm.
- Project Supabase dengan Auth email/password dan PostgreSQL.
- Akses PostgreSQL untuk session store.

### Setup

```powershell
Copy-Item .env.example .env.local
# Isi hanya variabel lokal yang diperlukan di .env.local
npm install
```

Untuk database baru, terapkan migrasi baseline dan session store seperti dijelaskan pada [bagian migrasi](#migrasi). Untuk project/database yang sudah dipakai, inspeksi tabel dan migration history terlebih dahulu; jangan mengulang baseline secara membabi buta. Tidak ada perintah seed package script yang ditemukan.

### Scripts `package.json`

| Script | Fungsi |
| --- | --- |
| `npm run dev` | Menjalankan `tsx server.ts`; server memakai Vite middleware saat development |
| `npm run dev:open` | Windows: menjalankan helper PowerShell dan membuka browser |
| `npm run stop:web` | Menghentikan helper server web Windows |
| `npm run build` | `vite build`, menghasilkan frontend statis di `dist/` |
| `npm start` | `tsx server.ts`; untuk mode production, set `NODE_ENV=production` dan build frontend lebih dulu |
| `npm run preview` | Menjalankan Vite preview |
| `npm run lint` | `tsc --noEmit` |
| `npm test` | Menjalankan test finance dan API melalui `tsx --test` |
| `npm run cloudflare:dev` | Build lalu `wrangler dev` |
| `npm run cloudflare:deploy` | Build lalu `wrangler deploy` |
| `npm run clean` | Menghapus `dist` dan `server.js` jika ada |

Jalankan `npm run dev` lalu buka `http://localhost:3000`. Untuk helper browser otomatis pada Windows: `npm run dev:open`; hentikan dengan `npm run stop:web`.

## Deploy ke Vercel

`vercel.json` saat ini menetapkan:

- Build command: `npm run build`
- Output directory: `dist`
- Rewrite `/api/:path*` ke `/api/index?__api_path=:path*`
- Fallback path selain API ke `/index.html` untuk React SPA
- Cron harian `GET /api/cron/purge-old-transactions` dengan jadwal `0 0 * * *`

Environment Production minimum untuk menginisialisasi backend: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `AUTH_SECRET`, `APP_URL`. Set `CRON_SECRET` serta `SUPABASE_SERVICE_ROLE_KEY` untuk job cleanup; service-role key juga diperlukan endpoint admin/status tertentu. `GEMINI_API_KEY` opsional.

Catatan:

- Pastikan dev dependencies tersedia selama build Vercel karena `vite build` dan plugin Vite berada di `devDependencies`. Jangan konfigurasi install production-only sebelum proses build.
- API Function tidak boleh mengimpor Vite. Vite hanya tooling frontend/build dan middleware server lokal.
- Import relatif ESM TypeScript di backend menggunakan ekstensi `.js` untuk kompatibilitas NodeNext runtime.
- Gunakan PostgreSQL session-mode pooler dengan TLS; pool production dibatasi agar jumlah koneksi per Function instance tidak berlebihan.
- Jika ada error `503`, periksa Vercel Runtime Logs. `API router initialization failed` mengindikasikan konfigurasi router/environment; `Vercel API app initialization failed` menandakan error saat memuat Express app atau dependensinya. Logger menyamarkan nilai variabel rahasia.
- Riwayat project yang diberikan menyebut `ERR_UNSUPPORTED_DIR_IMPORT` dan error native Rolldown binding. Itu adalah riwayat laporan pengguna, bukan bukti bahwa deployment terbaru sudah memperbaiki/masih mengalami error tersebut; repository tidak dapat memverifikasi deployment `keuangan-ioq5.vercel.app`.

## Keamanan dan batasan

- Password tidak disimpan oleh aplikasi; Supabase Auth mengelola kredensial/password.
- Session server-side menyimpan token Supabase; browser hanya menerima cookie HttpOnly.
- RLS memisahkan profil/transaksi per pengguna; backend memvalidasi kepemilikan data.
- Zod memvalidasi input; JSON request dibatasi 32 KiB; transaksi memvalidasi tipe, tanggal, jumlah dan kategori.
- Proteksi CSRF membandingkan Origin/Referer dengan `APP_URL` untuk request mutasi.
- Security headers mencakup `X-Content-Type-Options`, `X-Frame-Options`, Referrer Policy, Permissions Policy; production menambah HSTS dan CSP.
- Rate limit diterapkan pada auth, login admin, admin API, dan parsing AI.
- Receipt dibatasi MIME dan ukuran, disimpan di bucket privat dengan policy per UID. Signed URL berlaku sementara.
- Admin/service-role/cron secrets harus server-side dan tidak boleh diekspos ke browser.
- Production database TLS wajib dinyalakan melalui parameter `sslmode`.
- Data inti transaksi dibuat immutable setelah insert; ubah dengan hapus dan input ulang.
- `.env`/`.env.local` tidak boleh di-commit. `.env.example` hanya boleh memuat nama dan contoh non-rahasia.

## Masalah diketahui dan hal yang belum dipastikan

- **503 historis:** deployment pernah dilaporkan mengembalikan 503 untuk `/api/auth/session` dan `/api/auth/login`, dengan error native binding Rolldown di Runtime Logs. Sebab deployment yang sedang berjalan saat ini belum dapat dipastikan dari source lokal saja. Logger dan struktur import backend dapat membantu diagnosis setelah kode benar-benar di-deploy.
- **Konfigurasi production:** isi Environment Variables Vercel, keberadaan migrasi pada database remote, status SMTP Supabase, role admin yang telah diberikan, dan status deployment tidak dapat dipastikan dari repository.
- **Cloudflare:** konfigurasi Worker ada sebagai target tambahan. `wrangler.jsonc` perlu diperiksa dan Hyperdrive ID aktual dikonfigurasi sebelum digunakan; route AI hanya ada di Express app dan belum dipasang di Worker adaptor saat ini.
- **Mismatch test health-check:** implementasi `GET /api/admin/health` mengembalikan `checks.api`, tetapi assertion pada `src/server/api.test.ts` masih mengharapkan hanya `database`, `auth`, dan `storage`. Test admin terkait dapat gagal sampai ekspektasi test diselaraskan dengan kontrak endpoint atau implementasi.
- Tidak ditemukan implementasi backend yang menjalankan transaksi rutin/notification scheduler, dukungan pembayaran, ataupun ORM.
- Tidak ditemukan TODO/FIXME yang secara eksplisit menandai pekerjaan tertunda pada source yang diaudit. “Belum ditemukan” tidak membuktikan fitur tersebut tidak pernah direncanakan di luar repository.

## File dokumentasi

- `README.md` — spesifikasi repository berdasarkan kode, konfigurasi, migrasi, dan test.
- `.env.example` — daftar variabel environment dengan nilai rahasia dikosongkan.

## Perlu dikonfirmasi di luar repository

- Apakah variabel wajib dan rahasia fitur sudah diisi di environment Production Vercel dengan nilai yang sesuai.
- Apakah `DATABASE_URL` production memakai host/credential session-mode pooler yang benar dan SSL dapat tersambung.
- Apakah migrasi yang diperlukan sudah diterapkan pada Supabase project production, khususnya tabel session store.
- Apakah provider email/SMTP Supabase telah disiapkan dan redirect URL mencakup origin aplikasi.
- Apakah `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, dan konfigurasi admin telah disiapkan jika fitur terkait digunakan.
- Apakah deployment terbaru sudah menggunakan commit ini dan apakah error 503 masih muncul di Runtime Logs.
- Apakah konfigurasi Cloudflare/Hyperdrive perlu dipelihara; placeholder deployment tidak dapat diverifikasi dari kode saja.
