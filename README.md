# CatatUang

Personal Finance Tracker built with React, Express, Supabase Auth, and PostgreSQL. Passwords are managed and hashed by Supabase Auth. Express keeps access/refresh tokens in PostgreSQL-backed server sessions and exposes only an HttpOnly session cookie to the browser. Database Row Level Security is the final ownership boundary.

## Prerequisites

- Node.js 20.19+ or 22.12+
- A Supabase project with PostgreSQL and Email/Password auth enabled
- PostgreSQL connection access to the Supabase project

## Environment Variables

Copy `.env.example` to `.env` and enter `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DATABASE_URL`, `AUTH_SECRET`, and `APP_URL` locally. `.env` is ignored by Git. The server validates all five required values at startup and reports a missing/invalid variable name without printing its value.

| Variable | Purpose and source |
| --- | --- |
| `SUPABASE_URL` | Supabase Auth/API base URL from **Project Settings → API**. |
| `SUPABASE_ANON_KEY` | Supabase publishable/anon key from **Project Settings → API**. It is used server-side with each user's JWT; no service-role key is required. |
| `DATABASE_URL` | PostgreSQL connection string from **Project Settings → Database → Connection string**. Use direct or session pooler mode, with TLS enabled. `pg` uses it only for the Express session store, not transaction queries. |
| `AUTH_SECRET` | Random Express session-signing secret. Generate locally with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Never commit it or send it in chat. |
| `APP_URL` | The exact app origin used for CSRF validation and email confirmation redirects. Use `http://localhost:3000` locally and the HTTPS origin in production. |
| `CRON_SECRET` | Random, server-only bearer secret required by the Vercel transaction cleanup job. Generate locally with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` and add it to Vercel Production Environment Variables. |

`GEMINI_API_KEY` is optional. The existing smart transaction parser uses Gemini when set and falls back to local parsing when omitted; authentication and database access do not depend on it.

`SUPABASE_SERVICE_ROLE_KEY` is optional for the user application and required for the admin API and scheduled transaction cleanup. Keep it in the server environment; never expose it through a `VITE_*` variable or to the browser. See `README_ADMIN.md` before enabling the admin routes.

### Transaction retention

On Vercel, the daily cron job removes transactions whose transaction date is more than two calendar months old, along with their receipt images. It runs at 00:00 UTC (07:00 WIB). Set a random, server-only `CRON_SECRET` in the Vercel Production environment; the job refuses to run without it. This deletion is permanent. Vercel Cron runs on production deployments only.

If production runs behind a reverse proxy, set `TRUST_PROXY_HOPS` to the exact number of trusted proxies between the internet and this server (1 to 5). Leave it unset when the server is directly internet-facing; this keeps client IP based rate limits from trusting spoofed forwarded headers.

The server rejects common example Supabase URLs and placeholder anon keys at startup, and reports only the invalid variable name. `.env.example` contains no project keys or database credentials; put real local values in `.env.local` (or `.env`). Values already present in the process environment take precedence over both files.

## Configure Supabase

1. In **Authentication → Providers → Email**, enable Email/Password. For production, configure email confirmation and a working SMTP sender.
2. In **Authentication → URL Configuration**, set the Site URL to your `APP_URL` and add that exact origin to the allowed redirect URLs. Registration uses `APP_URL` as its confirmation redirect.
3. Use a Supabase PostgreSQL direct or **session-mode** pooler connection for `DATABASE_URL`. The Express session store needs a persistent PostgreSQL connection pool; transaction-mode pooler is not suitable.
4. This project's migration has already been applied as noted for its owner; do not rerun `001_finance_auth.sql` against that database. For a separate, new database only, apply it once from Supabase SQL Editor or PowerShell with `psql`:

   ```powershell
   psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/001_finance_auth.sql
   ```

The initial migration creates `public.users`, `public.transactions`, and a legacy `public.sessions` table. Apply `database/migrations/20261015113000_add_express_session_store.sql` once to create the dedicated `public.catatuang_express_sessions` table used by Express. This separate table avoids conflicts with databases that already have an unrelated `public.sessions` table; do not rerun or edit `001_finance_auth.sql` on an existing database. Supabase Auth owns credential records and password hashing. RLS policies and API ownership checks isolate rows; the database trigger creates each profile. Account deletion removes the Supabase Auth user and cascades to profile and transaction rows.

Apply the new session-store migration manually in the target database's SQL editor before starting the updated server. For a local PostgreSQL database, run it once with `psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/20261015113000_add_express_session_store.sql`.

Transaction receipt uploads are optional. Before using them, open each SQL file below, copy its full contents, and run it in **Supabase Dashboard → SQL Editor → New query**:

1. `database/migrations/20261013210100_add_transaction_receipts.sql` adds nullable receipt metadata and configures the private Storage bucket and owner policies.
2. `database/migrations/20261013212000_make_transactions_immutable.sql` prevents changes to saved transaction data while allowing receipt metadata updates.

After running the first migration, verify the three `receipt_*` columns in **Table Editor → transactions** and the private `transaction-receipts` bucket in **Storage**. If either migration has not been run, transactions without images continue to work, but receipt features or database-level immutability will not be fully available.

## Run

### Windows (start server and open browser automatically)

From the project folder in PowerShell:

```powershell
npm install
npm run dev:open
```

This starts the local server in the background and opens `http://localhost:3000` in your default browser. Stop it with:

```powershell
npm run stop:web
```

Server output is saved to `web-server.log` and `web-server-error.log` if startup fails.

### Any platform (manual browser)

```powershell
npm install
npm run dev
```

Keep that terminal open and visit `http://localhost:3000`. Press `Ctrl+C` to stop the server. `npm run build` creates the production client bundle; `npm start` starts the Express server in production mode after setting `NODE_ENV=production` and the required environment variables.

## Data and security notes

- Transaction data and initial balance are read from PostgreSQL; legacy `localStorage` values are not imported automatically or used after login.
- Session identifiers are stored in an HttpOnly, SameSite=Lax cookie; access and refresh tokens stay in the server-side session store.
- The Express `pg` connection accesses only `public.catatuang_express_sessions`; it may use a database role that bypasses RLS. Finance/profile CRUD goes through Supabase PostgREST using the authenticated user's JWT, so RLS policies apply, and API queries also explicitly filter by the authenticated user's ID. The browser never receives the database URL, session secret, or access/refresh tokens.
- The transaction list is filtered and paginated by the API (20 per page, maximum 50). Dashboard totals are calculated from database aggregates.
- No demo users or production passwords are seeded.

## Checks

```powershell
npm run lint
npm test
npm run build
```

Database-backed authentication, RLS, and migration behavior must also be exercised against a configured Supabase project before deployment.
