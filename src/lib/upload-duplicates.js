import { createHash } from "node:crypto";
import { VIP_PRIVILEGES } from "./vip-contract";
import { uploadLibraryFilter } from "./upload-library-filter";

const artworkCategories = new Set(VIP_PRIVILEGES.map(p => p.category).filter(Boolean));

// Run inside the creation transaction. Serializing matching content prevents
// concurrent requests from both passing the lookup before either inserts.
export async function rejectDuplicateArtwork(tx, { category, bytes }) {
  if (!artworkCategories.has(category)) return;
  const hash = createHash("sha256").update(category).update("\0").update(bytes).digest();
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hash.readInt32BE(0)}::int, ${hash.readInt32BE(4)}::int)`;
  const existing = await tx.uploadAsset.findFirst({
    where: { ...uploadLibraryFilter, category, audioRoomId: null, fileSize: bytes.length, fileData: bytes },
    select: { publicId: true, active: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    throw Object.assign(new Error(`This artwork already exists as ${existing.publicId}. ${existing.active ? "Select the existing artwork instead of uploading it again. Edit its settings in Uploads if needed." : "Enable the existing artwork in Uploads before selecting it."}`), {
      code: "DUPLICATE_ARTWORK", assetId: existing.publicId,
    });
  }
}
