-- Registration identity is separate from devices used for subsequent logins.
-- Historic Device rows do not reliably identify the registration device.
ALTER TABLE "User" ADD COLUMN "signupDeviceId" TEXT;
CREATE UNIQUE INDEX "User_signupDeviceId_key" ON "User"("signupDeviceId");
