import { describe, expect, it } from "vitest";
import { decideJob } from "../../src/scoring/decision.js";

describe("decideJob", () => {
  it("returns APPLY for scores 75 and above", () => {
    expect(
      decideJob({
        totalScore: 75,
        breakdown: { skill: 30, seniority: 15, location: 15, tech: 10, bonus: 5 },
      }).decision,
    ).toBe("APPLY");
  });

  it("returns MAYBE for scores between 55 and 74", () => {
    expect(
      decideJob({
        totalScore: 60,
        breakdown: { skill: 20, seniority: 15, location: 10, tech: 10, bonus: 5 },
      }).decision,
    ).toBe("MAYBE");
  });

  it("returns SKIP for low scores", () => {
    expect(
      decideJob({
        totalScore: 30,
        breakdown: { skill: 10, seniority: 5, location: 5, tech: 5, bonus: 5 },
      }).decision,
    ).toBe("SKIP");
  });
});
