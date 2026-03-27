import type { ExtractedJobContent } from "../adapters/types.js";
import type { ParsedJob } from "../parser/parseJobWithLLM.js";

export type NormalizedJob = {
  title: string | null;
  company: string | null;
  location: string | null;
  remoteType: "remote" | "hybrid" | "onsite" | "unknown";
  seniority: "intern" | "junior" | "mid" | "senior" | "lead" | "staff" | "principal" | "unknown";
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  technologies: string[];
  yearsRequired: number | null;
  platform: string | null;
  visaSponsorship: "yes" | "no" | "unknown";
  workAuthorization: "authorized" | "requires-sponsorship" | "unknown";
  openQuestionsCount: number;
};

const TECH_KEYWORDS = [
  "TypeScript",
  "JavaScript",
  "Node.js",
  "React",
  "Next.js",
  "Prisma",
  "PostgreSQL",
  "SQL",
  "Python",
  "AWS",
  "Docker",
  "Kubernetes",
];

function uniqueNormalized(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }

  return result;
}

function canonicalizeRemoteType(value: string | null | undefined): NormalizedJob["remoteType"] {
  const normalized = value?.toLowerCase() ?? "";

  if (normalized.includes("remote")) {
    return "remote";
  }

  if (normalized.includes("hybrid")) {
    return "hybrid";
  }

  if (normalized.includes("onsite") || normalized.includes("on-site")) {
    return "onsite";
  }

  return "unknown";
}

function canonicalizeSeniority(
  title: string | null | undefined,
  seniority: string | null | undefined,
): NormalizedJob["seniority"] {
  const normalized = `${title ?? ""} ${seniority ?? ""}`.toLowerCase();

  if (normalized.includes("principal")) {
    return "principal";
  }

  if (normalized.includes("staff")) {
    return "staff";
  }

  if (normalized.includes("lead")) {
    return "lead";
  }

  if (normalized.includes("senior")) {
    return "senior";
  }

  if (normalized.includes("junior")) {
    return "junior";
  }

  if (normalized.includes("mid")) {
    return "mid";
  }

  if (normalized.includes("intern")) {
    return "intern";
  }

  return "unknown";
}

function inferTechnologies(
  values: Array<string | null | undefined>,
  extraTechnologies: string[] = [],
): string[] {
  const haystack = values.join(" ").toLowerCase();
  const inferred = TECH_KEYWORDS.filter((keyword) =>
    haystack.includes(keyword.toLowerCase()),
  );

  return uniqueNormalized([...extraTechnologies, ...inferred]);
}

function normalizeYearsRequired(value: number | null | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.round(value));
}

function countOpenQuestions(job: Omit<NormalizedJob, "openQuestionsCount">): number {
  const unknownFields = [
    job.title,
    job.company,
    job.location,
    job.platform,
    job.remoteType === "unknown" ? null : job.remoteType,
    job.seniority === "unknown" ? null : job.seniority,
    job.yearsRequired,
    job.technologies.length > 0 ? "known" : null,
  ].filter((value) => value == null).length;

  return unknownFields;
}

export function normalizeParsedJob(
  parsed: ParsedJob,
  extracted: ExtractedJobContent,
): NormalizedJob {
  const title = parsed.title ?? extracted.title ?? null;
  const company = parsed.company ?? extracted.company ?? null;
  const location = parsed.location ?? extracted.location ?? null;
  const mustHaveSkills = uniqueNormalized(parsed.mustHaveSkills);
  const niceToHaveSkills = uniqueNormalized(parsed.niceToHaveSkills);
  const technologies = inferTechnologies(
    [
      title,
      company,
      location,
      extracted.descriptionText,
      extracted.requirementsText,
      extracted.benefitsText,
      extracted.rawText,
      ...mustHaveSkills,
      ...niceToHaveSkills,
      ...(parsed.technologies ?? []),
    ],
    parsed.technologies ?? [],
  );

  const normalizedWithoutQuestions: Omit<NormalizedJob, "openQuestionsCount"> = {
    title,
    company,
    location,
    remoteType: canonicalizeRemoteType(parsed.remoteType),
    seniority: canonicalizeSeniority(title, parsed.seniority),
    mustHaveSkills,
    niceToHaveSkills,
    technologies,
    yearsRequired: normalizeYearsRequired(parsed.yearsRequired),
    platform: parsed.platform ?? extracted.platform ?? null,
    visaSponsorship:
      parsed.visaSponsorship === "yes" || parsed.visaSponsorship === "no"
        ? parsed.visaSponsorship
        : "unknown",
    workAuthorization:
      parsed.workAuthorization === "authorized" ||
      parsed.workAuthorization === "requires-sponsorship"
        ? parsed.workAuthorization
        : "unknown",
  };

  return {
    ...normalizedWithoutQuestions,
    openQuestionsCount: countOpenQuestions(normalizedWithoutQuestions),
  };
}
