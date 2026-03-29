CREATE TABLE "SystemLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detailsJson" TEXT,
    "runType" TEXT,
    "jobPostingId" TEXT,
    "jobUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SystemLog_jobPostingId_fkey"
      FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "JobReviewHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobPostingId" TEXT,
    "jobUrl" TEXT NOT NULL,
    "platform" TEXT,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "score" INTEGER,
    "threshold" INTEGER,
    "decision" TEXT,
    "policyAllowed" BOOLEAN,
    "reasons" TEXT NOT NULL,
    "summary" TEXT,
    "detailsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobReviewHistory_jobPostingId_fkey"
      FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SystemLog_createdAt_idx" ON "SystemLog"("createdAt");
CREATE INDEX "SystemLog_level_createdAt_idx" ON "SystemLog"("level", "createdAt");
CREATE INDEX "SystemLog_jobUrl_createdAt_idx" ON "SystemLog"("jobUrl", "createdAt");

CREATE INDEX "JobReviewHistory_jobUrl_createdAt_idx" ON "JobReviewHistory"("jobUrl", "createdAt");
CREATE INDEX "JobReviewHistory_status_createdAt_idx" ON "JobReviewHistory"("status", "createdAt");
CREATE INDEX "JobReviewHistory_source_createdAt_idx" ON "JobReviewHistory"("source", "createdAt");
