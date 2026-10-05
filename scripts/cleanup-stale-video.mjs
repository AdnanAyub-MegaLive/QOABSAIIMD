import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const { prisma } = await import("../src/lib/prisma.js");
const { endStaleVideoLives } = await import("../src/lib/live-maintenance.js");
try { console.log(JSON.stringify(await endStaleVideoLives())); }
finally { await prisma.$disconnect(); }
