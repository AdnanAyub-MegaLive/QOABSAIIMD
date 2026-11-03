CREATE TABLE "PrettyIdGrant" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "pattern" TEXT NOT NULL CHECK ("pattern" ~ '^[A-G]{7}$'),
  "durationMinutes" INTEGER NOT NULL CHECK ("durationMinutes" BETWEEN 1 AND 52560000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignmentId" TEXT UNIQUE REFERENCES "SpecialIdAssignment"(id)
);
CREATE INDEX "PrettyIdGrant_userId_createdAt_idx" ON "PrettyIdGrant"("userId","createdAt");
