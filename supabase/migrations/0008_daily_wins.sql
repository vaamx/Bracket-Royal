-- Daily Wins: per-event medals a user earns as real results come in
-- (🎯 exact scoreline, ⚽ exact goal tally). Idempotent on (user_id, win_key)
-- so the scoring cron can re-award safely; `emailed` drives the daily digest.

create table if not exists public.daily_wins (
  user_id    uuid not null references auth.users(id) on delete cascade,
  win_key    text not null,             -- e.g. 'exact:G-12' or 'goals:player-abc'
  kind       text not null,             -- 'exact' | 'goals'
  detail     text not null,             -- locale-neutral summary, e.g. 'BRA 2–1 ARG' / 'Messi · 5'
  emailed    boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, win_key)
);

alter table public.daily_wins enable row level security;

-- Owners can read their own medals; writes are service-role only (the cron).
create policy "own daily wins readable" on public.daily_wins
  for select to authenticated using (auth.uid() = user_id);
grant select on public.daily_wins to authenticated;

create index if not exists daily_wins_user_idx on public.daily_wins (user_id, created_at desc);

-- Preferred locale for transactional emails (daily-wins digest, reminders).
alter table public.notification_prefs add column if not exists locale text not null default 'en';
