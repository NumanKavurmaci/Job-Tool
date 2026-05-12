import { describe, expect, it } from "vitest";
import {
  buildLinkedInJobSurfaceSelector,
  buildPostClickSurfaceSelector,
  LINKEDIN_ALREADY_APPLIED_SELECTORS,
} from "../../src/linkedin/easyApplyDom.js";

describe("easy apply DOM helpers", () => {
  it("builds post-click surface selectors from shared pieces", () => {
    const selector = buildPostClickSurfaceSelector({
      externalApplyTriggerSelector: "button.external",
      externalHeaderApplyFallbackSelector: "a.header-apply",
    });

    expect(selector).toContain(".jobs-easy-apply-modal");
    expect(selector).toContain("[role='dialog']");
    expect(selector).toContain("button.external");
    expect(selector).toContain("a.header-apply");
    expect(selector).toContain(LINKEDIN_ALREADY_APPLIED_SELECTORS[0]);
  });

  it("builds LinkedIn job surface selectors for navigation readiness", () => {
    const selector = buildLinkedInJobSurfaceSelector({
      easyApplyTriggerSelector: "button.easy",
      externalApplyTriggerSelector: "button.external",
    });

    expect(selector).toContain(".jobs-search-results__list-item");
    expect(selector).toContain(".jobs-unified-top-card");
    expect(selector).toContain("button.easy");
    expect(selector).toContain("button.external");
  });
});
