-- 0012: claim_guest_data — forward-only fix for guest->account data loss.
-- Migrates an anonymous guest's data into a newly created/signed-in account,
-- then deletes the emptied guest so it stops inflating user counts.
-- Non-destructive: the account's own rows always win on conflict.

create or replace function public.claim_guest_data(p_guest_id uuid, p_new_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_anon boolean;
begin
  if p_guest_id is null or p_new_user is null or p_guest_id = p_new_user then
    return;
  end if;

  -- Only ever claim from an ANONYMOUS (unclaimed) user.
  select is_anonymous into v_is_anon from auth.users where id = p_guest_id;
  if v_is_anon is distinct from true then
    return;
  end if;

  -- Predictions: move guest rows only for matches the account hasn't predicted.
  -- The account's own picks always win; conflicting guest rows are left behind
  -- and removed when the guest is deleted (cascade).
  update public.predictions g
     set user_id = p_new_user
   where g.user_id = p_guest_id
     and not exists (
       select 1 from public.predictions n
       where n.user_id = p_new_user and n.match_id = g.match_id
     );

  -- Scorer predictions: same rule, keyed on player_id.
  update public.scorer_predictions g
     set user_id = p_new_user
   where g.user_id = p_guest_id
     and not exists (
       select 1 from public.scorer_predictions n
       where n.user_id = p_new_user and n.player_id = g.player_id
     );

  -- Private league memberships: copy non-global memberships to the new user.
  insert into public.league_members (league_id, user_id)
  select lm.league_id, p_new_user
  from public.league_members lm
  join public.leagues l on l.id = lm.league_id
  where lm.user_id = p_guest_id and l.is_global = false
  on conflict do nothing;

  -- Leagues the guest created: hand ownership to the new user. Required before
  -- deleting the guest because leagues.owner_id -> profiles(id) is RESTRICT and
  -- profiles -> auth.users cascades, so otherwise the delete below would fail.
  -- (The global league has owner_id null and is never matched.)
  update public.leagues set owner_id = p_new_user where owner_id = p_guest_id;

  -- Delete the emptied guest (cascades profile + leftover predictions/memberships
  -- + analytics rows) so it no longer inflates the user count.
  delete from auth.users where id = p_guest_id and is_anonymous = true;
end;
$$;

revoke execute on function public.claim_guest_data(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.claim_guest_data(uuid, uuid) to service_role;
