import { describe, expect, it } from "vitest";
import { buildPlan, countWork, dailyNewBudget, estimateMinutes, interleave, priority, selectItems, type PlanItem } from "@/lib/review/session-plan";
import { DAY_MS, type Result } from "@/lib/review/scheduler";
import { stopSuggestion } from "@/lib/review/pace";

const now = new Date("2026-09-27T09:00:00");

function item(id: string, over: Partial<PlanItem> = {}): PlanItem {
  return {
    id,
    type: "VOCABULARY",
    hanzi: `词${id}`,
    pinyin: "cí",
    french: `sens ${id}`,
    english: null,
    grammar: null,
    examples: [],
    reps: 0,
    scores: { recognition: 0, production: 0, listening: 0 },
    mistakeCategories: [],
    intervalDays: 0,
    nextReviewAt: null,
    lastReviewAt: null,
    lapses: 0,
    mistakeOccurrences: 0,
    lessonDate: new Date("2026-09-20"),
    order: 0,
    recentTypes: [],
    ...over,
  };
}

const due = (id: string, overdueDays: number, over: Partial<PlanItem> = {}) =>
  item(id, {
    reps: 3,
    intervalDays: 4,
    nextReviewAt: new Date(now.getTime() - overdueDays * DAY_MS),
    lastReviewAt: new Date(now.getTime() - (4 + overdueDays) * DAY_MS),
    scores: { recognition: 60, production: 50, listening: 0 },
    ...over,
  });

const opts = { now, kind: "DAILY" as const, maxReviews: 10, newItems: 4, listening: false };

describe("session quotidienne", () => {
  it("combine révisions dues et nouveautés, sans éléments non dus", () => {
    const items = [
      due("a", 1),
      due("b", 0),
      item("n1", { order: 1 }),
      item("n2", { order: 2 }),
      item("future", { reps: 2, intervalDays: 5, nextReviewAt: new Date(now.getTime() + 3 * DAY_MS) }),
    ];
    const sel = selectItems(items, opts);
    const ids = sel.map((s) => s.item.id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    expect(ids).toContain("n1");
    expect(ids).not.toContain("future");
    expect(countWork(items, now)).toEqual({ due: 2, newAvailable: 2, mistakes: 0 });
  });

  it("les erreurs augmentent la priorité", () => {
    const plain = due("p", 1);
    const faulty = due("f", 1, { mistakeOccurrences: 3 });
    expect(priority(faulty, now)).toBeGreaterThan(priority(plain, now));
    const sel = selectItems([plain, faulty], { ...opts, maxReviews: 1, newItems: 0 });
    expect(sel[0].item.id).toBe("f");
  });

  it("réinjecte les erreurs récurrentes même si elles ne sont pas dues", () => {
    const rec = item("r", { reps: 3, intervalDays: 10, nextReviewAt: new Date(now.getTime() + 5 * DAY_MS), mistakeOccurrences: 2 });
    const sel = selectItems([rec], opts);
    expect(sel.map((s) => s.item.id)).toEqual(["r"]);
    expect(sel[0].reason).toBe("mistake");
  });

  it("jours manqués : l'arriéré est plafonné et les nouveautés réduites", () => {
    const backlog = Array.from({ length: 40 }, (_, i) => due(`d${i}`, i % 10));
    const fresh = Array.from({ length: 10 }, (_, i) => item(`n${i}`));
    const sel = selectItems([...backlog, ...fresh], opts);
    const newCount = sel.filter((s) => s.reason === "new").length;
    expect(sel.filter((s) => s.reason !== "new").length).toBe(10);
    expect(newCount).toBeLessThanOrEqual(2);
  });

  it("nouveautés : le cours le plus récent d'abord, dans l'ordre des pages", () => {
    const items = [
      item("old", { lessonDate: new Date("2026-09-01"), order: 1 }),
      item("recent2", { lessonDate: new Date("2026-09-25"), order: 2 }),
      item("recent1", { lessonDate: new Date("2026-09-25"), order: 1 }),
    ];
    const sel = selectItems(items, { ...opts, newItems: 2 });
    expect(sel.map((s) => s.item.id)).toEqual(["recent1", "recent2"]);
  });

  it("entrelace les nouveautés", () => {
    const list = [
      { reason: "due", id: 1 },
      { reason: "due", id: 2 },
      { reason: "due", id: 3 },
      { reason: "due", id: 4 },
      { reason: "new", id: 5 },
      { reason: "new", id: 6 },
    ];
    const out = interleave(list);
    expect(out.length).toBe(6);
    expect(out[out.length - 1].reason).not.toBe("new");
  });

  it("construit un plan d'exercices et estime la durée", () => {
    const plan = buildPlan([due("a", 1), item("n1")], opts);
    expect(plan.length).toBe(2);
    expect(plan.find((p) => p.knowledgeItemId === "n1")?.type).toBe("RECOGNITION");
    expect(estimateMinutes(plan)).toBeGreaterThanOrEqual(1);
  });

  it("session erreurs : uniquement les éléments en erreur", () => {
    const sel = selectItems([due("a", 1), due("b", 1, { mistakeOccurrences: 1 })], { ...opts, kind: "MISTAKES" });
    expect(sel.map((s) => s.item.id)).toEqual(["b"]);
  });
});

describe("plafond quotidien de nouveautés", () => {
  it("limite la session à ce qui reste du plafond du jour", () => {
    expect(dailyNewBudget({ perSession: 8, perDay: 10, introducedToday: 0 })).toBe(8);
    expect(dailyNewBudget({ perSession: 8, perDay: 10, introducedToday: 8 })).toBe(2);
    expect(dailyNewBudget({ perSession: 8, perDay: 10, introducedToday: 12 })).toBe(0);
    expect(dailyNewBudget({ perSession: 8, perDay: 10, introducedToday: 0, reviewsOnly: true })).toBe(0);
  });
});

describe("arrêt conseillé en cours de session", () => {
  const base = { activeSeconds: 60, plannedSeconds: 600, remaining: 10 };
  const ok = Array(8).fill("CORRECT") as Result[];
  const bad = ["CORRECT", "INCORRECT", "INCORRECT", "MOSTLY_CORRECT", "INCORRECT", "CORRECT", "INCORRECT", "INCORRECT"] as Result[];

  it("propose d'arrêter quand les dernières réponses se dégradent", () => {
    expect(stopSuggestion({ ...base, results: [...ok, ...bad] })).toBe("fatigue");
    expect(stopSuggestion({ ...base, results: ok })).toBeNull();
    // Trop peu de réponses pour juger.
    expect(stopSuggestion({ ...base, results: bad.slice(0, 7) })).toBeNull();
  });

  it("propose d'arrêter quand la durée prévue est largement dépassée", () => {
    expect(stopSuggestion({ ...base, results: ok, activeSeconds: 901 })).toBe("overtime");
    expect(stopSuggestion({ ...base, results: ok, activeSeconds: 880 })).toBeNull();
    // Petite session : au moins 5 minutes de marge.
    expect(stopSuggestion({ ...base, results: ok, plannedSeconds: 120, activeSeconds: 400 })).toBeNull();
  });

  it("ne propose rien quand il ne reste presque plus rien", () => {
    expect(stopSuggestion({ ...base, results: bad, remaining: 2 })).toBeNull();
  });
});
