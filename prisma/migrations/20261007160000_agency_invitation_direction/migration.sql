ALTER TABLE "AgencyJoinRequest" ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'USER_REQUEST';
ALTER TABLE "AgencyJoinRequest" ADD CONSTRAINT "AgencyJoinRequest_direction_check" CHECK ("direction" IN ('USER_REQUEST','OWNER_INVITE'));
