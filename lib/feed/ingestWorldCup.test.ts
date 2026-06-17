import { describe, it, expect } from "vitest";
import { mapStatus, groupLetter, toGroupMatchRow, deriveTeamRows, knockoutResultsByTeamPair, type FdMatch } from "@/lib/feed/ingestWorldCup";

const finished: FdMatch = {
  id: 1, stage: "GROUP_STAGE", group: "GROUP_A", status: "FINISHED", utcDate: "2026-06-11T19:00:00Z",
  homeTeam: { tla: "MEX", name: "Mexico" }, awayTeam: { tla: "RSA", name: "South Africa" },
  score: { fullTime: { home: 2, away: 0 } },
};
const upcoming: FdMatch = {
  id: 2, stage: "GROUP_STAGE", group: "GROUP_A", status: "TIMED", utcDate: "2026-06-15T19:00:00Z",
  homeTeam: { tla: "KOR", name: "South Korea" }, awayTeam: { tla: "CZE", name: "Czechia" },
  score: { fullTime: { home: null, away: null } },
};

describe("ingestWorldCup mappers", () => {
  it("maps status", () => {
    expect(mapStatus("FINISHED")).toBe("final");
    expect(mapStatus("IN_PLAY")).toBe("live");
    expect(mapStatus("TIMED")).toBe("scheduled");
    expect(mapStatus("SCHEDULED")).toBe("scheduled");
  });

  it("extracts the group letter", () => {
    expect(groupLetter("GROUP_A")).toBe("A");
    expect(groupLetter("LAST_16")).toBeNull();
    expect(groupLetter(null)).toBeNull();
  });

  it("maps a finished match with the real score, winner, and our id scheme", () => {
    const r = toGroupMatchRow(finished);
    expect(r.id).toBe("GA-MEX-RSA");
    expect(r.group_label).toBe("A");
    expect(r.status).toBe("final");
    expect(r.home_score).toBe(2);
    expect(r.away_score).toBe(0);
    expect(r.winner_team_id).toBe("MEX");
  });

  it("leaves an upcoming match unscored", () => {
    const r = toGroupMatchRow(upcoming);
    expect(r.status).toBe("scheduled");
    expect(r.home_score).toBeNull();
    expect(r.winner_team_id).toBeNull();
  });

  it("records a draw with no winner", () => {
    const draw = { ...finished, score: { fullTime: { home: 1, away: 1 } } };
    expect(toGroupMatchRow(draw).winner_team_id).toBeNull();
  });

  it("derives unique teams with flags + real group from the matches", () => {
    const teams = deriveTeamRows([finished, upcoming]);
    expect(teams).toHaveLength(4);
    const mex = teams.find((t) => t.id === "MEX")!;
    expect(mex.name).toBe("Mexico");
    expect(mex.group_label).toBe("A");
    expect(mex.flag).toBe("🇲🇽");
  });
});

describe("knockoutResultsByTeamPair", () => {
  const ourKo = [
    { id: "R32-1", home_team_id: "MEX", away_team_id: "BRA", status: "scheduled" },
    { id: "R32-2", home_team_id: "ARG", away_team_id: "ESP", status: "final" }, // already final → skipped
  ];

  it("maps a feed result to our tie, same orientation", () => {
    const r = knockoutResultsByTeamPair(ourKo, [{ homeTla: "MEX", awayTla: "BRA", homeScore: 2, awayScore: 1 }]);
    expect(r).toEqual([{ matchId: "R32-1", homeScore: 2, awayScore: 1 }]);
  });

  it("orients the score to our home/away when the feed lists teams reversed", () => {
    const r = knockoutResultsByTeamPair(ourKo, [{ homeTla: "BRA", awayTla: "MEX", homeScore: 1, awayScore: 2 }]);
    expect(r).toEqual([{ matchId: "R32-1", homeScore: 2, awayScore: 1 }]); // MEX(home) 2, BRA(away) 1
  });

  it("skips already-final ties and unmatched pairs", () => {
    const r = knockoutResultsByTeamPair(ourKo, [
      { homeTla: "ARG", awayTla: "ESP", homeScore: 3, awayScore: 0 }, // R32-2 is final → skip
      { homeTla: "FRA", awayTla: "GER", homeScore: 1, awayScore: 0 }, // no matching tie → skip
    ]);
    expect(r).toEqual([]);
  });

  it("canonicalizes aliased TLAs so a feed code flip can't create a duplicate", () => {
    // Uruguay is served as URU here but must map to the canonical URY in both the
    // match id and the team ids, identical to a URY-served response.
    const uru: FdMatch = {
      id: 9, stage: "GROUP_STAGE", group: "GROUP_H", status: "FINISHED", utcDate: "2026-06-17T01:00:00Z",
      homeTeam: { tla: "KSA", name: "Saudi Arabia" }, awayTeam: { tla: "URU", name: "Uruguay" },
      score: { fullTime: { home: 1, away: 1 } },
    };
    const row = toGroupMatchRow(uru);
    expect(row.id).toBe("GH-KSA-URY");
    expect(row.away_team_id).toBe("URY");

    const teams = deriveTeamRows([uru]);
    const ury = teams.find((t) => t.id === "URY");
    expect(ury).toBeDefined();
    expect(ury!.flag).toBe("🇺🇾"); // not the 🏳️ fallback
    expect(teams.some((t) => t.id === "URU")).toBe(false);
  });
});
