-- 0007: accent-insensitive player search
create extension if not exists unaccent;

create or replace function public.search_players(q text)
returns setof public.players
language sql
stable
set search_path = public, extensions
as $$
  select *
  from public.players
  where length(trim(q)) >= 2
    and unaccent(lower(name)) like '%' || unaccent(lower(trim(q))) || '%'
  order by goals desc, name
  limit 20;
$$;

grant execute on function public.search_players(text) to anon, authenticated;
