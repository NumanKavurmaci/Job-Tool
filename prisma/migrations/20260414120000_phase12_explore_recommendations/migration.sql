-- CreateTable
CREATE TABLE "JobRecommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobPostingId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "policyAllowed" BOOLEAN NOT NULL,
    "summary" TEXT NOT NULL,
    "reasons" TEXT NOT NULL,
    "recommendationStatus" TEXT NOT NULL DEFAULT 'RECOMMENDED',
    "detailsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobRecommendation_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "JobRecommendation_jobPostingId_key" ON "JobRecommendation"("jobPostingId");

-- CreateIndex
CREATE INDEX "JobRecommendation_recommendationStatus_updatedAt_idx" ON "JobRecommendation"("recommendationStatus", "updatedAt");

-- CreateIndex
CREATE INDEX "JobRecommendation_decision_updatedAt_idx" ON "JobRecommendation"("decision", "updatedAt");
