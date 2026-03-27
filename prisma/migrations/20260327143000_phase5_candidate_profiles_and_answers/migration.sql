CREATE TABLE "CandidateProfileSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT,
    "linkedinUrl" TEXT,
    "resumePath" TEXT,
    "profileJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "PreparedAnswerSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobPostingId" TEXT,
    "candidateProfileId" TEXT NOT NULL,
    "questionsJson" TEXT NOT NULL,
    "answersJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PreparedAnswerSet_jobPostingId_fkey"
      FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PreparedAnswerSet_candidateProfileId_fkey"
      FOREIGN KEY ("candidateProfileId") REFERENCES "CandidateProfileSnapshot" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);
