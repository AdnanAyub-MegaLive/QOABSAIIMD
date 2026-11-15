ALTER TABLE "AudioRoom" ADD COLUMN "pinScope" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "AudioRoom" ADD CONSTRAINT "AudioRoom_pinScope_check" CHECK ("pinScope" IN ('NONE', 'COUNTRY', 'GLOBAL'));
