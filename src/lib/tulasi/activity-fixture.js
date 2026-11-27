// Isolated SQL-test schema only; no connection to the application database.
export const tulasiActivitySchema = `
CREATE TABLE "WalletTransaction" (id text PRIMARY KEY, "userId" text, type text, direction text,
  status text DEFAULT 'COMPLETED', coins bigint, "referenceId" text, metadata jsonb, "createdAt" timestamp,
  UNIQUE ("userId", type, "referenceId"));
CREATE TABLE "TulasiGame" ("tulasiId" int PRIMARY KEY, name text);
`;
