-- Open predictions until full-time.
--
-- Previously predictions locked at `lock_at` (~halftime). That meant a match
-- that was live-but-not-yet-final was un-editable AND not "resolved", so it could
-- permanently block a player from completing a group and advancing to the bracket.
--
-- New rule: a prediction is editable any time the match is not `final`. The only
-- gate is full-time — once the real result is known, the row is read-only.
-- (UI enforces the same in components/predict/GroupPredictor.tsx `isLocked`.)

drop policy if exists "own predictions insertable before lock" on public.predictions;
drop policy if exists "own predictions updatable before lock" on public.predictions;

create policy "own predictions insertable until final"
  on public.predictions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_id and m.status <> 'final'
    )
  );

create policy "own predictions updatable until final"
  on public.predictions for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_id and m.status <> 'final'
    )
  );
