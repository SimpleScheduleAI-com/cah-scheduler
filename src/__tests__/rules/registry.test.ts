/**
 * Tests for the rule evaluator registry.
 *
 * Superseded evaluators must NOT be registered: overtime-cost was replaced by
 * overtime-v2 (which separates true >40h FLSA overtime from sub-40h extra
 * hours), and weekend-fairness was replaced by weekend-count +
 * consecutive-weekends (which count Sat+Sun of one weekend as a single
 * rotation). Keeping the old evaluators in the registry lets an admin
 * activate them alongside the v2 rules via the Rules UI or an import,
 * double-penalizing the same hours/weekends with conflicting math.
 */

import { describe, it, expect } from "vitest";
import { getEvaluator, getAllEvaluators } from "@/lib/engine/rules";

describe("rule evaluator registry", () => {
  it("does not register the superseded overtime-cost evaluator", () => {
    expect(getEvaluator("overtime-cost")).toBeUndefined();
  });

  it("does not register the superseded weekend-fairness evaluator", () => {
    expect(getEvaluator("weekend-fairness")).toBeUndefined();
  });

  it("still registers the overtime-v2 replacement", () => {
    expect(getEvaluator("overtime-v2")).toBeDefined();
  });

  it("still registers the weekend-count and consecutive-weekends replacements", () => {
    expect(getEvaluator("weekend-count")).toBeDefined();
    expect(getEvaluator("consecutive-weekends")).toBeDefined();
  });

  it("registry contains no evaluator superseded by another", () => {
    const ids = getAllEvaluators().map((e) => e.id);
    expect(ids).not.toContain("overtime-cost");
    expect(ids).not.toContain("weekend-fairness");
  });
});
