import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { pruneExpiredMessages } from "../src/lib/message-retention.js";
config({ path: ".env.local", quiet: true });
const { prisma } = await import("../src/lib/prisma.js");
const rollback = new Error("ROLLBACK_TEST");
try {
  await prisma.$transaction(async tx => {
    const db = new Proxy(tx, { get: (obj, key) => key === "$transaction" ? fn => fn(tx) : obj[key] });
    // Historic fixture dates avoid touching modern application records.
    const now = new Date("1800-02-01T00:00:00Z");
    const old = new Date("1799-01-01T00:00:00Z");
    const boundary = new Date(now.getTime() - 30 * 86400000);
    const user = await tx.user.create({ data: { publicId: `USR-${randomUUID()}`, name: "Retention test" } });
    for (const kind of ["DIRECT", "GROUP", "WORLD"]) {
      const conversation = await tx.conversation.create({ data: { publicId: `CONV-${randomUUID()}`, kind } });
      const message = await tx.message.create({ data: { publicId: `MSG-${randomUUID()}`, conversationId: conversation.id, senderId: user.id, body: "expired", createdAt: old } });
      await tx.messageReceipt.create({ data: { messageId: message.id, userId: user.id } });
      await tx.message.create({ data: { publicId: `MSG-${randomUUID()}`, conversationId: conversation.id, senderId: user.id, body: "boundary retained", createdAt: boundary } });
    }
    await tx.audioRoomMessage.create({ data: { publicId: `ARM-${randomUUID()}`, roomPublicId: "ROOM-test", roomTitle: "Test", senderPublicId: user.publicId, senderName: user.name, body: "expired", createdAt: old } });
    const notification = await tx.notification.create({ data: { publicId: `NOT-${randomUUID()}`, userId: user.id, title: "Preserve", body: "system", createdAt: old } });
    const result = await pruneExpiredMessages(db, now);
    assert.equal(result.messages, 3); assert.equal(result.roomMessages, 1);
    assert.equal(await tx.messageReceipt.count({ where: { userId: user.id } }), 0);
    assert.equal(await tx.message.count({ where: { senderId: user.id } }), 3);
    assert.ok(await tx.notification.findUnique({ where: { id: notification.id } }));
    throw rollback;
  }, { timeout: 20000 });
} catch (error) { if (error !== rollback) throw error; console.log("PASS: 30-day chat cleanup, boundary preservation, cascading receipts, system notification exclusion; fixtures rolled back."); }
finally { await prisma.$disconnect(); }
