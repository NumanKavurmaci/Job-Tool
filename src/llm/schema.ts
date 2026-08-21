import { z } from "zod";

const nullableText = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(maxLength).nullable(),
  );

const stringList = z
  .array(z.string().trim().min(1).max(160))
  .max(100)
  .transform((items) => [...new Set(items)])
  .default([]);

export const ParsedJobSchema = z
  .object({
    title: nullableText(300),
    company: nullableText(300),
    location: nullableText(500),
    platform: nullableText(120),
    seniority: nullableText(120),
    mustHaveSkills: stringList,
    niceToHaveSkills: stringList,
    technologies: stringList,
    yearsRequired: z.number().int().min(0).max(80).nullable(),
    remoteType: nullableText(120),
    visaSponsorship: z.enum(["yes", "no"]).nullable(),
    workAuthorization: z
      .enum(["authorized", "requires-sponsorship", "unknown"])
      .nullable(),
  })
  .strict();

export const parsedJobJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "company",
    "location",
    "platform",
    "seniority",
    "mustHaveSkills",
    "niceToHaveSkills",
    "technologies",
    "yearsRequired",
    "remoteType",
    "visaSponsorship",
    "workAuthorization",
  ],
  properties: {
    title: { type: ["string", "null"], maxLength: 300 },
    company: { type: ["string", "null"], maxLength: 300 },
    location: { type: ["string", "null"], maxLength: 500 },
    platform: { type: ["string", "null"], maxLength: 120 },
    seniority: { type: ["string", "null"], maxLength: 120 },
    mustHaveSkills: {
      type: "array",
      maxItems: 100,
      items: { type: "string", minLength: 1, maxLength: 160 },
    },
    niceToHaveSkills: {
      type: "array",
      maxItems: 100,
      items: { type: "string", minLength: 1, maxLength: 160 },
    },
    technologies: {
      type: "array",
      maxItems: 100,
      items: { type: "string", minLength: 1, maxLength: 160 },
    },
    yearsRequired: { type: ["integer", "null"], minimum: 0, maximum: 80 },
    remoteType: { type: ["string", "null"], maxLength: 120 },
    visaSponsorship: { type: ["string", "null"], enum: ["yes", "no", null] },
    workAuthorization: {
      type: ["string", "null"],
      enum: ["authorized", "requires-sponsorship", "unknown", null],
    },
  },
};

export type ParsedJob = z.infer<typeof ParsedJobSchema>;
