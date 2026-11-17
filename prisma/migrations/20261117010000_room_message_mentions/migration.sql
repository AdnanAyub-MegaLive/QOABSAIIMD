ALTER TABLE "AudioRoomMessage" ADD COLUMN "mentions" JSONB NOT NULL DEFAULT '[]'::jsonb;
