-- Dev-only fixture data. Real WC2026 teams/schedule come from the results feed.
insert into public.teams (id, name, flag, group_label, fifa_rank) values
  ('MEX','Mexico','🇲🇽','A',15),
  ('BEL','Belgium','🇧🇪','A',6),
  ('SCO','Scotland','🏴','A',39),
  ('JOR','Jordan','🇯🇴','A',64)
on conflict (id) do nothing;

insert into public.matches
  (id, stage, group_label, home_team_id, away_team_id, kickoff_at, lock_at, status) values
  ('GA-MEX-BEL','group','A','MEX','BEL','2026-06-11T18:00:00Z','2026-06-11T18:00:00Z','scheduled'),
  ('GA-SCO-JOR','group','A','SCO','JOR','2026-06-11T21:00:00Z','2026-06-11T21:00:00Z','scheduled'),
  ('GA-MEX-SCO','group','A','MEX','SCO','2026-06-15T18:00:00Z','2026-06-15T18:00:00Z','scheduled'),
  ('GA-BEL-JOR','group','A','BEL','JOR','2026-06-15T21:00:00Z','2026-06-15T21:00:00Z','scheduled'),
  ('GA-MEX-JOR','group','A','MEX','JOR','2026-06-19T18:00:00Z','2026-06-19T18:00:00Z','scheduled'),
  ('GA-BEL-SCO','group','A','BEL','SCO','2026-06-19T18:00:00Z','2026-06-19T18:00:00Z','scheduled')
on conflict (id) do nothing;
