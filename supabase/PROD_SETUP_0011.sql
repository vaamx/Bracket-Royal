-- 0011: analytics — sessions + event funnel for de-inflating user counts,
-- behavior/funnel, and acquisition/geo. RLS-locked: service-role only.
-- Activation = a saved pick (anonymous included), captured via triggers.

create table if not exists public.analytics_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users(id) on delete cascade,
  ip            inet,                       -- raw; nulled after 90 days
  ip_hash       text,                       -- salted sha256(ip); retained (dedup)
  country       text,
  region        text,
  city          text,
  user_agent    text,
  device        text,                       -- mobile | tablet | desktop | bot
  browser       text,
  os            text,
  is_bot        boolean not null default false,
  referrer      text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_term      text,
  utm_content   text,
  language      text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create table if not exists public.analytics_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,                 -- page_view | start_predicting | pick_saved | scorer_saved | signed_in
  props      jsonb not null default '{}'::jsonb,
  path       text,
  created_at timestamptz not null default now()
);

create index if not exists analytics_sessions_ip_hash_idx on public.analytics_sessions (ip_hash);
create index if not exists analytics_sessions_country_idx on public.analytics_sessions (country);
create index if not exists analytics_events_name_time_idx on public.analytics_events (name, created_at desc);
create index if not exists analytics_events_user_idx on public.analytics_events (user_id);

-- RLS: enabled with NO anon/authenticated policies → invisible to the Data API.
alter table public.analytics_sessions enable row level security;
alter table public.analytics_events  enable row level security;

-- Lock down table privileges: only service_role. Revoke any default grants.
revoke all on public.analytics_sessions from anon, authenticated;
revoke all on public.analytics_events  from anon, authenticated;
grant select, insert, update, delete on public.analytics_sessions to service_role;
grant select, insert, update, delete on public.analytics_events  to service_role;

-- Upsert a session row: first-touch acquisition/geo preserved, last_seen refreshed,
-- IP refreshed to the latest seen value.
create or replace function public.record_session(
  p_user_id uuid, p_ip inet, p_ip_hash text, p_country text, p_region text, p_city text,
  p_user_agent text, p_device text, p_browser text, p_os text, p_is_bot boolean,
  p_referrer text, p_utm_source text, p_utm_medium text, p_utm_campaign text,
  p_utm_term text, p_utm_content text, p_language text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.analytics_sessions as s (
    user_id, ip, ip_hash, country, region, city, user_agent, device, browser, os,
    is_bot, referrer, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    language, first_seen_at, last_seen_at
  ) values (
    p_user_id, p_ip, p_ip_hash, p_country, p_region, p_city, p_user_agent, p_device, p_browser, p_os,
    coalesce(p_is_bot, false), p_referrer, p_utm_source, p_utm_medium, p_utm_campaign, p_utm_term, p_utm_content,
    p_language, now(), now()
  )
  on conflict (user_id) do update set
    last_seen_at = now(),
    ip           = coalesce(excluded.ip, s.ip),
    ip_hash      = coalesce(excluded.ip_hash, s.ip_hash),
    country      = coalesce(s.country, excluded.country),
    region       = coalesce(s.region, excluded.region),
    city         = coalesce(s.city, excluded.city),
    user_agent   = coalesce(s.user_agent, excluded.user_agent),
    device       = coalesce(s.device, excluded.device),
    browser      = coalesce(s.browser, excluded.browser),
    os           = coalesce(s.os, excluded.os),
    referrer     = coalesce(s.referrer, excluded.referrer),
    utm_source   = coalesce(s.utm_source, excluded.utm_source),
    utm_medium   = coalesce(s.utm_medium, excluded.utm_medium),
    utm_campaign = coalesce(s.utm_campaign, excluded.utm_campaign),
    utm_term     = coalesce(s.utm_term, excluded.utm_term),
    utm_content  = coalesce(s.utm_content, excluded.utm_content),
    language     = coalesce(s.language, excluded.language);
end $$;

revoke execute on function public.record_session(uuid, inet, text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, text) from public, anon, authenticated;
grant  execute on function public.record_session(uuid, inet, text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, text) to service_role;

-- Funnel triggers: a saved pick is an activation signal. AFTER INSERT only —
-- editing an existing pick is an UPDATE (no new event). NOTE: we deliberately do
-- NOT add a unique index on (user_id, name, match_id): bracket-client deletes and
-- re-inserts removed picks, which would re-fire INSERT; a unique constraint would
-- make that prediction insert fail. Duplicate pick_saved rows are acceptable
-- (distinct-user activation counts are unaffected).
create or replace function public.log_pick_saved() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.analytics_events (user_id, name, props)
  values (new.user_id, 'pick_saved', jsonb_build_object('match_id', new.match_id));
  return new;
end $$;

create or replace function public.log_scorer_saved() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.analytics_events (user_id, name, props)
  values (new.user_id, 'scorer_saved', jsonb_build_object('player_id', new.player_id));
  return new;
end $$;

drop trigger if exists trg_predictions_log_pick on public.predictions;
create trigger trg_predictions_log_pick
  after insert on public.predictions
  for each row execute function public.log_pick_saved();

drop trigger if exists trg_scorer_log_pick on public.scorer_predictions;
create trigger trg_scorer_log_pick
  after insert on public.scorer_predictions
  for each row execute function public.log_scorer_saved();

-- Idempotent backfill of existing picks so the funnel isn't empty on day one.
-- `not exists` guard makes a re-run a no-op. predictions has no created_at, so
-- updated_at is the best available timestamp; flag rows as backfilled.
insert into public.analytics_events (user_id, name, props, created_at)
select p.user_id, 'pick_saved',
       jsonb_build_object('match_id', p.match_id, 'backfilled', true),
       coalesce(p.updated_at, now())
from public.predictions p
where not exists (
  select 1 from public.analytics_events e
  where e.user_id = p.user_id and e.name = 'pick_saved'
    and e.props->>'match_id' = p.match_id
);

insert into public.analytics_events (user_id, name, props, created_at)
select sp.user_id, 'scorer_saved',
       jsonb_build_object('player_id', sp.player_id, 'backfilled', true),
       coalesce(sp.created_at, now())
from public.scorer_predictions sp
where not exists (
  select 1 from public.analytics_events e
  where e.user_id = sp.user_id and e.name = 'scorer_saved'
    and e.props->>'player_id' = sp.player_id
);
