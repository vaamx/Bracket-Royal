# Deploying Bracket Royale (Vercel + hosted Supabase)

The app is Supabase-backed, so production needs a **hosted Supabase project**
(local `supabase` won't work from Vercel). Guest play needs no email/OAuth, so
people can try it immediately once these steps are done.

## 1. Create the hosted Supabase project
- supabase.com → New project. Copy from Project Settings → API:
  - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
  - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- Auth → Providers: **enable "Anonymous sign-ins"** (REQUIRED — the app gives
  every visitor an anonymous session). Optionally enable Google.
- Auth → SMTP: point at **SendGrid** so magic-link sign-in emails actually send
  (host `smtp.sendgrid.net`, user `apikey`, pass = `SENDGRID_API_KEY`).

## 2. Push the schema + seed the tournament
```bash
npx supabase login                       # interactive (browser)
npx supabase link --project-ref <REF>    # REF from the project URL
npx supabase db push                     # applies migrations 0001..00NN

# Point a local shell at PROD and ingest real WC2026 data:
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
SUPABASE_SERVICE_ROLE_KEY=... FOOTBALL_DATA_API_KEY=... npm run ingest:wc
```

## 3. Deploy to Vercel
```bash
vercel login            # interactive
vercel link             # create/link the project
# Set env (Production) — every key from .env.example:
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add FOOTBALL_DATA_API_KEY production
vercel env add CRON_SECRET production
vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production
vercel env add VAPID_PUBLIC_KEY production
vercel env add VAPID_PRIVATE_KEY production
vercel env add VAPID_SUBJECT production
vercel env add SENDGRID_API_KEY production
vercel env add SENDGRID_FROM_EMAIL production
vercel deploy --prod
```
(VAPID values are already in `.env.local`; SendGrid creds live in the ciro `.env`.)

## Notes
- `vercel.json` runs two crons: `/api/cron/poll-results` (*/5) and
  `/api/cron/notify` (*/15). Vercel **Hobby** caps cron frequency — on Hobby
  these effectively run daily; use **Pro** for 5-min polling during matches.
- After deploy, set the Supabase Auth **Site URL** + redirect allow-list to the
  Vercel domain so OAuth/magic-link redirects work.

## Top Scorers feature (migration 0006)
1. Supabase SQL Editor → paste `supabase/PROD_SETUP_0006.sql` → Run.
2. Ingest players + current scorer goals against prod:
   `npm run ingest:players`   (uses .env.local hosted values)
3. Merge `feat-top-scorers` → `main` (auto-deploys to Vercel).

## Player search (migration 0007)
Supabase SQL Editor → paste `supabase/PROD_SETUP_0007.sql` → Run. (No re-ingest needed.)
