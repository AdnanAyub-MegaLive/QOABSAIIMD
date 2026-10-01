import { prisma } from "../prisma.js";

export async function writeEventLog({
  userId,
  eventId,
  action,
  ip,
  metadata,
  upload = false,
  publish = false,
}) {
  const writes = [
    prisma.eventAuditLog.create({
      data: {
        userId: userId ?? null,
        eventId: eventId ?? null,
        action,
        ip: ip ?? null,
        metadata: metadata ?? undefined,
      },
    }),
  ];
  if (upload)
    writes.push(
      prisma.uploadLog.create({
        data: {
          userId: userId ?? null,
          eventId: eventId ?? null,
          action,
          ip: ip ?? null,
          metadata: metadata ?? undefined,
        },
      }),
    );
  if (publish)
    writes.push(
      prisma.publishLog.create({
        data: {
          userId: userId ?? null,
          eventId: eventId ?? null,
          action,
        },
      }),
    );
  await prisma.$transaction(writes);
}
