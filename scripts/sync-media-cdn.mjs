import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const { prisma } = await import("../src/lib/prisma.js");
const { mirrorAsset, spacesConfig } = await import("../src/lib/media-cdn.js");
const { canPublishMedia } = await import("../src/lib/media-cdn-policy.js");
const apply = process.argv.includes("--apply");
const retry = process.argv.includes("--force");
let cursor, eligible = 0, copied = 0, failed = 0;
try {
  if (apply && !spacesConfig()) throw new Error("Set MEDIA_CDN_ENABLED=true before applying.");
  for (;;) {
    // Select metadata first; never load the entire library's bytes into memory.
    const rows = await prisma.uploadAsset.findMany({
      where: { active: true, ...(retry ? {} : { cdnUrl: null }) },
      select: { id: true, publicId: true, category: true, mimeType: true, isGlobal: true, storeVisible: true, active: true, audioRoomId: true },
      orderBy: { id: "asc" }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) break;
    for (const row of rows) {
      if (!canPublishMedia(row)) continue;
      eligible++;
      if (!apply) continue;
      try {
        const asset = await prisma.uploadAsset.findUnique({ where: { id: row.id } });
        if (asset) { const result = await mirrorAsset(prisma, asset); if (result.cdnUrl) copied++; }
      } catch (error) { failed++; console.error("Mirror failed", row.publicId, error.name); }
    }
    cursor = rows.at(-1).id;
  }
  console.log({ mode: apply ? "APPLY" : "DRY RUN", eligible, copied, failed, originalsDeleted: 0 });
  if (failed) process.exitCode = 1;
} finally { await prisma.$disconnect(); }
