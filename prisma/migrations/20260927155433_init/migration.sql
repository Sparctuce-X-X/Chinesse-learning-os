-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'Moi',
    "dailyGoalMinutes" INTEGER NOT NULL DEFAULT 12,
    "newItemsPerSession" INTEGER NOT NULL DEFAULT 8,
    "maxReviewsPerSession" INTEGER NOT NULL DEFAULT 30,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lessonId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "extractedText" TEXT,
    "imagePages" JSONB NOT NULL,
    "pdfCreatedAt" DATETIME,
    "processingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourceDocument_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourcePage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL,
    "likelyImage" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "SourcePage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SourceDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "canonicalKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KnowledgeItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Vocabulary" (
    "knowledgeItemId" TEXT NOT NULL PRIMARY KEY,
    "hanzi" TEXT NOT NULL,
    "pinyin" TEXT,
    "pinyinSource" TEXT,
    "french" TEXT,
    "frenchSource" TEXT,
    "english" TEXT,
    "englishSource" TEXT,
    "partOfSpeech" TEXT,
    "notes" TEXT,
    CONSTRAINT "Vocabulary_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GrammarPoint" (
    "knowledgeItemId" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "structure" TEXT,
    "explanation" TEXT,
    "explanationSource" TEXT,
    "french" TEXT,
    "frenchSource" TEXT,
    "notes" TEXT,
    CONSTRAINT "GrammarPoint_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sentence" (
    "knowledgeItemId" TEXT NOT NULL PRIMARY KEY,
    "hanzi" TEXT NOT NULL,
    "pinyin" TEXT,
    "pinyinSource" TEXT,
    "french" TEXT,
    "frenchSource" TEXT,
    "english" TEXT,
    "englishSource" TEXT,
    "notes" TEXT,
    CONSTRAINT "Sentence_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LessonKnowledge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lessonId" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "sourcePage" INTEGER,
    "sourceText" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'MEDIUM',
    "highlighted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LessonKnowledge_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LessonKnowledge_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Example" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "knowledgeItemId" TEXT NOT NULL,
    "lessonId" TEXT,
    "hanzi" TEXT NOT NULL,
    "pinyin" TEXT,
    "french" TEXT,
    "english" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourcePage" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Example_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Example_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeacherCorrection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lessonId" TEXT NOT NULL,
    "knowledgeItemId" TEXT,
    "incorrect" TEXT NOT NULL,
    "correct" TEXT NOT NULL,
    "explanation" TEXT,
    "context" TEXT,
    "sourcePage" INTEGER,
    "sourceType" TEXT NOT NULL DEFAULT 'TEACHER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeacherCorrection_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeacherCorrection_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lessonId" TEXT,
    "knowledgeItemId" TEXT,
    "type" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "expectedAnswer" TEXT,
    "metadata" JSONB NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourcePage" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Exercise_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Exercise_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "knowledgeItemId" TEXT NOT NULL,
    "intervalDays" REAL NOT NULL DEFAULT 0,
    "ease" REAL NOT NULL DEFAULT 2.3,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "lastReviewAt" DATETIME,
    "nextReviewAt" DATETIME,
    "recognitionScore" REAL NOT NULL DEFAULT 0,
    "productionScore" REAL NOT NULL DEFAULT 0,
    "listeningScore" REAL NOT NULL DEFAULT 0,
    "pronunciationScore" REAL NOT NULL DEFAULT 0,
    "usageScore" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewState_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LearningSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DAILY',
    "plan" JSONB NOT NULL,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "reviewsCompleted" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "mistakesCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "LearningSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "sessionId" TEXT,
    "mistakeId" TEXT,
    "exerciseType" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "userAnswer" TEXT NOT NULL,
    "expectedAnswer" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "evaluationMethod" TEXT NOT NULL,
    "feedback" TEXT,
    "responseTimeMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewAttempt_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LearningSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReviewAttempt_mistakeId_fkey" FOREIGN KEY ("mistakeId") REFERENCES "Mistake" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Mistake" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "exerciseType" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "userAnswer" TEXT NOT NULL,
    "expectedAnswer" TEXT NOT NULL,
    "explanation" TEXT,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "reopenedCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Mistake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Mistake_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SpeakingAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "knowledgeItemId" TEXT,
    "sessionId" TEXT,
    "conversationId" TEXT,
    "prompt" TEXT NOT NULL,
    "targets" JSONB NOT NULL,
    "audioPath" TEXT,
    "transcription" TEXT NOT NULL,
    "inputMode" TEXT NOT NULL DEFAULT 'VOICE',
    "result" TEXT,
    "feedback" JSONB,
    "durationSeconds" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpeakingAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SpeakingAttempt_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SpeakingAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LearningSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SpeakingAttempt_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "setup" JSONB NOT NULL,
    "targets" JSONB NOT NULL,
    "summary" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConversationTurn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "hanzi" TEXT NOT NULL,
    "pinyin" TEXT,
    "french" TEXT,
    "inputMode" TEXT NOT NULL DEFAULT 'TEXT',
    "feedback" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationTurn_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AICache" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Lesson_userId_date_idx" ON "Lesson"("userId", "date");

-- CreateIndex
CREATE INDEX "Lesson_processingStatus_idx" ON "Lesson"("processingStatus");

-- CreateIndex
CREATE INDEX "SourceDocument_lessonId_idx" ON "SourceDocument"("lessonId");

-- CreateIndex
CREATE INDEX "SourceDocument_sha256_idx" ON "SourceDocument"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "SourcePage_documentId_pageNumber_key" ON "SourcePage"("documentId", "pageNumber");

-- CreateIndex
CREATE INDEX "KnowledgeItem_userId_type_idx" ON "KnowledgeItem"("userId", "type");

-- CreateIndex
CREATE INDEX "KnowledgeItem_userId_canonicalKey_idx" ON "KnowledgeItem"("userId", "canonicalKey");

-- CreateIndex
CREATE INDEX "Vocabulary_hanzi_idx" ON "Vocabulary"("hanzi");

-- CreateIndex
CREATE INDEX "Sentence_hanzi_idx" ON "Sentence"("hanzi");

-- CreateIndex
CREATE INDEX "LessonKnowledge_knowledgeItemId_idx" ON "LessonKnowledge"("knowledgeItemId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonKnowledge_lessonId_knowledgeItemId_key" ON "LessonKnowledge"("lessonId", "knowledgeItemId");

-- CreateIndex
CREATE INDEX "Example_knowledgeItemId_idx" ON "Example"("knowledgeItemId");

-- CreateIndex
CREATE INDEX "TeacherCorrection_lessonId_idx" ON "TeacherCorrection"("lessonId");

-- CreateIndex
CREATE INDEX "Exercise_lessonId_idx" ON "Exercise"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewState_knowledgeItemId_key" ON "ReviewState"("knowledgeItemId");

-- CreateIndex
CREATE INDEX "ReviewState_nextReviewAt_idx" ON "ReviewState"("nextReviewAt");

-- CreateIndex
CREATE INDEX "LearningSession_userId_startedAt_idx" ON "LearningSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "ReviewAttempt_knowledgeItemId_createdAt_idx" ON "ReviewAttempt"("knowledgeItemId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewAttempt_userId_createdAt_idx" ON "ReviewAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewAttempt_sessionId_idx" ON "ReviewAttempt"("sessionId");

-- CreateIndex
CREATE INDEX "Mistake_userId_resolvedAt_idx" ON "Mistake"("userId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Mistake_knowledgeItemId_category_key" ON "Mistake"("knowledgeItemId", "category");

-- CreateIndex
CREATE INDEX "SpeakingAttempt_userId_createdAt_idx" ON "SpeakingAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Conversation_userId_createdAt_idx" ON "Conversation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationTurn_conversationId_createdAt_idx" ON "ConversationTurn"("conversationId", "createdAt");
