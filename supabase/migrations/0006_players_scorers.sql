-- 0006: Top Scorers & Golden Boot
create table if not exists public.players (
  id           text primary key,
  name         text not null,
  team_id      text references public.teams(id),
  position     text,
  is_contender boolean not null default false,
  goals        integer not null default 0,
  scorer_rank  integer,
  created_at   timestamptz not null default now()
);
create index if not exists players_name_idx on public.players using gin (to_tsvector('simple', name));
create index if not exists players_team_idx on public.players (team_id);

create table if not exists public.scorer_predictions (
  user_id         uuid not null references auth.users(id) on delete cascade,
  player_id       text not null references public.players(id) on delete cascade,
  is_golden_boot  boolean not null default false,
  predicted_goals integer,
  created_at      timestamptz not null default now(),
  primary key (user_id, player_id)
);
create index if not exists scorer_pred_user_idx on public.scorer_predictions (user_id);

alter table public.players enable row level security;
alter table public.scorer_predictions enable row level security;

create policy "players readable" on public.players for select to anon, authenticated using (true);

create policy "own scorer picks readable" on public.scorer_predictions
  for select to authenticated using (user_id = auth.uid());
create policy "own scorer picks insertable" on public.scorer_predictions
  for insert to authenticated with check (user_id = auth.uid());
create policy "own scorer picks updatable" on public.scorer_predictions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own scorer picks deletable" on public.scorer_predictions
  for delete to authenticated using (user_id = auth.uid());

grant select on public.players to anon, authenticated;
grant select, insert, update, delete on public.scorer_predictions to authenticated;
