export const LEGACY_MAPPING_SOURCE = "MEGACHAT_LEGACY";

const ENTITY_CONFIG = {
  USER: {
    model: "user",
    relationKey: "userId",
    publicIdField: "publicId",
  },
  AUDIO_ROOM: {
    model: "audioRoom",
    relationKey: "audioRoomId",
    publicIdField: "roomId",
  },
};

export function normalizeLegacyId(value) {
  const normalized = String(value ?? "").trim();
  if (!/^[0-9]{1,32}$/.test(normalized)) {
    throw new Error("INVALID_LEGACY_ID");
  }
  return normalized;
}

export async function upsertLegacyIdMapping(
  tx,
  { entityType, legacyId, publicId, source = LEGACY_MAPPING_SOURCE, metadata },
) {
  const config = ENTITY_CONFIG[entityType];
  if (!config) throw new Error("INVALID_LEGACY_ENTITY_TYPE");
  const normalizedLegacyId = normalizeLegacyId(legacyId);
  const normalizedPublicId = String(publicId ?? "").trim();
  if (!normalizedPublicId) throw new Error("PUBLIC_ID_REQUIRED");

  const target = await tx[config.model].findUnique({
    where: { [config.publicIdField]: normalizedPublicId },
    select: { id: true },
  });
  if (!target) throw new Error(`${entityType}_PUBLIC_ID_NOT_FOUND`);

  const existing = await tx.legacyIdMapping.findUnique({
    where: {
      source_entityType_legacyId: {
        source,
        entityType,
        legacyId: normalizedLegacyId,
      },
    },
  });
  if (existing && existing.publicId !== normalizedPublicId) {
    throw new Error("LEGACY_ID_CONFLICT");
  }

  const mappingTarget = { userId: null, audioRoomId: null };
  mappingTarget[config.relationKey] = target.id;
  return tx.legacyIdMapping.upsert({
    where: {
      source_entityType_legacyId: {
        source,
        entityType,
        legacyId: normalizedLegacyId,
      },
    },
    create: {
      source,
      entityType,
      legacyId: normalizedLegacyId,
      publicId: normalizedPublicId,
      metadata: metadata ?? undefined,
      ...mappingTarget,
    },
    update: {
      metadata: metadata ?? undefined,
      ...mappingTarget,
    },
  });
}
