import { describe, expect, it } from "vitest";
import {
  canonicalizeJobPostingUrl,
  getJobPostingUrlAliases,
  getLinkedInJobPostingId,
} from "../../src/utils/jobIdentity.js";

describe("job identity", () => {
  it("extracts the LinkedIn posting id from detail and search URLs", () => {
    expect(
      getLinkedInJobPostingId(
        "https://www.linkedin.com/jobs/view/4461044308/?trackingId=abc",
      ),
    ).toBe("4461044308");
    expect(
      getLinkedInJobPostingId(
        "https://www.linkedin.com/jobs/view/backend-engineer-at-acme-4461044308",
      ),
    ).toBe("4461044308");
    expect(
      getLinkedInJobPostingId(
        "https://www.linkedin.com/jobs/search/?currentJobId=4461044308&origin=JOB_SEARCH_PAGE",
      ),
    ).toBe("4461044308");
  });

  it("does not accept a lookalike LinkedIn hostname", () => {
    expect(
      getLinkedInJobPostingId(
        "https://linkedin.com.evil.example/jobs/view/4461044308",
      ),
    ).toBeNull();
    expect(getLinkedInJobPostingId("not a URL")).toBeNull();
  });

  it("canonicalizes LinkedIn URLs and retains useful legacy aliases", () => {
    const input =
      "https://www.linkedin.com/jobs/search/?currentJobId=4461044308&origin=JOB_SEARCH_PAGE";

    expect(canonicalizeJobPostingUrl(input)).toBe(
      "https://www.linkedin.com/jobs/view/4461044308",
    );
    expect(getJobPostingUrlAliases(input)).toEqual(
      expect.arrayContaining([
        input,
        "https://www.linkedin.com/jobs/view/4461044308",
        "https://www.linkedin.com/jobs/view/4461044308/",
      ]),
    );
  });

  it("leaves non-LinkedIn URLs unchanged", () => {
    const url = "https://example.com/jobs/123?ref=search";
    expect(canonicalizeJobPostingUrl(url)).toBe(url);
    expect(getJobPostingUrlAliases(url)).toEqual([url]);
  });
});
