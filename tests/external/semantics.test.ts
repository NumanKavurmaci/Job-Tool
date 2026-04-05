import { describe, expect, it } from "vitest";
import {
  analyzeFieldSemantics,
  annotateSemanticFields,
  inferSemanticKey,
  resolveSemanticExternalAnswer,
} from "../../src/external/semantics.js";

function buildField(overrides: Record<string, unknown> = {}) {
  return {
    key: "field",
    label: "Generic field",
    placeholder: null,
    helpText: null,
    options: [],
    selectorHints: [],
    type: "short_text",
    required: false,
    accept: null,
    ...overrides,
  } as any;
}

function buildCandidateProfile(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Jane Doe",
    email: "jane@example.com",
    phone: "+905416467889",
    location: "Samsun, TÃ¼rkiye",
    linkedinUrl: "https://linkedin.com/in/jane",
    githubUrl: "https://github.com/jane",
    portfolioUrl: "https://jane.dev",
    summary: null,
    gpa: null,
    yearsOfExperienceTotal: 4.4,
    currentTitle: null,
    preferredRoles: [],
    preferredTechStack: [],
    skills: [],
    languages: [],
    salaryExpectations: {
      usd: "80000",
      eur: "70000",
      try: "1500000",
    },
    salaryExpectation: null,
    experienceOverrides: {},
    workAuthorization: "Authorized to work in Turkey without sponsorship",
    requiresSponsorship: false,
    willingToRelocate: true,
    remotePreference: null,
    remoteOnly: false,
    regionalAuthorization: {
      defaultRequiresSponsorship: true,
      turkeyRequiresSponsorship: false,
      europeRequiresSponsorship: true,
    },
    disability: {
      hasVisualDisability: false,
      disabilityPercentage: null,
      requiresAccommodation: null,
      accommodationNotes: null,
      disclosurePreference: "manual-review",
    },
    education: [],
    experience: [],
    projects: [],
    resumeText: "",
    sourceMetadata: {
      resumePath: "./user/resume.pdf",
    },
    ...overrides,
  } as any;
}

