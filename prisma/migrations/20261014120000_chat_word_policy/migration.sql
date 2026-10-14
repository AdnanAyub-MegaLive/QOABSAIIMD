CREATE TABLE "ChatWordPolicy" (
  "id" TEXT NOT NULL DEFAULT 'GLOBAL',
  "words" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "revision" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatWordPolicy_pkey" PRIMARY KEY ("id")
);
