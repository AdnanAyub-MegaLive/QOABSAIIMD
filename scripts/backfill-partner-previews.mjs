import { config } from "dotenv";
config({ path: process.env.AUDIT_ENV_FILE || ".env.local", quiet: true });
const { prisma } = await import("../src/lib/prisma.js");
const { mallItemWhere } = await import("../src/lib/partner-catalog.js");
const { ensurePreview, ffmpegAvailable, hasMotionSource, previewSourceVersion } = await import("../src/lib/partner-previews.js");
const apply = process.argv.includes("--apply");
const force = process.argv.includes("--force");
const batchArg = process.argv.find((arg) => arg.startsWith("--batch="));
const batchSize = Math.min(Math.max(Number(batchArg?.slice(8)) || 25, 1), 200);
const report = { mode: apply ? "APPLY" : "DRY_RUN", ffmpeg: await ffmpegAvailable(), scanned: 0, upToDate: 0, needed: 0, generated: 0, unavailable: [], failed: [] };
let cursor;
try {
  for (;;) {
    const rows = await prisma.uploadAsset.findMany({ where: mallItemWhere, orderBy: { id: "asc" }, take: batchSize, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, publicId: true, mimeType: true, mediaVersion: true, posterMediaVersion: true, partnerPreviews: { select: { kind: true, sourceVersion: true } } } });
    if (!rows.length) break;
    cursor = rows.at(-1).id;
    for (const asset of rows) {
      report.scanned += 1;
      for (const kind of hasMotionSource(asset) ? ["POSTER", "MOTION"] : ["POSTER"]) {
        const current = asset.partnerPreviews.find((p) => p.kind === kind);
        if (!force && current?.sourceVersion === previewSourceVersion(asset, kind)) { report.upToDate += 1; continue; }
        report.needed += 1;
        if (!apply) continue;
        try {
          const preview = await ensurePreview(prisma, asset, kind, { force });
          if (preview) report.generated += 1; else report.unavailable.push(`${asset.publicId}:${kind}`);
        } catch (error) { report.failed.push({ asset: asset.publicId, kind, error: error.message }); }
      }
    }
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await prisma.$disconnect();
}
