-- Stream standings + live match changes to clients via Supabase Realtime.
alter publication supabase_realtime add table public.league_standings;
alter publication supabase_realtime add table public.matches;
