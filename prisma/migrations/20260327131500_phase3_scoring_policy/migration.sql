ALTER TABLE "JobPosting" ADD COLUMN "normalizedJson" TEXT;
ALTER TABLE "JobPosting" ADD COLUMN "parseVersion" TEXT;

CREATE TABLE "ApplicationDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobPostingId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "policyAllowed" BOOLEAN NOT NULL,
    "reasons" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApplicationDecision_jobPostingId_fkey"
      FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);
