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

export interface CandidateDisabilityItem {
  type: string;
  percentage: number | null;
  notes: string | null;
}

export interface CandidateDisabilityProfile {
  hasDisability: boolean;
  disabilities: CandidateDisabilityItem[];
  requiresAccommodation: boolean | null;
  accommodationNotes: string | null;
  disclosurePreference: "manual-review" | "disclose" | "prefer-not-to-say";
}

export interface CandidateDemographicsProfile {
  gender: string | null;
  pronouns: string | null;
  ethnicity: string | null;
  race: string | null;
  veteranStatus: string | null;
  sexualOrientation: string | null;
}

export interface CandidateSalaryExpectations {
  usd: string | null;
  eur: string | null;
  try: string | null;
}

export interface CandidateExperienceOverrides {
  [normalizedKeyword: string]: number;
}

export interface CandidateRegionalAuthorization {
  defaultRequiresSponsorship: boolean | null;
  turkeyRequiresSponsorship: boolean | null;
  europeRequiresSponsorship: boolean | null;
}

export interface CandidateAvailability {
  noticePeriod: string | null;
  startDate: string | null;
  canStartImmediately: boolean | null;
}

export interface CandidateEmploymentReference {
  name: string;
  linkedinUrl: string;
  relationship: string | null;
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
  salaryExpectation: string | null;
  experienceOverrides: CandidateExperienceOverrides;
  workAuthorization: string | null;
  requiresSponsorship: boolean | null;
  regionalAuthorization?: CandidateRegionalAuthorization;
  availability?: CandidateAvailability;
  references?: CandidateEmploymentReference[];
  willingToRelocate: boolean | null;
  remotePreference: string | null;
  remoteOnly: boolean;
  demographics: CandidateDemographicsProfile;
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
