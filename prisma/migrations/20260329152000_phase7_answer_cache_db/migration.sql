-- CreateTable
CREATE TABLE "AnswerCacheEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "normalizedQuestion" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "answerJson" TEXT NOT NULL,
    "confidenceLabel" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "notesJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AnswerCacheEntry_normalizedQuestion_key" ON "AnswerCacheEntry"("normalizedQuestion");

-- CreateIndex
CREATE INDEX "AnswerCacheEntry_questionType_updatedAt_idx" ON "AnswerCacheEntry"("questionType", "updatedAt");
