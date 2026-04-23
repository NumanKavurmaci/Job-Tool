import { describe, expect, it } from "vitest";
import { normalizeParsedJob } from "../../src/domain/job.js";

describe("normalizeParsedJob", () => {
  it("infers seniority and remote type from job text when the LLM leaves them unknown", () => {
    const result = normalizeParsedJob(
      {
        title: "Software Engineer",
        company: "Acme",
        location: "Turkey",
        platform: "linkedin",
        seniority: null,
        mustHaveSkills: ["TypeScript"],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: 3,
        remoteType: null,
        visaSponsorship: null,
        workAuthorization: null,
      },
      {
        rawText:
          "We are hiring a Software Engineer for a fully remote role. This mid-level engineer will build TypeScript services.",
        title: "Software Engineer",
        company: "Acme",
        location: "Turkey",
        platform: "linkedin",
        applicationType: "easy_apply",
        applyUrl: "https://www.linkedin.com/jobs/view/1",
        currentUrl: "https://www.linkedin.com/jobs/view/1",
        descriptionText:
          "This is a fully remote opportunity for a mid-level software engineer.",
        requirementsText: "3+ years of experience with TypeScript.",
        benefitsText: null,
      },
    );

    expect(result.remoteType).toBe("remote");
    expect(result.seniority).toBe("mid");
  });

  it("does not misclassify generic company wording as a lead role", () => {
    const result = normalizeParsedJob(
      {
        title: "Full Stack Engineer",
        company: "Wide and Wise",
        location: "Turkey",
        platform: "linkedin",
        seniority: null,
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: null,
        remoteType: null,
        visaSponsorship: null,
        workAuthorization: null,
      },
      {
        rawText:
          "Wide and Wise is a leading consultancy hiring a Full Stack Engineer for a hybrid role.",
        title: "Full Stack Engineer",
        company: "Wide and Wise",
        location: "Turkey",
        platform: "linkedin",
        applicationType: "easy_apply",
        applyUrl: "https://www.linkedin.com/jobs/view/1",
        currentUrl: "https://www.linkedin.com/jobs/view/1",
        descriptionText:
          "Join our hybrid team as a Full Stack Engineer. We are a leading consultancy in the region.",
        requirementsText: "Experience with TypeScript and React.",
        benefitsText: null,
      },
    );

    expect(result.remoteType).toBe("hybrid");
    expect(result.seniority).toBe("mid");
  });

  it("detects explicit lead roles from role wording", () => {
    const result = normalizeParsedJob(
      {
        title: "Lead Backend Engineer",
        company: "Acme",
        location: "Remote",
        platform: "greenhouse",
        seniority: null,
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: null,
        remoteType: null,
        visaSponsorship: null,
        workAuthorization: null,
      },
      {
        rawText: "Lead Backend Engineer remote role",
        title: "Lead Backend Engineer",
        company: "Acme",
        location: "Remote",
        platform: "greenhouse",
        applicationType: "external",
        applyUrl: "https://example.com/apply",
        currentUrl: "https://example.com/job",
        descriptionText: "We are hiring a lead backend engineer.",
        requirementsText: null,
        benefitsText: null,
      },
    );

    expect(result.seniority).toBe("lead");
  });

  it("infers onsite and junior from descriptive text", () => {
    const result = normalizeParsedJob(
      {
        title: "Junior Software Developer",
        company: "Acme",
        location: "Istanbul",
        platform: "generic",
        seniority: null,
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: null,
        remoteType: null,
        visaSponsorship: null,
        workAuthorization: null,
      },
      {
        rawText:
          "This is an onsite, entry-level Junior Software Developer role based in Istanbul.",
        title: "Junior Software Developer",
        company: "Acme",
        location: "Istanbul",
        platform: "generic",
        applicationType: "unknown",
        applyUrl: "https://example.com/apply",
        currentUrl: "https://example.com/job",
        descriptionText:
          "An entry-level software developer role. This is an onsite position.",
        requirementsText: null,
        benefitsText: null,
      },
    );

    expect(result.remoteType).toBe("onsite");
    expect(result.seniority).toBe("junior");
  });

  it("does not infer junior only because the description mentions mentoring junior teammates", () => {
    const result = normalizeParsedJob(
      {
        title: "Full Stack Engineer",
        company: "Acme",
        location: "Remote",
        platform: "linkedin",
        seniority: null,
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: null,
        remoteType: null,
        visaSponsorship: null,
        workAuthorization: null,
      },
      {
        rawText:
          "We are hiring a Full Stack Engineer. You will mentor junior team members and contribute to architecture decisions.",
        title: "Full Stack Engineer",
        company: "Acme",
        location: "Remote",
        platform: "linkedin",
        applicationType: "easy_apply",
        applyUrl: "https://example.com/apply",
        currentUrl: "https://example.com/job",
        descriptionText:
          "You will mentor junior team members and collaborate across the stack.",
        requirementsText: null,
        benefitsText: null,
      },
    );

    expect(result.seniority).toBe("mid");
  });

  it("does not infer staff from company category wording like staffing and recruiting", () => {
    const result = normalizeParsedJob(
      {
        title: "Software Engineer (Fullstack)",
        company: "Crossing Hurdles",
        location: "Remote",
        platform: "linkedin",
        seniority: null,
        mustHaveSkills: ["Python", "React"],
        niceToHaveSkills: [],
        technologies: ["Python", "React"],
        yearsRequired: null,
        remoteType: "Remote",
        visaSponsorship: null,
        workAuthorization: null,
      },
      {
        rawText: [
          "Title: Software Engineer (Fullstack)",
          "Company: Crossing Hurdles",
          "Location: Remote",
          "Description:",
          "Position: Fullstack Developer (Python/React)",
          "Role Responsibilities",
          "Build backend APIs using Python and FastAPI.",
          "Requirements",
          "Strong experience with React and TypeScript.",
          "About the company",
          "Crossing Hurdles",
          "Staffing and Recruiting",
        ].join("\n"),
        title: "Software Engineer (Fullstack)",
        company: "Crossing Hurdles",
        location: "Remote",
        platform: "linkedin",
        applicationType: "easy_apply",
        applyUrl: "https://www.linkedin.com/jobs/view/4386852533/",
        currentUrl: "https://www.linkedin.com/jobs/view/4386852533/",
        descriptionText: [
          "Position: Fullstack Developer (Python/React)",
          "Role Responsibilities",
          "Build backend APIs using Python and FastAPI.",
        ].join("\n"),
        requirementsText: "Strong experience with React and TypeScript.",
        benefitsText: null,
      },
    );

    expect(result.seniority).toBe("mid");
  });

  it("does not infer intern from unrelated words in the body", () => {
    const result = normalizeParsedJob(
      {
        title: "Software Engineer",
        company: "Acme",
        location: "Remote",
        platform: "linkedin",
        seniority: null,
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: null,
        remoteType: null,
        visaSponsorship: null,
        workAuthorization: null,
      },
      {
        rawText:
          "Software Engineer role at an international company with distributed teams.",
        title: "Software Engineer",
        company: "Acme",
        location: "Remote",
        platform: "linkedin",
        applicationType: "easy_apply",
        applyUrl: "https://example.com/apply",
        currentUrl: "https://example.com/job",
        descriptionText:
          "Join our international engineering team as a software engineer.",
        requirementsText: null,
        benefitsText: null,
      },
    );

    expect(result.seniority).toBe("mid");
  });

  it("keeps remote type unknown when the text contains no remote signal", () => {
    const result = normalizeParsedJob(
      {
        title: "Backend Engineer",
        company: "Acme",
        location: "Berlin",
        platform: "generic",
        seniority: null,
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: null,
        remoteType: null,
        visaSponsorship: null,
        workAuthorization: null,
      },
      {
        rawText: "Backend Engineer role in Berlin.",
        title: "Backend Engineer",
        company: "Acme",
        location: "Berlin",
        platform: "generic",
        applicationType: "unknown",
        applyUrl: "https://example.com/apply",
        currentUrl: "https://example.com/job",
        descriptionText: "Build backend systems.",
        requirementsText: null,
        benefitsText: null,
      },
    );

    expect(result.remoteType).toBe("unknown");
  });

  it("normalizes unknown visa and work authorization fields when the parser does not know them", () => {
    const result = normalizeParsedJob(
      {
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote",
        platform: "generic",
        seniority: null,
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: null,
        remoteType: null,
        visaSponsorship: "maybe" as never,
        workAuthorization: "maybe" as never,
      },
      {
        rawText: "Remote backend engineer role.",
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote",
        platform: "generic",
        applicationType: "unknown",
        applyUrl: "https://example.com/apply",
        currentUrl: "https://example.com/job",
        descriptionText: "Remote backend role.",
        requirementsText: null,
        benefitsText: null,
      },
    );

    expect(result.visaSponsorship).toBe("unknown");
    expect(result.workAuthorization).toBe("unknown");
  });

  it("keeps explicit remote type and seniority when they are already known", () => {
    const result = normalizeParsedJob(
      {
        title: "Senior Backend Engineer",
        company: "Acme",
        location: "Berlin",
        platform: "greenhouse",
        seniority: "senior",
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: 5,
        remoteType: "hybrid",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
      },
      {
        rawText: "Senior Backend Engineer hybrid role",
        title: "Senior Backend Engineer",
        company: "Acme",
        location: "Berlin",
        platform: "greenhouse",
        applicationType: "external",
        applyUrl: "https://example.com/apply",
        currentUrl: "https://example.com/job",
        descriptionText: "Hybrid senior role",
        requirementsText: null,
        benefitsText: null,
      },
    );

    expect(result.remoteType).toBe("hybrid");
    expect(result.seniority).toBe("senior");
  });

  it.each([
    [{ title: "Principal Engineer", seniority: null }, "principal"],
    [{ title: "Platform Engineer", seniority: "staff" }, "staff"],
    [{ title: "Platform Engineer", seniority: "mid" }, "mid"],
    [{ title: "Platform Engineer", seniority: "intern" }, "intern"],
  ])("normalizes explicit seniority markers %o -> %s", (input, expected) => {
    const result = normalizeParsedJob(
      {
        title: input.title,
        company: "Acme",
        location: "Remote",
        platform: "generic",
        seniority: input.seniority as never,
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: 2,
        remoteType: "remote",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
      },
      {
        rawText: `${input.title} remote role`,
        title: input.title,
        company: "Acme",
        location: "Remote",
        platform: "generic",
        applicationType: "unknown",
        applyUrl: "https://example.com/apply",
        currentUrl: "https://example.com/job",
        descriptionText: "Remote role.",
        requirementsText: null,
        benefitsText: null,
      },
    );

    expect(result.seniority).toBe(expected);
  });

  it.each([
    ["on-site", "onsite"],
    ["work from home", "remote"],
    ["office-based", "onsite"],
    ["100% remote", "remote"],
  ])("infers remote type from text signal %s -> %s", (signal, expected) => {
    const result = normalizeParsedJob(
      {
        title: "Backend Engineer",
        company: "Acme",
        location: "Berlin",
        platform: "generic",
        seniority: null,
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: null,
        remoteType: null,
        visaSponsorship: null,
        workAuthorization: null,
      },
      {
        rawText: `Backend Engineer role. This is a ${signal} position.`,
        title: "Backend Engineer",
        company: "Acme",
        location: "Berlin",
        platform: "generic",
        applicationType: "unknown",
        applyUrl: "https://example.com/apply",
        currentUrl: "https://example.com/job",
        descriptionText: `This is a ${signal} role.`,
        requirementsText: null,
        benefitsText: null,
      },
    );

    expect(result.remoteType).toBe(expected);
  });

  it("prefers hybrid when the body also contains a negative remote disclaimer", () => {
    const result = normalizeParsedJob(
      {
        title: "Full Stack Engineer",
        company: "CEIBA TELE ICU",
        location: "Istanbul / Maslak",
        platform: "linkedin",
        seniority: null,
        mustHaveSkills: ["TypeScript", "Node.js"],
        niceToHaveSkills: [],
        technologies: ["TypeScript", "Node.js"],
        yearsRequired: 2,
        remoteType: "remote",
        visaSponsorship: null,
        workAuthorization: null,
      },
      {
        rawText: [
          "Location: Istanbul / Maslak",
          "Workplace Type: hybrid",
          "Fully remote work is not available for this role.",
        ].join("\n"),
        title: "Full Stack Engineer",
        company: "CEIBA TELE ICU",
        location: "Istanbul / Maslak",
        platform: "linkedin",
        applicationType: "external",
        applyUrl: "https://www.linkedin.com/jobs/view/4397794253/",
        currentUrl: "https://www.linkedin.com/jobs/view/4397794253/",
        descriptionText:
          "Workplace Type: hybrid. Fully remote work is not available for this role.",
        requirementsText: "TypeScript and Node.js experience.",
        benefitsText: null,
      },
    );

    expect(result.remoteType).toBe("hybrid");
  });

  it("overrides a noisy remote parsed guess when LinkedIn raw text explicitly says hybrid in Istanbul", () => {
    const result = normalizeParsedJob(
      {
        title: "Full Stack Engineer",
        company: "CEIBA TELE ICU",
        location: null,
        platform: "linkedin",
        seniority: "mid",
        mustHaveSkills: ["JavaScript", "TypeScript", "Node.js", "Java", "React"],
        niceToHaveSkills: ["PostgreSQL", "Docker"],
        technologies: ["JavaScript", "TypeScript", "Node.js", "Java", "React", "AWS"],
        yearsRequired: 2,
        remoteType: "remote",
        visaSponsorship: null,
        workAuthorization: null,
      },
      {
        rawText: [
          "Title: Full Stack Engineer",
          "Company: CEIBA TELE ICU",
          "Location: Istanbul / Maslak",
          "Workplace Type: hybrid",
          "Application Type: easy_apply",
          "Description:",
          "Ceiba embraces a hybrid work structure that combines office collaboration with flexibility.",
          "Fully remote work is not available for this role.",
          "Employment Type: Hybrid",
          "Location: Istanbul / Maslak",
        ].join("\n"),
        title: "Full Stack Engineer",
        company: "CEIBA TELE ICU",
        location: "Istanbul / Maslak",
        platform: "linkedin",
        applicationType: "easy_apply",
        applyUrl: "https://www.linkedin.com/jobs/view/4397794253",
        currentUrl: "https://www.linkedin.com/jobs/view/4397794253",
        descriptionText:
          "Ceiba embraces a hybrid work structure that combines office collaboration with flexibility. Fully remote work is not available for this role.",
        requirementsText:
          "Minimum 2 years of full stack development experience. Proficiency in JavaScript and TypeScript.",
        benefitsText: null,
      },
    );

    expect(result.location).toBe("Istanbul / Maslak");
    expect(result.remoteType).toBe("hybrid");
    expect(result.applicationType).toBe("easy_apply");
  });

  it("rounds valid years and discards invalid years", () => {
    const rounded = normalizeParsedJob(
      {
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote",
        platform: "generic",
        seniority: null,
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: 3.6,
        remoteType: "remote",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
      },
      {
        rawText: "Remote backend engineer role.",
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote",
        platform: "generic",
        applicationType: "unknown",
        applyUrl: "https://example.com/apply",
        currentUrl: "https://example.com/job",
        descriptionText: null,
        requirementsText: null,
        benefitsText: null,
      },
    );

    const invalid = normalizeParsedJob(
      {
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote",
        platform: "generic",
        seniority: null,
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: Number.NaN,
        remoteType: "remote",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
      },
      {
        rawText: "Remote backend engineer role.",
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote",
        platform: "generic",
        applicationType: "unknown",
        applyUrl: "https://example.com/apply",
        currentUrl: "https://example.com/job",
        descriptionText: null,
        requirementsText: null,
        benefitsText: null,
      },
    );

    expect(rounded.yearsRequired).toBe(4);
    expect(invalid.yearsRequired).toBeNull();
  });

  it("preserves the extracted application type on the normalized job", () => {
    const result = normalizeParsedJob(
      {
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote",
        platform: "linkedin",
        seniority: null,
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: null,
        remoteType: null,
        visaSponsorship: null,
        workAuthorization: null,
      },
      {
        rawText: "Easy Apply backend role.",
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote",
        platform: "linkedin",
        applicationType: "easy_apply",
        applyUrl: "https://linkedin.com/jobs/view/1",
        currentUrl: "https://linkedin.com/jobs/view/1",
        descriptionText: "Easy Apply backend role.",
        requirementsText: null,
        benefitsText: null,
      },
    );

    expect(result.applicationType).toBe("easy_apply");
  });

  it("prefers structured extracted location and workplace signals over a noisy parsed guess", () => {
    const result = normalizeParsedJob(
      {
        title: "Backend Developer",
        company: "Solid-ICT",
        location: "Europe",
        platform: "linkedin",
        seniority: null,
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: 5,
        remoteType: "remote",
        visaSponsorship: null,
        workAuthorization: null,
      },
      {
        rawText: [
          "Title: Backend Developer",
          "Company: Solid-ICT",
          "Location: Istanbul, Türkiye",
          "Workplace Type: hybrid",
          "Application Type: easy_apply",
          "About the company:",
          "We've done great work in Istanbul and have decided to bring the same quality of work to clients in Europe.",
        ].join("\n"),
        title: "Backend Developer",
        company: "Solid-ICT",
        location: "Istanbul, Türkiye",
        platform: "linkedin",
        applicationType: "easy_apply",
        applyUrl: "https://www.linkedin.com/jobs/view/4395042318/",
        currentUrl: "https://www.linkedin.com/jobs/view/4395042318/",
        descriptionText:
          "Design and develop scalable backend services and APIs. Hybrid collaboration model.",
        requirementsText:
          "Strong backend development experience (.NET, Node.js, Java, or similar).",
        benefitsText: null,
      },
    );

    expect(result.location).toBe("Istanbul, Türkiye");
    expect(result.remoteType).toBe("hybrid");
  });
});
