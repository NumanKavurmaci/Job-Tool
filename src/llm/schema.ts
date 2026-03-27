import { z } from "zod";

export const ParsedJobSchema = z.object({
  title: z.string().nullable(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  platform: z.string().nullable(),
  seniority: z.string().nullable(),
  mustHaveSkills: z.array(z.string()).default([]),
  niceToHaveSkills: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  yearsRequired: z.number().nullable(),
  remoteType: z.string().nullable(),
  visaSponsorship: z.enum(["yes", "no"]).nullable(),
  workAuthorization: z
    .enum(["authorized", "requires-sponsorship", "unknown"])
    .nullable(),
});

export type ParsedJob = z.infer<typeof ParsedJobSchema>;
