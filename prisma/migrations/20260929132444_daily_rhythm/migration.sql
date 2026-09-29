-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'Moi',
    "dailyGoalMinutes" INTEGER NOT NULL DEFAULT 12,
    "newItemsPerSession" INTEGER NOT NULL DEFAULT 8,
    "newItemsPerDay" INTEGER NOT NULL DEFAULT 10,
    "maxReviewsPerSession" INTEGER NOT NULL DEFAULT 30,
    "ttsVoice" TEXT NOT NULL DEFAULT 'zh-CN-XiaoxiaoNeural',
    "hskLevel" INTEGER NOT NULL DEFAULT 2,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "dailyGoalMinutes", "hskLevel", "id", "maxReviewsPerSession", "name", "newItemsPerSession", "ttsVoice", "updatedAt") SELECT "createdAt", "dailyGoalMinutes", "hskLevel", "id", "maxReviewsPerSession", "name", "newItemsPerSession", "ttsVoice", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
