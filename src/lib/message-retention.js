export const MESSAGE_RETENTION_DAYS = 30;
export const MESSAGE_RETENTION_INTERVAL_MS = 5 * 60 * 1000;

// Small transactions avoid holding locks across an entire historical backlog.
// Notifications and NotificationRead are intentionally never touched.
export async function pruneExpiredMessages(db, now = new Date(), { batchSize = 500, maxBatches = 20 } = {}) {
  const cutoff = new Date(now.getTime() - MESSAGE_RETENTION_DAYS * 86400000);
  if (!Number.isFinite(cutoff.getTime()) || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000 || !Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 100)
    throw new Error("Invalid message retention parameters.");
  const totals = { messages: 0, roomMessages: 0, cutoff: cutoff.toISOString() };
  for (let batch = 0; batch < maxBatches; batch++) {
    const counts = await db.$transaction(async tx => {
      const deleted = await tx.$queryRaw`
        DELETE FROM "Message" WHERE id IN (
          SELECT id FROM "Message" WHERE "createdAt" < ${cutoff}
          ORDER BY "createdAt", id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
        ) RETURNING "conversationId"
      `;
      // Refresh the inbox sort timestamp, including conversations now empty.
      for (const conversationId of new Set(deleted.map(row => row.conversationId))) {
        await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversationId} FOR UPDATE`;
        await tx.$executeRaw`
          UPDATE "Conversation" SET "lastMessageAt" = (
            SELECT MAX("createdAt") FROM "Message" WHERE "conversationId" = ${conversationId}
          ) WHERE id = ${conversationId}
        `;
      }
      const roomMessages = await tx.$executeRaw`
        DELETE FROM "AudioRoomMessage" WHERE id IN (
          SELECT id FROM "AudioRoomMessage" WHERE "createdAt" < ${cutoff}
          ORDER BY "createdAt", id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
        )
      `;
      return { messages: deleted.length, roomMessages };
    });
    totals.messages += counts.messages;
    totals.roomMessages += counts.roomMessages;
    if (counts.messages < batchSize && counts.roomMessages < batchSize) break;
  }
  return totals;
}

export function startMessageRetention(db, logger = console) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await pruneExpiredMessages(db);
      if (result.messages || result.roomMessages) logger.info("Expired chat messages permanently deleted", result);
    } catch (error) { logger.error("Message retention cleanup failed", error); }
    finally { running = false; }
  };
  void run();
  const timer = setInterval(run, MESSAGE_RETENTION_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
