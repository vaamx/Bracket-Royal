-- Per-source points breakdown so the UI can show how a total was earned.
-- Back-filled to 0; runScoring repopulates them on the next run. The total
-- `points` column is unchanged (still group + ko + scorer).
alter table public.league_standings add column if not exists group_points  integer not null default 0;
alter table public.league_standings add column if not exists ko_points     integer not null default 0;
alter table public.league_standings add column if not exists scorer_points integer not null default 0;
