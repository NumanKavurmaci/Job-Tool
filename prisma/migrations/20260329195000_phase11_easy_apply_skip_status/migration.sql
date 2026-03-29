PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_JobReviewHistory" (
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
    CONSTRAINT "JobReviewHistory_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_JobReviewHistory" ("createdAt", "decision", "detailsJson", "id", "jobPostingId", "jobUrl", "platform", "policyAllowed", "reasons", "score", "source", "status", "summary", "threshold")
SELECT "createdAt", "decision", "detailsJson", "id", "jobPostingId", "jobUrl", "platform", "policyAllowed", "reasons", "score", "source", "status", "summary", "threshold" FROM "JobReviewHistory";
DROP TABLE "JobReviewHistory";
ALTER TABLE "new_JobReviewHistory" RENAME TO "JobReviewHistory";
CREATE INDEX "JobReviewHistory_jobUrl_createdAt_idx" ON "JobReviewHistory"("jobUrl", "createdAt");
CREATE INDEX "JobReviewHistory_status_createdAt_idx" ON "JobReviewHistory"("status", "createdAt");
CREATE INDEX "JobReviewHistory_source_createdAt_idx" ON "JobReviewHistory"("source", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
