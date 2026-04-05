import { describe, expect, it } from "vitest";
import {
  createEmptySiteFeedbackSnapshot,
  hasSiteFeedback,
  mergeSiteFeedbackSnapshots,
} from "../../src/browser/siteFeedback.js";

describe("siteFeedback helpers", () => {
  it("creates a stable empty snapshot shape", () => {
    expect(createEmptySiteFeedbackSnapshot()).toEqual({
      errors: [],
      warnings: [],
      infos: [],
      messages: [],
    });
  });

  it("merges snapshots, trims messages, deduplicates by severity, and preserves sources when present", () => {
    const merged = mergeSiteFeedbackSnapshots(
      null,
      undefined,
      {
        errors: [],
        warnings: [],
        infos: [],
        messages: [
          { severity: "error", message: " Salary must be numeric ", source: "form" },
          { severity: "warning", message: " Profile looks incomplete " },
          { severity: "info", message: " Saved as draft ", source: null },
          { severity: "error", message: "   " },
        ],
      },
      {
        errors: [],
        warnings: [],
        infos: [],
        messages: [
          { severity: "error", message: "Salary must be numeric", source: "browser" },
          { severity: "warning", message: "Profile looks incomplete", source: "browser" },
          { severity: "info", message: "Saved as draft" },
          { severity: "error", message: "Different error", source: "browser" },
        ],
      },
    );

    expect(merged.messages).toEqual([
      { severity: "error", message: "Salary must be numeric", source: "form" },
      { severity: "warning", message: "Profile looks incomplete" },
      { severity: "info", message: "Saved as draft" },
      { severity: "error", message: "Different error", source: "browser" },
    ]);
    expect(merged.errors).toEqual(["Salary must be numeric", "Different error"]);
    expect(merged.warnings).toEqual(["Profile looks incomplete"]);
    expect(merged.infos).toEqual(["Saved as draft"]);
  });

  it("reports whether any site feedback was captured", () => {
    expect(hasSiteFeedback(undefined)).toBe(false);
    expect(hasSiteFeedback(null)).toBe(false);
    expect(
      hasSiteFeedback({
        errors: [],
        warnings: [],
        infos: [],
        messages: [],
      }),
    ).toBe(false);
    expect(
      hasSiteFeedback({
        errors: ["Problem"],
        warnings: [],
        infos: [],
        messages: [{ severity: "error", message: "Problem" }],
      }),
    ).toBe(true);
  });
});
