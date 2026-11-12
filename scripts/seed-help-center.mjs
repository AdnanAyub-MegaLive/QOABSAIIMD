import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { importHelpSeed, parseHelpSeed } from "../src/lib/help-center-seed.js";
import { hasPermission } from "../src/lib/portal-permissions.js";
dotenv.config({ path: ".env.local", quiet: true });
const bundled = process.argv[2] === "--bundled";
const file = bundled ? new URL("../prisma/help_center_seed.json", import.meta.url) : process.argv[2];
if (!file) throw new Error("Usage: node scripts/seed-help-center.mjs /path/to/help_center_seed.json [admin-email]");
const seed = JSON.parse(await readFile(file, "utf8"));
parseHelpSeed(seed);
const email = (process.argv[3] || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
if (!bundled && !email) throw new Error("Provide the email of the administrator importing this content.");
const { prisma } = await import("../src/lib/prisma.js");
try {
  const admin = bundled ? { id: null, source: "deployment:bundled-help-center" } : await prisma.admin.findUnique({ where: { email } });
  if (!bundled && !hasPermission(admin, "help_center.manage")) throw new Error("This administrator needs help_center.manage permission.");
  console.log(JSON.stringify(await importHelpSeed(prisma, admin, seed)));
} finally { await prisma.$disconnect(); }
