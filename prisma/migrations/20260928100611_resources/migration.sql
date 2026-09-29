-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT,
    "siteName" TEXT,
    "filename" TEXT,
    "text" TEXT NOT NULL,
    "convertedFromTraditional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Resource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Resource_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnownWord" (
    "userId" TEXT NOT NULL,
    "hanzi" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "hanzi"),
    CONSTRAINT "KnownWord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Lesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'COURSE',
    "title" TEXT NOT NULL,
    "titleChinese" TEXT,
    "date" DATETIME NOT NULL,
    "notes" TEXT,
    "topics" JSONB NOT NULL,
    "processingStatus" TEXT NOT NULL DEFAULT 'UPLOADED',
    "extractionMethod" TEXT,
    "draft" JSONB,
    "analysisError" TEXT,
    "analysisWarnings" JSONB NOT NULL,
    "validatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lesson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Lesson" ("analysisError", "analysisWarnings", "createdAt", "date", "draft", "extractionMethod", "id", "notes", "processingStatus", "title", "titleChinese", "topics", "updatedAt", "userId", "validatedAt") SELECT "analysisError", "analysisWarnings", "createdAt", "date", "draft", "extractionMethod", "id", "notes", "processingStatus", "title", "titleChinese", "topics", "updatedAt", "userId", "validatedAt" FROM "Lesson";
DROP TABLE "Lesson";
ALTER TABLE "new_Lesson" RENAME TO "Lesson";
CREATE INDEX "Lesson_userId_date_idx" ON "Lesson"("userId", "date");
CREATE INDEX "Lesson_processingStatus_idx" ON "Lesson"("processingStatus");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'Moi',
    "dailyGoalMinutes" INTEGER NOT NULL DEFAULT 12,
    "newItemsPerSession" INTEGER NOT NULL DEFAULT 8,
    "maxReviewsPerSession" INTEGER NOT NULL DEFAULT 30,
    "ttsVoice" TEXT NOT NULL DEFAULT 'zh-CN-XiaoxiaoNeural',
    "hskLevel" INTEGER NOT NULL DEFAULT 2,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "dailyGoalMinutes", "id", "maxReviewsPerSession", "name", "newItemsPerSession", "ttsVoice", "updatedAt") SELECT "createdAt", "dailyGoalMinutes", "id", "maxReviewsPerSession", "name", "newItemsPerSession", "ttsVoice", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Resource_lessonId_key" ON "Resource"("lessonId");

-- CreateIndex
CREATE INDEX "Resource_userId_createdAt_idx" ON "Resource"("userId", "createdAt");
