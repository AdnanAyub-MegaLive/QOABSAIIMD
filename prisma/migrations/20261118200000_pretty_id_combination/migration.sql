CREATE TABLE "PrettyIdCombination" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "coinPrice" BIGINT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "storeVisible" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PrettyIdCombination_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PrettyIdCombination_pattern_key" ON "PrettyIdCombination"("pattern");
CREATE INDEX "PrettyIdCombination_active_storeVisible_idx" ON "PrettyIdCombination"("active", "storeVisible");
ALTER TABLE "SpecialIdDefinition" ADD COLUMN "combinationId" TEXT;
CREATE INDEX "SpecialIdDefinition_combinationId_idx" ON "SpecialIdDefinition"("combinationId");
ALTER TABLE "SpecialIdDefinition" ADD CONSTRAINT "SpecialIdDefinition_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "PrettyIdCombination"("id") ON DELETE SET NULL ON UPDATE CASCADE;
