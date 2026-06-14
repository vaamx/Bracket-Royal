-- Auth provisioning + leagues access model for World Cup 2026 predictions.

-- 1. The global league everyone joins automatically.
insert into public.leagues (id, name, invite_code, owner_id, is_global)
values ('00000000-0000-0000-0000-000000000001', 'Global', 'GLOBAL', null, true)
on conflict (id) do nothing;

-- 2. Provision a profile + global membership when a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.league_members (league_id, user_id)
  values ('00000000-0000-0000-0000-000000000001', new.id)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. SECURITY DEFINER membership helper (avoids recursive RLS on league_members).
create or replace function public.is_member(p_league uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league and user_id = auth.uid()
  );
$$;

-- 4. Base table privileges. RLS only *narrows* access for roles that already
-- hold table GRANTs; without these, every API query is denied at the privilege
-- layer (error 42501) before any policy is evaluated. The tables in 0001 were
-- created without DML grants for the Supabase API roles, so grant them here.
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;
grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

-- 5. RLS policies.

-- profiles: any authenticated user can read profiles (needed for leaderboards);
-- a user may update only their own. Inserts happen via the trigger (definer).
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);
create policy "profiles updatable by owner"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- leagues: visible if global, you own it, or you're a member; create as
-- yourself; owner updates. (The owner clause lets a creator read their league
-- back immediately on insert-returning, before the league_members row exists.)
create policy "leagues visible to members or global"
  on public.leagues for select to authenticated
  using (is_global or owner_id = auth.uid() or public.is_member(id));
create policy "leagues created by owner"
  on public.leagues for insert to authenticated
  with check (owner_id = auth.uid());
create policy "leagues updated by owner"
  on public.leagues for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- league_members: see co-members of your leagues; add only yourself.
create policy "members visible to fellow members"
  on public.league_members for select to authenticated
  using (public.is_member(league_id));
create policy "members can add themselves"
  on public.league_members for insert to authenticated
  with check (user_id = auth.uid());

-- league_standings: members can read; writes are service-role only (no write policy).
create policy "standings visible to members"
  on public.league_standings for select to authenticated
  using (public.is_member(league_id));

-- achievements: a user can read their own; writes are service-role only.
create policy "own achievements readable"
  on public.achievements for select to authenticated
  using (user_id = auth.uid());

-- predictions: a user reads only their own; may write only their own AND only
-- before the match locks. (UI arrives in Plan 3; the security model belongs here.)
create policy "own predictions readable"
  on public.predictions for select to authenticated
  using (user_id = auth.uid());
create policy "own predictions insertable before lock"
  on public.predictions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_id and (m.lock_at is null or now() < m.lock_at)
    )
  );
create policy "own predictions updatable before lock"
  on public.predictions for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_id and (m.lock_at is null or now() < m.lock_at)
    )
  );

-- 6. Join-by-code RPC: looks up a league by code without exposing it via RLS,
-- then adds the caller as a member. Returns the joined league.
create or replace function public.join_league_by_code(p_code text)
returns public.leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.leagues;
begin
  select * into l from public.leagues where invite_code = upper(trim(p_code));
  if l.id is null then
    raise exception 'League not found' using errcode = 'no_data_found';
  end if;
  insert into public.league_members (league_id, user_id)
  values (l.id, auth.uid())
  on conflict do nothing;
  return l;
end;
$$;

revoke all on function public.join_league_by_code(text) from public;
grant execute on function public.join_league_by_code(text) to authenticated;
