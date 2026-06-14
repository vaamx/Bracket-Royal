-- Group-stage matchday (1..3), used to order and label match rows in the
-- prediction UI. Nullable: knockout matches have no matchday, and ad-hoc inserts
-- (e.g. integration-test fixtures) may omit it.
alter table public.matches add column if not exists matchday int;
