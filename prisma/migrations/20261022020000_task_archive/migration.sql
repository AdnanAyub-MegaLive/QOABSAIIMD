-- Preserve task instances, claims and financial history when admins delete a task.
ALTER TABLE "DailyTaskDefinition" ADD COLUMN "deletedAt" TIMESTAMP(3);
