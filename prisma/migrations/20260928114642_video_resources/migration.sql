-- AlterTable
ALTER TABLE "Resource" ADD COLUMN "durationSec" INTEGER;
ALTER TABLE "Resource" ADD COLUMN "mediaId" TEXT;
ALTER TABLE "Resource" ADD COLUMN "segments" JSONB;
ALTER TABLE "Resource" ADD COLUMN "transcriptSource" TEXT;
