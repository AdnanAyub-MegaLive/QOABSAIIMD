ALTER TABLE "VipMembership" ADD COLUMN "disabledPrivileges" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
