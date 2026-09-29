import { describe, expect, it } from "vitest";
import { DAY_MS, initialState, isDue, schedule, type ScheduleState } from "@/lib/review/scheduler";
import { masteryLevel, masteryOf, recomputeScores, updateScores, EMPTY_SCORES } from "@/lib/review/mastery";

const now = new Date("2026-09-27T09:00:00");
const noJitter = () => 0.5;
const days = (s: ScheduleState, from = now) => (s.nextReviewAt!.getTime() - from.getTime()) / DAY_MS;

describe("schedule", () => {
  it("première réussite → 1 jour", () => {
    const s = schedule(initialState(), "CORRECT", { now, dimension: "RECOGNITION", random: noJitter });
    expect(s.reps).toBe(1);
    expect(s.intervalDays).toBe(1);
    expect(days(s)).toBeCloseTo(1);
  });

  it("deuxième réussite → environ 3 jours, la production progresse plus que la reconnaissance", () => {
    const s1 = schedule(initialState(), "CORRECT", { now, dimension: "RECOGNITION", random: noJitter });
    const later = new Date(now.getTime() + DAY_MS);
    const prod = schedule(s1, "CORRECT", { now: later, dimension: "PRODUCTION", random: noJitter });
    const reco = schedule(s1, "CORRECT", { now: later, dimension: "RECOGNITION", random: noJitter });
    expect(prod.intervalDays).toBe(3);
    expect(reco.intervalDays).toBeLessThan(prod.intervalDays);
  });

  it("les intervalles croissent avec les réussites successives", () => {
    let s = initialState();
    let t = now;
    const intervals: number[] = [];
    for (let i = 0; i < 5; i++) {
      s = schedule(s, "CORRECT", { now: t, dimension: "PRODUCTION", random: noJitter });
      intervals.push(s.intervalDays);
      t = s.nextReviewAt!;
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
  });

  it("un échec réduit l'intervalle, compte un oubli et reprogramme dans 10 minutes", () => {
    let s = initialState();
    let t = now;
    for (let i = 0; i < 3; i++) {
      s = schedule(s, "CORRECT", { now: t, dimension: "PRODUCTION", random: noJitter });
      t = s.nextReviewAt!;
    }
    const before = s.intervalDays;
    const f = schedule(s, "INCORRECT", { now: t, dimension: "PRODUCTION", random: noJitter });
    expect(f.lapses).toBe(1);
    expect(f.streak).toBe(0);
    expect(f.intervalDays).toBeLessThan(before);
    expect(f.ease).toBeLessThan(s.ease);
    expect((f.nextReviewAt!.getTime() - t.getTime()) / 60000).toBeCloseTo(10);
    // Réussite juste après l'oubli : repart de l'intervalle réduit, pas de l'ancien.
    const r = schedule(f, "CORRECT", { now: new Date(t.getTime() + 600_000), dimension: "PRODUCTION", random: noJitter });
    expect(r.intervalDays).toBeCloseTo(f.intervalDays, 1);
  });

  it("un élément nouveau raté reste à apprendre", () => {
    const f = schedule(initialState(), "INCORRECT", { now, dimension: "RECOGNITION", random: noJitter });
    expect(f.reps).toBe(0);
    expect(f.lapses).toBe(0);
    expect(f.intervalDays).toBe(0);
  });

  it("MOSTLY_CORRECT progresse moins que CORRECT", () => {
    let s = initialState();
    let t = now;
    for (let i = 0; i < 2; i++) {
      s = schedule(s, "CORRECT", { now: t, dimension: "PRODUCTION", random: noJitter });
      t = s.nextReviewAt!;
    }
    const good = schedule(s, "CORRECT", { now: t, dimension: "PRODUCTION", random: noJitter });
    const hard = schedule(s, "MOSTLY_CORRECT", { now: t, dimension: "PRODUCTION", random: noJitter });
    expect(hard.intervalDays).toBeLessThan(good.intervalDays);
  });

  it("jours manqués : une réussite en retard crédite une partie du retard", () => {
    let s = initialState();
    let t = now;
    for (let i = 0; i < 2; i++) {
      s = schedule(s, "CORRECT", { now: t, dimension: "PRODUCTION", random: noJitter });
      t = s.nextReviewAt!;
    }
    const onTime = schedule(s, "CORRECT", { now: t, dimension: "PRODUCTION", random: noJitter });
    const late = schedule(s, "CORRECT", { now: new Date(t.getTime() + 10 * DAY_MS), dimension: "PRODUCTION", random: noJitter });
    expect(late.intervalDays).toBeGreaterThan(onTime.intervalDays);
  });

  it("révision anticipée : progression limitée", () => {
    let s = initialState();
    let t = now;
    for (let i = 0; i < 3; i++) {
      s = schedule(s, "CORRECT", { now: t, dimension: "PRODUCTION", random: noJitter });
      t = s.nextReviewAt!;
    }
    const early = schedule(s, "CORRECT", {
      now: new Date(s.lastReviewAt!.getTime() + DAY_MS),
      dimension: "PRODUCTION",
      random: noJitter,
    });
    const onTime = schedule(s, "CORRECT", { now: t, dimension: "PRODUCTION", random: noJitter });
    expect(early.intervalDays).toBeGreaterThanOrEqual(s.intervalDays);
    expect(early.intervalDays).toBeLessThan(onTime.intervalDays);
  });

  it("révision anticipée juste après la 1re réussite : pas de saut à 3 jours", () => {
    const s1 = schedule(initialState(), "CORRECT", { now, dimension: "RECOGNITION", random: noJitter });
    const soon = schedule(s1, "CORRECT", { now: new Date(now.getTime() + 20 * 60_000), dimension: "PRODUCTION", random: noJitter });
    expect(soon.intervalDays).toBeLessThan(1.2);
    expect(soon.reps).toBe(2);
  });

  it("isDue : dû si prévu avant la fin de la journée", () => {
    expect(isDue({ reps: 0, nextReviewAt: null }, now)).toBe(false);
    expect(isDue({ reps: 1, nextReviewAt: new Date("2026-09-27T20:00:00") }, now)).toBe(true);
    expect(isDue({ reps: 1, nextReviewAt: new Date("2026-09-28T08:00:00") }, now)).toBe(false);
  });
});

describe("maîtrise", () => {
  it("met à jour la dimension concernée", () => {
    const s = updateScores(EMPTY_SCORES, "PRODUCTION", "CORRECT");
    expect(s.productionScore).toBe(35);
    expect(s.recognitionScore).toBeGreaterThan(0);
    expect(s.listeningScore).toBe(0);
  });

  it("recalcule depuis l'historique", () => {
    const hist = [
      { dimension: "RECOGNITION" as const, result: "CORRECT" as const },
      { dimension: "PRODUCTION" as const, result: "INCORRECT" as const },
      { dimension: "PRODUCTION" as const, result: "CORRECT" as const },
    ];
    const a = recomputeScores(hist);
    let b = { ...EMPTY_SCORES };
    for (const h of hist) b = updateScores(b, h.dimension, h.result);
    expect(a).toEqual(b);
  });

  it("classe le niveau de maîtrise", () => {
    expect(masteryLevel({ reps: 0, intervalDays: 0, lapses: 0, productionScore: 0, recognitionScore: 0, activeMistakes: 0 })).toBe("NEW");
    expect(masteryLevel({ reps: 5, intervalDays: 30, lapses: 0, productionScore: 85, recognitionScore: 90, activeMistakes: 0 })).toBe("MASTERED");
    expect(masteryLevel({ reps: 3, intervalDays: 3, lapses: 2, productionScore: 30, recognitionScore: 60, activeMistakes: 0 })).toBe("WEAK");
    expect(masteryLevel({ reps: 3, intervalDays: 2, lapses: 0, productionScore: 40, recognitionScore: 60, activeMistakes: 0 })).toBe("LEARNING");
  });

  it("consolidé : intervalle ≥ 7 jours et production ≥ 55 (ou reconnaissance ≥ 69) ; les erreurs comptent par occurrences", () => {
    const st = { reps: 3, intervalDays: 7, lapses: 0, productionScore: 58, recognitionScore: 0 };
    expect(masteryOf(st, [])).toBe("CONSOLIDATED");
    expect(masteryOf({ ...st, intervalDays: 6.9 }, [])).toBe("LEARNING");
    expect(masteryOf({ ...st, productionScore: 0, recognitionScore: 73 }, [])).toBe("CONSOLIDATED");
    expect(masteryOf({ ...st, productionScore: 0, recognitionScore: 65 }, [])).toBe("LEARNING");
    // Une seule erreur vue deux fois pèse comme deux erreurs : « À travailler ».
    expect(masteryOf(st, [{ occurrences: 2 }])).toBe("WEAK");
    expect(masteryOf(null, [])).toBe("NEW");
  });
});
