CREATE TABLE "ReportingCyclePolicy" (
  "id" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "days" INTEGER NOT NULL CHECK ("days" IN (15,30)),
  "revision" INTEGER NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "ReportingCyclePolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReportingCyclePolicy_module_revision_key" ON "ReportingCyclePolicy"("module","revision");
CREATE UNIQUE INDEX "ReportingCyclePolicy_module_effectiveFrom_key" ON "ReportingCyclePolicy"("module","effectiveFrom");
