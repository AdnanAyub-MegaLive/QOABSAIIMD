import { databaseTables } from "./database-management.js";
import { containsDatabaseReference } from "./database-reference-scan.js";
import { createHash } from "node:crypto";

const fail = (message, code) => Object.assign(new Error(message), { status: 409, code });
// Audit entries are retained; they do not constitute active asset usage.
export function unusedUploadDependencies(plan) {
  return plan.counts.filter(row => row.table !== "UploadAsset" && row.table !== "AuditLog" && row.count > 0);
}
export async function previewUnusedUpload(tx, assetId) {
  const asset = await tx.uploadAsset.findUnique({ where: { publicId: assetId }, select: { id: true, publicId: true, name: true, cdnUrl: true, posterCdnUrl: true, updatedAt: true } });
  if (!asset) throw Object.assign(new Error("Upload not found."), { status: 404, code: "ASSET_NOT_FOUND" });
  const columns = await tx.$queryRawUnsafe(`SELECT table_name::text AS "table", column_name::text AS name FROM information_schema.columns WHERE table_schema='public' AND (data_type IN ('text','character varying','json','jsonb') OR data_type='ARRAY') ORDER BY table_name,column_name`);
  const fields = new Map(), references = [];
  const quote = value => '"' + value.replaceAll('"', '""') + '"';
  for (const col of columns) {
    if (["AuditLog", "Admin", "_prisma_migrations"].includes(col.table)) continue;
    if (!fields.has(col.table)) fields.set(col.table, []);
    fields.get(col.table).push(col.name);
  }
  const identifiers = new Set([asset.id, asset.publicId]);
  for (const [name, names] of fields) {
    // Read identifiers/JSON only, never file blobs or credentials. Bound each scan
    // and refuse large datasets rather than claiming they are dependency-free.
    const rows = await tx.$queryRawUnsafe(`SELECT ctid::text AS locator,xmin::text AS version,(SELECT to_jsonb(d) FROM (SELECT ${names.map(quote).join(",")}) d) AS document FROM "public".${quote(name)} LIMIT 100001`);
    if (rows.length > 100000) throw fail("Dependency scan is too large. Use an offline maintenance plan.", "SELECTION_TOO_LARGE");
    const found = rows.filter(row => !(name === "UploadAsset" && row.document.id === asset.id) && containsDatabaseReference(row.document, identifiers));
    if (found.length) references.push([name, found.map(row => [row.locator, row.version]).sort()]);
  }
  const dependencies = references.map(([table, rows]) => ({ table, count: rows.length }));
  const plan = { counts: dependencies, fingerprint: createHash("sha256").update(JSON.stringify([asset, references])).digest("hex") };
  return { asset, plan, dependencies };
}
export async function deleteUnusedUpload(db, admin, approved) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Admin" WHERE id = ${admin.id} FOR SHARE`;
    const names = await databaseTables(tx);
    // Serialize reference discovery and deletion, including JSON configuration
    // writers. Never disable FK checks or cascade through the preview graph.
    const quoted = names.map(name => '"public"."' + name.replaceAll('"', '""') + '"');
    await tx.$executeRawUnsafe(`LOCK TABLE ${quoted.join(",")} IN SHARE ROW EXCLUSIVE MODE`);
    const actor = await tx.admin.findUnique({ where: { id: admin.id } });
    if (!actor?.active || actor.role !== "SUPER_ADMIN" || actor.sessionVersion !== admin.sessionVersion)
      throw Object.assign(new Error("Administrator session changed."), { status: 403, code: "FORBIDDEN" });
    const { asset, plan, dependencies } = await previewUnusedUpload(tx, approved.assetId);
    if (dependencies.length) throw fail("This upload is in use. Archive it instead.", "UPLOAD_IN_USE");
    if (plan.fingerprint !== approved.fingerprint) throw fail("Upload or references changed. Preview again.", "PREVIEW_STALE");
    await tx.uploadAsset.delete({ where: { id: asset.id }, select: { id: true } });
    await tx.auditLog.create({ data: { adminId: admin.id, action: "UNUSED_UPLOAD_PERMANENTLY_DELETED", category: "CONTENT_MANAGEMENT", entityType: "UploadAsset", entityId: asset.publicId, description: `Permanently removed unused upload ${asset.name} from the database.`, metadata: { externalMediaRetained: Boolean(asset.cdnUrl || asset.posterCdnUrl) } } });
    return { assetId: asset.publicId, externalMediaRetained: Boolean(asset.cdnUrl || asset.posterCdnUrl) };
  }, { timeout: 60000, maxWait: 5000 });
}
