ALTER TABLE "AudioRoomRole" ALTER COLUMN "grantedById" DROP NOT NULL, ADD COLUMN "adminGrantorId" TEXT, ADD COLUMN "adminGrantorName" TEXT;
ALTER TABLE "AudioRoomBan" ALTER COLUMN "actorId" DROP NOT NULL, ADD COLUMN "adminActorId" TEXT, ADD COLUMN "adminActorName" TEXT;
