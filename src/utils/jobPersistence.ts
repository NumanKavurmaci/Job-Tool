import type { ApplicationDecisionType } from "@prisma/client";
import type pino from "pino";
import type { ExtractedJobContent } from "../adapters/types.js";
import type { NormalizedJob } from "../domain/job.js";
import type { ParsedJob } from "../parser/parseJobWithLLM.js";

type PersistencePrisma = {
  firm: {
    upsert(args: {
      where: { name: string };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }): Promise<{ id: string; name: string; logoUrl?: string | null }>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<unknown>;
  };
  jobPosting: {
    upsert(args: Record<string, unknown>): Promise<{
      id: string;
      company?: string | null;
      title?: string | null;
      companyLogoUrl?: string | null;
      companyLinkedinUrl?: string | null;
      location?: string | null;
      platform?: string | null;
      parseVersion?: string | null;
    }>;
    findUnique?(args: Record<string, unknown>): Promise<{
      id: string;
      company?: string | null;
      title?: string | null;
      companyLogoUrl?: string | null;
      companyLinkedinUrl?: string | null;
      location?: string | null;
      platform?: string | null;
      parseVersion?: string | null;
    } | null>;
  };
  applicationDecision: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    findMany(args: Record<string, unknown>): Promise<
      Array<{
        id: string;
        decision: ApplicationDecisionType;
        jobPostingId: string;
      }>
    >;
  };
};

type PersistenceLogger = Pick<pino.Logger, "warn">;

function optionalDecisionCounts(decisions: Array<{
  id: string;
  decision: ApplicationDecisionType;
  jobPostingId: string;
}>) {
  const latestByJobPosting = new Map<
    string,
    { id: string; decision: ApplicationDecisionType; jobPostingId: string }
  >();

  for (const decision of decisions) {
    if (!latestByJobPosting.has(decision.jobPostingId)) {
      latestByJobPosting.set(decision.jobPostingId, decision);
    }
  }

  let appliedJobs = 0;
  let skippedJobs = 0;

  for (const decision of latestByJobPosting.values()) {
    if (decision.decision === "APPLY") {
      appliedJobs += 1;
      continue;
    }

    if (decision.decision === "SKIP") {
      skippedJobs += 1;
    }
  }

  return {
    totalReviewedJobs: latestByJobPosting.size,
    appliedJobs,
    skippedJobs,
    decisionIds: decisions.map((decision) => decision.id),
  };
}

