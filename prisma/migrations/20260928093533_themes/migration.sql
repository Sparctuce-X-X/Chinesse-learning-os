-- AlterTable
ALTER TABLE "KnowledgeItem" ADD COLUMN "themesClassifiedAt" DATETIME;

-- CreateTable
CREATE TABLE "Theme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    "description" TEXT,
    "source" TEXT NOT NULL DEFAULT 'AI',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Theme_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeTheme" (
    "knowledgeItemId" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'AI',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("knowledgeItemId", "themeId"),
    CONSTRAINT "KnowledgeTheme_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeTheme_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Theme_userId_name_key" ON "Theme"("userId", "name");

-- CreateIndex
CREATE INDEX "KnowledgeTheme_themeId_idx" ON "KnowledgeTheme"("themeId");
