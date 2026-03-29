import { describe, expect, it, vi } from "vitest";
import { persistJobAnalysisRecord } from "../../src/utils/jobPersistence.js";

function createArgs() {
  const prisma = {
    firm: {
      upsert: vi.fn().mockResolvedValue({ id: "firm_1", name: "Acme", logoUrl: null }),
      update: vi.fn().mockResolvedValue({ id: "firm_1", name: "Acme", logoUrl: "https://cdn.example.com/acme.png" }),
    },
    jobPosting: {
      upsert: vi.fn().mockResolvedValue({ id: "job_1", company: "Acme" }),
      count: vi.fn().mockResolvedValue(3),
    },
    applicationDecision: {
      create: vi.fn().mockResolvedValue({ id: "decision_3" }),
      findMany: vi.fn().mockResolvedValue([
        { id: "decision_3", decision: "APPLY", jobPostingId: "job_1" },
        { id: "decision_2", decision: "SKIP", jobPostingId: "job_2" },
        { id: "decision_1", decision: "SKIP", jobPostingId: "job_1" },
      ]),
    },
  };

  return {
    prisma,
    logger: { warn: vi.fn() },
    url: "https://example.com/job",
    extracted: {
      rawText: "raw",
      title: "Frontend Engineer",
      company: "Acme",
      companyLogoUrl: "https://cdn.example.com/acme.png",
      location: "Remote",
      platform: "linkedin",
      applicationType: "easy_apply" as const,
      applyUrl: "https://example.com/apply",
      currentUrl: "https://example.com/job",
      descriptionText: "desc",
      requirementsText: "req",
      benefitsText: "benefits",
    },
    parsed: {
      title: "Frontend Engineer",
      company: "Acme",
      location: "Remote",
      platform: "linkedin",
      seniority: "mid",
      mustHaveSkills: [],
      niceToHaveSkills: [],
      technologies: ["React"],
      yearsRequired: 3,
      remoteType: "remote",
      visaSponsorship: "unknown",
      workAuthorization: "authorized",
    },
    normalized: {
      title: "Frontend Engineer",
      company: "Acme",
      location: "Remote",
      remoteType: "remote" as const,
      seniority: "mid" as const,
      mustHaveSkills: [],
      niceToHaveSkills: [],
      technologies: ["React"],
      yearsRequired: 3,
      platform: "linkedin",
      applicationType: "easy_apply" as const,
      visaSponsorship: "unknown" as const,
      workAuthorization: "authorized" as const,
      openQuestionsCount: 0,
    },
    score: 82,
    finalDecision: "APPLY" as const,
    policyAllowed: true,
    reasons: ["Strong fit."],
    parseVersion: "phase-5",
  };
}

describe("job persistence", () => {
  it("creates or updates a firm snapshot with counts and decision ids", async () => {
    const args = createArgs();

    const result = await persistJobAnalysisRecord(args as never);

    expect(result.jobPosting.id).toBe("job_1");
    expect(result.applicationDecision.id).toBe("decision_3");
    expect(args.prisma.firm.upsert).toHaveBeenCalledWith({
      where: { name: "Acme" },
      update: { logoUrl: "https://cdn.example.com/acme.png" },
      create: {
        name: "Acme",
        logoUrl: "https://cdn.example.com/acme.png",
      },
    });
    expect(args.prisma.jobPosting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          firmId: "firm_1",
          companyLogoUrl: "https://cdn.example.com/acme.png",
        }),
      }),
    );
    expect(args.prisma.firm.update).toHaveBeenCalledWith({
      where: { id: "firm_1" },
      data: {
        logoUrl: "https://cdn.example.com/acme.png",
        totalReviewedJobs: 3,
        appliedJobs: 1,
        skippedJobs: 1,
        decisionIdsJson: JSON.stringify(["decision_3", "decision_2", "decision_1"]),
      },
    });
  });

  it("skips firm creation when company is unknown", async () => {
    const args = createArgs();
    args.extracted.company = null;
    args.parsed.company = null;
    args.prisma.jobPosting.upsert.mockResolvedValue({ id: "job_1", company: null });

    await persistJobAnalysisRecord(args as never);

    expect(args.prisma.firm.upsert).not.toHaveBeenCalled();
    expect(args.prisma.firm.update).not.toHaveBeenCalled();
    expect(args.prisma.jobPosting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({
          firmId: expect.anything(),
        }),
      }),
    );
  });
});
