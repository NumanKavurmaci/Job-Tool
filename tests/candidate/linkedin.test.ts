import { describe, expect, it } from "vitest";
import { normalizeLinkedinUrl } from "../../src/candidate/linkedin.js";

describe("normalizeLinkedinUrl", () => {
  it("normalizes linkedin urls by removing search params and trailing slashes", () => {
    expect(
      normalizeLinkedinUrl("https://www.linkedin.com/in/example-user/?trk=public_profile"),
    ).toBe("https://www.linkedin.com/in/example-user");
  });

  it("returns null for empty values", () => {
    expect(normalizeLinkedinUrl("   ")).toBeNull();
  });
});
