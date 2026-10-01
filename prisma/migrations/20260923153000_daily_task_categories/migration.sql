CREATE TABLE "DailyTaskCategory" (
  "key" TEXT NOT NULL,
  "icon" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyTaskCategory_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "DailyTaskCategory_active_sortOrder_idx" ON "DailyTaskCategory"("active", "sortOrder");

INSERT INTO "DailyTaskCategory" ("key","icon","sortOrder","updatedAt") VALUES
('Daily','calendar',10,CURRENT_TIMESTAMP),
('Social','people',20,CURRENT_TIMESTAMP),
('Live','live',30,CURRENT_TIMESTAMP),
('Explore','compass',40,CURRENT_TIMESTAMP),
('Special','star',50,CURRENT_TIMESTAMP);

ALTER TABLE "DailyTaskDefinition"
ADD CONSTRAINT "DailyTaskDefinition_categoryKey_fkey"
FOREIGN KEY ("categoryKey") REFERENCES "DailyTaskCategory"("key")
ON DELETE RESTRICT ON UPDATE CASCADE;