describe("external semantics", () => {
  it("infers semantic keys across core field families", () => {
    expect(
      inferSemanticKey(
        buildField({
          key: "resume",
          label: "Upload Resume",
          type: "file",
        }),
      ),
    ).toBe("resume.upload");
    expect(
      inferSemanticKey(
        buildField({
          key: "coverLetter",
          label: "Cover Letter",
          type: "long_text",
        }),
      ),
    ).toBe("cover_letter.text");
    expect(
      inferSemanticKey(
        buildField({
          key: "workAuth",
          label: "Are you authorized to work here?",
        }),
      ),
    ).toBe("work.authorization");
    expect(
      inferSemanticKey(
        buildField({
          key: "sponsorWorkVisa",
          label: "Do you require sponsorship for a work visa?",
        }),
      ),
    ).toBe("sponsorship.required");
    expect(
      inferSemanticKey(
        buildField({
          key: "sponsorWorkVisaDetails",
          label: "Please provide more details so we can support you:",
          helpText: "Additional details",
        }),
      ),
    ).toBe("sponsorship.details");
    expect(
      inferSemanticKey(
        buildField({
          key: "relocate",
          label: "Are you willing to relocate?",
        }),
      ),
    ).toBe("relocation.willing");
    expect(
      inferSemanticKey(
        buildField({
          key: "city",
          label: "Current city",
        }),
      ),
    ).toBe("location.city");
    expect(
      inferSemanticKey(
        buildField({
          key: "countryCode",
          label: "Country code",
        }),
      ),
    ).toBe("phone.country_code");
    expect(
      inferSemanticKey(
        buildField({
          key: "phone",
          label: "Phone number",
        }),
      ),
    ).toBe("phone.number");
    expect(
      inferSemanticKey(
        buildField({
          key: "linkedin",
          label: "LinkedIn profile",
        }),
      ),
    ).toBe("profile.linkedin");
    expect(
      inferSemanticKey(
        buildField({
          key: "github",
          label: "GitHub",
        }),
      ),
    ).toBe("profile.github");
    expect(
      inferSemanticKey(
        buildField({
          key: "portfolio",
          label: "Personal website",
        }),
      ),
    ).toBe("profile.portfolio");
    expect(
      inferSemanticKey(
        buildField({
          key: "yoe",
          label: "Years of experience",
        }),
      ),
    ).toBe("experience.years");
    expect(inferSemanticKey(buildField())).toBeUndefined();
  });

  it("classifies salary variants, consent variants, and unmatched fields", () => {
    expect(
      analyzeFieldSemantics(
        buildField({
          key: "salaryCurrency",
          label: "Desired salary",
          type: "single_select",
          options: ["USD", "EUR", "TRY"],
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        semanticKey: "salary.currency",
        semanticConfidence: "high",
      }),
    );
    expect(
      analyzeFieldSemantics(
        buildField({
          key: "salaryPeriod",
          label: "Desired salary",
          type: "single_select",
          options: ["Hourly", "Weekly", "Monthly", "Yearly"],
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        semanticKey: "salary.period",
        semanticConfidence: "high",
      }),
    );
    expect(
      analyzeFieldSemantics(
        buildField({
          key: "salaryAmount",
          label: "Expected pay",
          type: "number",
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        semanticKey: "salary.amount",
      }),
    );
    expect(
      analyzeFieldSemantics(
        buildField({
          key: "smsConsent",
          label: "Receive SMS updates",
          type: "boolean",
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        semanticKey: "consent.sms",
      }),
    );
    expect(
      analyzeFieldSemantics(
        buildField({
          key: "privacy",
          label: "I agree to the privacy policy",
          type: "boolean",
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        semanticKey: "consent.privacy",
      }),
    );
    expect(analyzeFieldSemantics(buildField())).toEqual({ semanticSignals: [] });
  });

  it("annotates salary fields and react-select semantic fields as single_select while leaving unknown fields unchanged", () => {
    const fields = annotateSemanticFields([
      buildField({
        key: "salaryCurrency",
        label: "Desired salary",
        type: "short_text",
        options: ["USD", "EUR", "TRY"],
      }),
      buildField({
        key: "react-select-1-input",
        label: "countryCode",
        type: "short_text",
        selectorHints: ['[id="react-select-1-input"]'],
      }),
      buildField({
        key: "plain",
        label: "Why us?",
        type: "long_text",
      }),
    ]);

    expect(fields[0]).toEqual(
      expect.objectContaining({
        semanticKey: "salary.currency",
        type: "single_select",
      }),
    );
    expect(fields[1]).toEqual(
      expect.objectContaining({
        semanticKey: "phone.country_code",
        type: "single_select",
      }),
    );
    expect(fields[2]).toEqual(
      expect.objectContaining({
        key: "plain",
        label: "Why us?",
        type: "long_text",
      }),
    );
    expect(fields[2]).not.toHaveProperty("semanticKey");
  });

  it("resolves structured salary, work authorization, and sponsorship answers across branches", () => {
    const candidateProfile = buildCandidateProfile();

    expect(
      resolveSemanticExternalAnswer({
        field: buildField({
          key: "salary",
          label: "Desired rate per month (USD)",
          semanticKey: "salary.amount",
        }),
        candidateProfile,
        pageContext: {
          title: "US role",
          text: "Monthly USD compensation",
          sourceUrl: "https://example.com/us",
        },
      }),
    ).toEqual(
      expect.objectContaining({
        answer: "6667",
        resolutionStrategy: "semantic:salary-amount",
      }),
    );

    expect(
      resolveSemanticExternalAnswer({
        field: buildField({
          key: "salaryCurrency",
          label: "Salary currency",
          semanticKey: "salary.currency",
          options: ["Euro (EUR)", "US Dollar ($)"],
        }),
        candidateProfile: buildCandidateProfile({
          salaryExpectations: { usd: null, eur: "70000", try: null },
        }),
      }),
    ).toEqual(
      expect.objectContaining({
        answer: "Euro (EUR)",
        resolutionStrategy: "semantic:salary-currency",
      }),
    );

    expect(
      resolveSemanticExternalAnswer({
        field: buildField({
          key: "salaryPeriod",
          label: "Salary period",
          semanticKey: "salary.period",
          options: ["Monthly"],
        }),
        candidateProfile,
      }),
    ).toEqual(
      expect.objectContaining({
        answer: "Monthly",
        confidenceLabel: "medium",
      }),
    );

    expect(
      resolveSemanticExternalAnswer({
        field: buildField({
          key: "workAuth",
          label: "Work authorization",
          semanticKey: "work.authorization",
          options: ["I am authorized to work here without sponsorship", "I require sponsorship"],
        }),
        candidateProfile,
      }),
    ).toEqual(
      expect.objectContaining({
        answer: "I am authorized to work here without sponsorship",
        resolutionStrategy: "semantic:option-match:work-authorization",
      }),
    );

    expect(
      resolveSemanticExternalAnswer({
        field: buildField({
          key: "sponsorship",
          label: "Do you require sponsorship?",
          semanticKey: "sponsorship.required",
          options: ["Yes", "No"],
        }),
        candidateProfile,
        pageContext: {
          title: "Berlin role",
          text: "Europe based role",
          sourceUrl: "https://example.com/eu",
        },
      }),
    ).toEqual(
      expect.objectContaining({
        answer: "Yes",
        notes: "Resolved from the candidate's europe sponsorship preference.",
      }),
    );

    expect(
      resolveSemanticExternalAnswer({
        field: buildField({
          key: "sponsorship",
          label: "Do you require sponsorship?",
          semanticKey: "sponsorship.required",
        }),
        candidateProfile,
        pageContext: {
          title: "Unknown region",
          text: "",
          sourceUrl: "https://example.com/remote",
        },
      }),
    ).toEqual(
      expect.objectContaining({
        answer: "Yes",
        resolutionStrategy: "semantic:boolean:sponsorship",
        notes: "Resolved from the candidate's default regional sponsorship preference.",
      }),
    );
  });

  it("returns manual review outcomes when structured data is missing", () => {
    const candidateProfile = buildCandidateProfile({
      salaryExpectations: { usd: null, eur: null, try: null },
      workAuthorization: null,
      requiresSponsorship: null,
      willingToRelocate: null,
      location: null,
      phone: null,
      linkedinUrl: null,
      githubUrl: null,
      portfolioUrl: null,
      yearsOfExperienceTotal: null,
      sourceMetadata: { resumePath: null },
      regionalAuthorization: undefined,
    });

    expect(
      resolveSemanticExternalAnswer({
        field: buildField({ key: "salary", label: "Salary", semanticKey: "salary.amount" }),
        candidateProfile,
      }),
    ).toEqual(expect.objectContaining({ answer: null, confidenceLabel: "manual_review" }));
    expect(
      resolveSemanticExternalAnswer({
        field: buildField({
          key: "salaryCurrency",
          label: "Salary currency",
          semanticKey: "salary.currency",
          options: ["USD", "EUR"],
        }),
        candidateProfile,
      }),
    ).toEqual(expect.objectContaining({ answer: null, confidenceLabel: "manual_review" }));
    expect(
      resolveSemanticExternalAnswer({
        field: buildField({ key: "workAuth", label: "Work authorization", semanticKey: "work.authorization" }),
        candidateProfile,
      }),
    ).toEqual(expect.objectContaining({ answer: null, confidenceLabel: "manual_review" }));
    expect(
      resolveSemanticExternalAnswer({
        field: buildField({ key: "sponsorship", label: "Sponsorship", semanticKey: "sponsorship.required" }),
        candidateProfile,
      }),
    ).toEqual(expect.objectContaining({ answer: null, confidenceLabel: "manual_review" }));
    expect(
      resolveSemanticExternalAnswer({
        field: buildField({ key: "relocation", label: "Relocate", semanticKey: "relocation.willing" }),
        candidateProfile,
      }),
    ).toEqual(expect.objectContaining({ answer: null, confidenceLabel: "manual_review" }));
    expect(
      resolveSemanticExternalAnswer({
        field: buildField({ key: "city", label: "City", semanticKey: "location.city" }),
        candidateProfile,
      }),
    ).toEqual(expect.objectContaining({ answer: null, confidenceLabel: "manual_review" }));
    expect(
      resolveSemanticExternalAnswer({
        field: buildField({ key: "countryCode", label: "Country code", semanticKey: "phone.country_code" }),
        candidateProfile,
      }),
    ).toEqual(expect.objectContaining({ answer: null, confidenceLabel: "manual_review" }));
    expect(
      resolveSemanticExternalAnswer({
        field: buildField({ key: "phone", label: "Phone", semanticKey: "phone.number" }),
        candidateProfile,
      }),
    ).toEqual(expect.objectContaining({ answer: null, confidenceLabel: "manual_review" }));
    expect(
      resolveSemanticExternalAnswer({
        field: buildField({ key: "linkedin", label: "LinkedIn", semanticKey: "profile.linkedin" }),
        candidateProfile,
      }),
    ).toEqual(expect.objectContaining({ answer: null, confidenceLabel: "manual_review" }));
    expect(
      resolveSemanticExternalAnswer({
        field: buildField({ key: "github", label: "GitHub", semanticKey: "profile.github" }),
        candidateProfile,
      }),
    ).toEqual(expect.objectContaining({ answer: null, confidenceLabel: "manual_review" }));
    expect(
      resolveSemanticExternalAnswer({
        field: buildField({ key: "portfolio", label: "Portfolio", semanticKey: "profile.portfolio" }),
        candidateProfile,
      }),
    ).toEqual(expect.objectContaining({ answer: null, confidenceLabel: "manual_review" }));
    expect(
      resolveSemanticExternalAnswer({
        field: buildField({ key: "yoe", label: "Years of experience", semanticKey: "experience.years" }),
        candidateProfile,
      }),
    ).toEqual(expect.objectContaining({ answer: null, confidenceLabel: "manual_review" }));
    expect(
      resolveSemanticExternalAnswer({
        field: buildField({ key: "resume", label: "Resume", type: "file", semanticKey: "resume.upload" }),
        candidateProfile,
      }),
    ).toEqual(expect.objectContaining({ answer: null, confidenceLabel: "manual_review" }));
  });

  it("handles consent, cover-letter, detail, phone-country, and default branches", () => {
    const candidateProfile = buildCandidateProfile({
      requiresSponsorship: true,
      regionalAuthorization: undefined,
      location: "Berlin, Germany",
      phone: "+49123456789",
    });

    expect(
      resolveSemanticExternalAnswer({
        field: buildField({
          key: "sponsorshipDetails",
          label: "Provide more details",
          semanticKey: "sponsorship.details",
        }),
        candidateProfile,
      }),
    ).toEqual(
      expect.objectContaining({
        answer:
          "I would require visa sponsorship for this opportunity based on the role location and work authorization requirements.",
      }),
    );

    expect(
      resolveSemanticExternalAnswer({
        field: buildField({
          key: "countryCode",
          label: "Country code",
          semanticKey: "phone.country_code",
        }),
        candidateProfile,
      }),
    ).toEqual(expect.objectContaining({ answer: "Germany (+49)" }));

    expect(
      resolveSemanticExternalAnswer({
        field: buildField({
          key: "phone",
          label: "Phone number",
          semanticKey: "phone.number",
        }),
        candidateProfile,
        pageContext: {
          title: "General form",
          text: "Single phone input without separate dial selector",
          sourceUrl: "https://example.com/direct-phone",
        },
      }),
    ).toEqual(
      expect.objectContaining({
        answer: "+49123456789",
        resolutionStrategy: "semantic:phone-direct",
      }),
    );

    expect(
      resolveSemanticExternalAnswer({
        field: buildField({
          key: "smsConsent",
          label: "SMS consent",
          semanticKey: "consent.sms",
        }),
        candidateProfile,
      }),
    ).toEqual(expect.objectContaining({ source: "manual" }));

    expect(
      resolveSemanticExternalAnswer({
        field: buildField({
          key: "privacyConsent",
          label: "I agree to the privacy policy",
          semanticKey: "consent.privacy",
          required: true,
        }),
        candidateProfile,
      }),
    ).toEqual(
      expect.objectContaining({
        answer: "Yes",
        source: "policy",
        confidenceLabel: "high",
      }),
    );

    expect(
      resolveSemanticExternalAnswer({
        field: buildField({
          key: "coverLetterUpload",
          label: "Cover letter",
          type: "file",
          semanticKey: "cover_letter.upload",
        }),
        candidateProfile,
      }),
    ).toEqual(expect.objectContaining({ source: "manual" }));

    expect(
      resolveSemanticExternalAnswer({
        field: buildField({
          key: "unknown",
          label: "Unknown",
        }),
        candidateProfile,
      }),
    ).toBeNull();
  });
});
