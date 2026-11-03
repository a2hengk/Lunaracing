import { describe, expect, it } from "vitest";
import type { SessionListItem } from "./data-types";
import { groupByTrack, sessionKind } from "./group";

const s = (slug: string, track: string, type: string, at: string, best: number | null, layout = ""): SessionListItem => ({
  slug,
  track,
  layout,
  car: "Team WRT 2026 #32",
  carClass: "GT3",
  sessionType: type,
  recordedAt: at,
  laps: 3,
  bestMs: best,
});

describe("groupByTrack", () => {
  const list = [
    s("spa-p", "Spa", "Practice", "2026-10-27T21:05:00Z", 145461, "Endurance"),
    s("monza-p", "Monza", "Practice", "2026-11-03T18:56:00Z", 113169),
    s("monza-q", "Monza", "Qualify", "2026-11-03T19:04:00Z", 113362),
    s("monza-r1", "Monza", "Race", "2026-11-03T19:13:00Z", 112826),
    s("monza-r2", "Monza", "Race", "2026-11-03T19:57:00Z", 111873),
  ];
  const groups = groupByTrack(list);

  it("eine Gruppe pro Strecke, neueste zuerst", () => {
    expect(groups.map((g) => g.track)).toEqual(["Monza", "Spa"]);
  });

  it("Rennen zuerst, dann Quali, dann Training, jeweils neueste zuerst", () => {
    expect(groups[0]!.sessions.map((x) => x.slug)).toEqual(["monza-r2", "monza-r1", "monza-q", "monza-p"]);
  });

  it("Bestzeit pro Art", () => {
    expect(groups[0]!.bestMs).toEqual({ rennen: 111873, quali: 113362, training: 113169 });
  });

  it("trennt verschiedene Layouts derselben Strecke", () => {
    const g = groupByTrack([s("a", "Spa", "Race", "2026-01-01", 1, "Endurance"), s("b", "Spa", "Race", "2026-01-02", 1, "Sprint")]);
    expect(g.length).toBe(2);
  });
});

it("sessionKind", () => {
  expect(sessionKind("Race")).toBe("rennen");
  expect(sessionKind("Qualify")).toBe("quali");
  expect(sessionKind("Practice")).toBe("training");
  expect(sessionKind("")).toBe("sonstige");
});
