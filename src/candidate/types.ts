export interface CandidateEducation {
  institution: string;
  degree: string | null;
  fieldOfStudy: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface CandidateExperience {
  company: string;
  title: string;
  summary: string | null;
  technologies: string[];
  startDate: string | null;
  endDate: string | null;
}

export interface CandidateProject {
  name: string;
  summary: string | null;
  technologies: string[];
}

export interface CandidateDisabilityProfile {
  hasVisualDisability: boolean;
  disabilityPercentage: number | null;
  requiresAccommodation: boolean | null;
  accommodationNotes: string | null;
  disclosurePreference: "manual-review" | "disclose" | "prefer-not-to-say";
}

export interface CandidateSalaryExpectations {
  usd: string | null;
  eur: string | null;
  try: string | null;
}

export interface CandidateProfile {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  summary: string | null;
  gpa: number | null;
  yearsOfExperienceTotal: number | null;
  currentTitle: string | null;
  preferredRoles: string[];
  preferredTechStack: string[];
  skills: string[];
  languages: string[];
  salaryExpectations: CandidateSalaryExpectations;
  workAuthorization: string | null;
  requiresSponsorship: boolean | null;
  willingToRelocate: boolean | null;
  remotePreference: string | null;
  remoteOnly: boolean;
  disability: CandidateDisabilityProfile;
  education: CandidateEducation[];
  experience: CandidateExperience[];
  projects: CandidateProject[];
  resumeText: string;
  sourceMetadata: {
    resumePath?: string;
    linkedinUrl?: string;
  };
}

export interface ParsedResume {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  summary: string | null;
  currentTitle: string | null;
  skills: string[];
  languages: string[];
  workAuthorization: string | null;
  requiresSponsorship: boolean | null;
  willingToRelocate: boolean | null;
  remotePreference: string | null;
  education: CandidateEducation[];
  experience: CandidateExperience[];
  projects: CandidateProject[];
  yearsOfExperienceTotal: number | null;
}
