/**
 * Dev fixture data for the 12 groups (48 teams). NOT the official draw — real
 * teams/schedule are ingested from the results feed in Plan 4. Group A is ordered
 * [MEX, BEL, SCO, JOR] so the round-robin generator reproduces the match ids
 * already in supabase/seed.sql, keeping the Plan-2 integration test valid.
 */
export interface FixtureTeam {
  id: string; // 3-letter code
  name: string;
  flag: string;
  fifaRank: number;
}

export interface FixtureGroup {
  label: string; // 'A'..'L'
  teams: FixtureTeam[]; // exactly 4, in seeding order
}

export const FIXTURE_GROUPS: FixtureGroup[] = [
  { label: "A", teams: [
    { id: "MEX", name: "Mexico", flag: "🇲🇽", fifaRank: 15 },
    { id: "BEL", name: "Belgium", flag: "🇧🇪", fifaRank: 6 },
    { id: "SCO", name: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", fifaRank: 39 },
    { id: "JOR", name: "Jordan", flag: "🇯🇴", fifaRank: 64 },
  ]},
  { label: "B", teams: [
    { id: "CAN", name: "Canada", flag: "🇨🇦", fifaRank: 43 },
    { id: "MAR", name: "Morocco", flag: "🇲🇦", fifaRank: 12 },
    { id: "UZB", name: "Uzbekistan", flag: "🇺🇿", fifaRank: 57 },
    { id: "CRC", name: "Costa Rica", flag: "🇨🇷", fifaRank: 54 },
  ]},
  { label: "C", teams: [
    { id: "USA", name: "United States", flag: "🇺🇸", fifaRank: 16 },
    { id: "NED", name: "Netherlands", flag: "🇳🇱", fifaRank: 7 },
    { id: "NGA", name: "Nigeria", flag: "🇳🇬", fifaRank: 40 },
    { id: "HAI", name: "Haiti", flag: "🇭🇹", fifaRank: 86 },
  ]},
  { label: "D", teams: [
    { id: "ARG", name: "Argentina", flag: "🇦🇷", fifaRank: 1 },
    { id: "CRO", name: "Croatia", flag: "🇭🇷", fifaRank: 10 },
    { id: "ECU", name: "Ecuador", flag: "🇪🇨", fifaRank: 23 },
    { id: "CPV", name: "Cape Verde", flag: "🇨🇻", fifaRank: 70 },
  ]},
  { label: "E", teams: [
    { id: "FRA", name: "France", flag: "🇫🇷", fifaRank: 2 },
    { id: "JPN", name: "Japan", flag: "🇯🇵", fifaRank: 18 },
    { id: "SEN", name: "Senegal", flag: "🇸🇳", fifaRank: 17 },
    { id: "NZL", name: "New Zealand", flag: "🇳🇿", fifaRank: 89 },
  ]},
  { label: "F", teams: [
    { id: "ESP", name: "Spain", flag: "🇪🇸", fifaRank: 3 },
    { id: "DEN", name: "Denmark", flag: "🇩🇰", fifaRank: 21 },
    { id: "TUN", name: "Tunisia", flag: "🇹🇳", fifaRank: 41 },
    { id: "RSA", name: "South Africa", flag: "🇿🇦", fifaRank: 60 },
  ]},
  { label: "G", teams: [
    { id: "BRA", name: "Brazil", flag: "🇧🇷", fifaRank: 5 },
    { id: "EGY", name: "Egypt", flag: "🇪🇬", fifaRank: 33 },
    { id: "IRN", name: "Iran", flag: "🇮🇷", fifaRank: 20 },
    { id: "AUS", name: "Australia", flag: "🇦🇺", fifaRank: 25 },
  ]},
  { label: "H", teams: [
    { id: "POR", name: "Portugal", flag: "🇵🇹", fifaRank: 4 },
    { id: "URU", name: "Uruguay", flag: "🇺🇾", fifaRank: 11 },
    { id: "KSA", name: "Saudi Arabia", flag: "🇸🇦", fifaRank: 58 },
    { id: "CIV", name: "Côte d'Ivoire", flag: "🇨🇮", fifaRank: 45 },
  ]},
  { label: "I", teams: [
    { id: "ENG", name: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", fifaRank: 5 },
    { id: "COL", name: "Colombia", flag: "🇨🇴", fifaRank: 14 },
    { id: "NOR", name: "Norway", flag: "🇳🇴", fifaRank: 38 },
    { id: "QAT", name: "Qatar", flag: "🇶🇦", fifaRank: 51 },
  ]},
  { label: "J", teams: [
    { id: "GER", name: "Germany", flag: "🇩🇪", fifaRank: 9 },
    { id: "SUI", name: "Switzerland", flag: "🇨🇭", fifaRank: 19 },
    { id: "KOR", name: "Korea Republic", flag: "🇰🇷", fifaRank: 22 },
    { id: "PAN", name: "Panama", flag: "🇵🇦", fifaRank: 42 },
  ]},
  { label: "K", teams: [
    { id: "ITA", name: "Italy", flag: "🇮🇹", fifaRank: 8 },
    { id: "AUT", name: "Austria", flag: "🇦🇹", fifaRank: 24 },
    { id: "GHA", name: "Ghana", flag: "🇬🇭", fifaRank: 47 },
    { id: "CUW", name: "Curaçao", flag: "🇨🇼", fifaRank: 82 },
  ]},
  { label: "L", teams: [
    { id: "COD", name: "DR Congo", flag: "🇨🇩", fifaRank: 56 },
    { id: "PER", name: "Peru", flag: "🇵🇪", fifaRank: 32 },
    { id: "PAR", name: "Paraguay", flag: "🇵🇾", fifaRank: 35 },
    { id: "JAM", name: "Jamaica", flag: "🇯🇲", fifaRank: 53 },
  ]},
];

/** Flattened list of all 48 fixture teams with their group label. */
export const FIXTURE_TEAMS = FIXTURE_GROUPS.flatMap((g) =>
  g.teams.map((t) => ({ ...t, group_label: g.label }))
);