async function syncFirm(args: {
  prisma: PersistencePrisma;
  company: string | null;
  companyLogoUrl: string | null;
  companyLinkedinUrl: string | null;
}): Promise<{ id: string; name: string; logoUrl?: string | null; linkedinUrl?: string | null } | null> {
  if (!args.company) {
    return null;
  }

  const firm = await args.prisma.firm.upsert({
    where: { name: args.company },
    update: {
      ...(args.companyLogoUrl ? { logoUrl: args.companyLogoUrl } : {}),
      ...(args.companyLinkedinUrl
        ? { linkedinUrl: args.companyLinkedinUrl }
        : {}),
    },
    create: {
      name: args.company,
      ...(args.companyLogoUrl ? { logoUrl: args.companyLogoUrl } : {}),
      ...(args.companyLinkedinUrl
        ? { linkedinUrl: args.companyLinkedinUrl }
        : {}),
    },
  });

  const decisions = await args.prisma.applicationDecision.findMany({
      where: {
        jobPosting: {
          firmId: firm.id,
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        decision: true,
        jobPostingId: true,
      },
    });

  const counts = optionalDecisionCounts(decisions);

  return args.prisma.firm.update({
    where: { id: firm.id },
    data: {
      ...(args.companyLogoUrl ? { logoUrl: args.companyLogoUrl } : {}),
      ...(args.companyLinkedinUrl
        ? { linkedinUrl: args.companyLinkedinUrl }
        : {}),
      totalReviewedJobs: counts.totalReviewedJobs,
      appliedJobs: counts.appliedJobs,
      skippedJobs: counts.skippedJobs,
      decisionIdsJson: JSON.stringify(counts.decisionIds),
    },
  }) as Promise<{ id: string; name: string; logoUrl?: string | null; linkedinUrl?: string | null }>;
}

export function jobPostingNeedsMetadataRefresh(jobPosting: {
  title?: string | null;
  company?: string | null;
  companyLogoUrl?: string | null;
  companyLinkedinUrl?: string | null;
  location?: string | null;
} | null): boolean {
  if (!jobPosting) {
    return true;
  }

  return [
    jobPosting.title,
    jobPosting.company,
    jobPosting.companyLogoUrl,
    jobPosting.companyLinkedinUrl,
    jobPosting.location,
  ].some((value) => value == null || value === "");
}

export async function refreshJobPostingMetadata(args: {
  prisma: PersistencePrisma;
  logger: PersistenceLogger;
  url: string;
  extracted: ExtractedJobContent;
}) {
  const firm = await syncFirm({
    prisma: args.prisma,
    company: args.extracted.company,
    companyLogoUrl: args.extracted.companyLogoUrl,
    companyLinkedinUrl: args.extracted.companyLinkedinUrl,
  });

  try {
    return await args.prisma.jobPosting.upsert({
      where: { url: args.url },
      update: {
        rawText: args.extracted.rawText,
        title: args.extracted.title,
        company: args.extracted.company,
        companyLogoUrl: args.extracted.companyLogoUrl,
        companyLinkedinUrl: args.extracted.companyLinkedinUrl,
        firmId: firm?.id ?? null,
        location: args.extracted.location,
        platform: args.extracted.platform,
      },
      create: {
        url: args.url,
        rawText: args.extracted.rawText,
        title: args.extracted.title,
        company: args.extracted.company,
        companyLogoUrl: args.extracted.companyLogoUrl,
        companyLinkedinUrl: args.extracted.companyLinkedinUrl,
        ...(firm?.id ? { firmId: firm.id } : {}),
        location: args.extracted.location,
        platform: args.extracted.platform,
      },
    });
  } catch (error) {
    args.logger.warn(
      {
        url: args.url,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to refresh job posting metadata",
    );
    throw error;
  }
}

export async function persistJobAnalysisRecord(args: {
  prisma: PersistencePrisma;
  logger: PersistenceLogger;
  url: string;
  extracted: ExtractedJobContent;
  parsed: ParsedJob;
  normalized: NormalizedJob;
  score: number;
  finalDecision: ApplicationDecisionType;
  policyAllowed: boolean;
  reasons: string[];
  parseVersion: string;
}) {
  const company = args.parsed.company ?? args.extracted.company;

  try {
    const firm = await syncFirm({
      prisma: args.prisma,
      company,
      companyLogoUrl: args.extracted.companyLogoUrl,
      companyLinkedinUrl: args.extracted.companyLinkedinUrl,
    });

    const jobPosting = await args.prisma.jobPosting.upsert({
      where: { url: args.url },
      update: {
        rawText: args.extracted.rawText,
        title: args.parsed.title ?? args.extracted.title,
        company,
        companyLogoUrl: args.extracted.companyLogoUrl,
        companyLinkedinUrl: args.extracted.companyLinkedinUrl,
        firmId: firm?.id ?? null,
        location: args.parsed.location ?? args.extracted.location,
        platform: args.parsed.platform ?? args.extracted.platform,
        parsedJson: JSON.stringify(args.parsed),
        normalizedJson: JSON.stringify(args.normalized),
        parseVersion: args.parseVersion,
      },
      create: {
        url: args.url,
        rawText: args.extracted.rawText,
        title: args.parsed.title ?? args.extracted.title,
        company,
        companyLogoUrl: args.extracted.companyLogoUrl,
        companyLinkedinUrl: args.extracted.companyLinkedinUrl,
        ...(firm?.id ? { firmId: firm.id } : {}),
        location: args.parsed.location ?? args.extracted.location,
        platform: args.parsed.platform ?? args.extracted.platform,
        parsedJson: JSON.stringify(args.parsed),
        normalizedJson: JSON.stringify(args.normalized),
        parseVersion: args.parseVersion,
      },
    });

    const applicationDecision = await args.prisma.applicationDecision.create({
      data: {
        jobPostingId: jobPosting.id,
        score: args.score,
        decision: args.finalDecision,
        policyAllowed: args.policyAllowed,
        reasons: JSON.stringify(args.reasons),
      },
    });

    if (jobPosting.company) {
      await syncFirm({
        prisma: args.prisma,
        company: jobPosting.company,
        companyLogoUrl: args.extracted.companyLogoUrl,
        companyLinkedinUrl: args.extracted.companyLinkedinUrl,
      });
    }

    return {
      jobPosting,
      applicationDecision,
    };
  } catch (error) {
    args.logger.warn(
      {
        url: args.url,
        company,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to persist job analysis record",
    );
    throw error;
  }
}

export async function persistDetectedAppliedJobRecord(args: {
  prisma: PersistencePrisma;
  logger: PersistenceLogger;
  url: string;
  extracted: ExtractedJobContent;
  reason: string;
}) {
  const company = args.extracted.company;

  try {
    const firm = await syncFirm({
      prisma: args.prisma,
      company,
      companyLogoUrl: args.extracted.companyLogoUrl,
      companyLinkedinUrl: args.extracted.companyLinkedinUrl,
    });

    const jobPosting = await args.prisma.jobPosting.upsert({
      where: { url: args.url },
      update: {
        rawText: args.extracted.rawText,
        title: args.extracted.title,
        company,
        companyLogoUrl: args.extracted.companyLogoUrl,
        companyLinkedinUrl: args.extracted.companyLinkedinUrl,
        firmId: firm?.id ?? null,
        location: args.extracted.location,
        platform: args.extracted.platform,
      },
      create: {
        url: args.url,
        rawText: args.extracted.rawText,
        title: args.extracted.title,
        company,
        companyLogoUrl: args.extracted.companyLogoUrl,
        companyLinkedinUrl: args.extracted.companyLinkedinUrl,
        ...(firm?.id ? { firmId: firm.id } : {}),
        location: args.extracted.location,
        platform: args.extracted.platform,
      },
    });

    const applicationDecision = await args.prisma.applicationDecision.create({
      data: {
        jobPostingId: jobPosting.id,
        score: 0,
        decision: "APPLY",
        policyAllowed: true,
        reasons: JSON.stringify([args.reason]),
      },
    });

    if (jobPosting.company) {
      await syncFirm({
        prisma: args.prisma,
        company: jobPosting.company,
        companyLogoUrl: args.extracted.companyLogoUrl,
        companyLinkedinUrl: args.extracted.companyLinkedinUrl,
      });
    }

    return {
      jobPosting,
      applicationDecision,
    };
  } catch (error) {
    args.logger.warn(
      {
        url: args.url,
        company,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to persist detected applied job record",
    );
    throw error;
  }
}
