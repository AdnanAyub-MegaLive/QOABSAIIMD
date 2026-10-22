import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readWalletReconciliation } from "../src/lib/wallet-reconciliation.js";

config({ path: ".env.local", quiet: true });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  const rows = await db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return readWalletReconciliation(tx);
  }, { isolationLevel: "RepeatableRead", timeout: 60000 });
  const differences = rows.filter(row => row.status !== "MATCHED");
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(), mode: "READ_ONLY_DRY_RUN", changesApplied: 0,
    accountsChecked: rows.length, matched: rows.length - differences.length, requiresInvestigation: differences.length,
    basis: "Complete completed/pending ledger; separate personal/business Coins and Diamonds; untagged historical Coins interpreted as personal. Differences are NOT approved corrections.",
    ...(!process.argv.includes("--summary") ? { differences } : {}),
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ mode: "READ_ONLY_DRY_RUN", completed: false, changesApplied: 0, code: error.code ?? "AUDIT_FAILED", message: "Reconciliation could not run. Check database connectivity and applied migrations; no corrections were attempted." }));
  process.exitCode = 1;
} finally { await db.$disconnect(); }
