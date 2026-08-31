import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function toTalentPublicId(publicId) {
  const match = /^(?:TN|TH|TS)-(.+)$/i.exec(publicId);
  if (!match) return null;
  return `TLN-${match[1]}`.toUpperCase();
}

try {
  const talents = await prisma.talent.findMany({
    select: { id: true, publicId: true },
    orderBy: { publicId: "asc" },
  });
  const migrations = talents
    .map((talent) => ({ ...talent, nextPublicId: toTalentPublicId(talent.publicId) }))
    .filter((talent) => talent.nextPublicId && talent.nextPublicId !== talent.publicId);
  const unsupported = talents.filter(
    (talent) => !talent.publicId.startsWith("TLN-") && !toTalentPublicId(talent.publicId),
  );

  if (unsupported.length) {
    throw new Error(`Unsupported Talent IDs: ${unsupported.map((talent) => talent.publicId).join(", ")}`);
  }
  const targetIds = migrations.map((talent) => talent.nextPublicId);
  if (new Set(targetIds).size !== targetIds.length) {
    throw new Error("Generated Talent public IDs are not unique.");
  }
  const collisions = targetIds.length
    ? await prisma.talent.findMany({
        where: { publicId: { in: targetIds } },
        select: { id: true, publicId: true },
      })
    : [];
  if (collisions.length) {
    throw new Error(`Talent public-ID collision: ${collisions.map((talent) => talent.publicId).join(", ")}`);
  }

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", migrations: migrations.map(({ publicId, nextPublicId }) => ({ publicId, nextPublicId })) }, null, 2));
  if (apply && migrations.length) {
    await prisma.$transaction(async (tx) => {
      for (const talent of migrations) {
        await tx.talent.update({
          where: { id: talent.id },
          data: { publicId: talent.nextPublicId },
        });
        await tx.auditLog.updateMany({
          where: { entityType: "Talent", entityId: talent.publicId },
          data: { entityId: talent.nextPublicId },
        });
        await tx.auditLog.create({
          data: {
            action: "TALENT_PUBLIC_ID_MIGRATED",
            category: "TALENT_MANAGEMENT",
            entityType: "Talent",
            entityId: talent.nextPublicId,
            description: `Migrated Talent public ID from ${talent.publicId} to ${talent.nextPublicId}.`,
            metadata: { previousPublicId: talent.publicId, publicId: talent.nextPublicId },
          },
        });
      }
    });
  }
} finally {
  await prisma.$disconnect();
}
