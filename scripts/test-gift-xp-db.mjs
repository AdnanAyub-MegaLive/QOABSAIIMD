import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
config({ path: ".env.local", quiet: true });
const { prisma } = await import("../src/lib/prisma.js");
const { awardGiftProgress, progressionSnapshots } = await import("../src/lib/progression.js");
const rollback = new Error("TEST_ROLLBACK");
try {
  await prisma.$transaction(async tx => {
    const sender = await tx.user.create({ data: { publicId: `TEST-${randomUUID()}`, name: "XP sender" } });
    const recipient = await tx.user.create({ data: { publicId: `TEST-${randomUUID()}`, name: "XP host", appRoles: ["HOST"] } });
    for (const category of ["GIFTS", "LIVE_GIFTS"]) {
      const asset = await tx.uploadAsset.create({ data: { publicId: `AST-${randomUUID()}`, name: "XP test", category, fileName: "test.webp", mimeType: "image/webp", fileSize: 0, fileData: Buffer.alloc(0), coinPrice: 1n, senderXp: 450n, receiverXp: 225n } });
      const gift = await tx.giftTransaction.create({ data: { senderId: sender.id, recipientUserId: recipient.id, giftAssetId: asset.id, giftName: asset.name, quantity: 2, coinValue: 2n } });
      const input = { sender, recipient, gift, source: "PAID", gross: 2n, credit: 1n, recipientType: "HOST" };
      await awardGiftProgress(tx, input);
      await awardGiftProgress(tx, input);
    }
    const user = (await progressionSnapshots(sender.id, null, tx)).find(r => r.type === "USER");
    const charm = (await progressionSnapshots(recipient.id, null, tx)).find(r => r.type === "CHARM");
    assert.equal(user.lifetimePoints, "1800");
    assert.equal(charm.lifetimePoints, "900");
    assert.equal(await tx.progressLedger.count({ where: { userId: { in: [sender.id, recipient.id] } } }), 4);
    assert.equal(await tx.realtimeOutbox.count({ where: { channel: { in: [`user:${sender.publicId}`, `user:${recipient.publicId}`] }, event: "progression:updated" } }), 4);
    throw rollback;
  }, { isolationLevel: "Serializable", timeout: 15000 });
} catch (e) {
  if (e !== rollback) throw e;
  console.log("PASS: audio/live asset XP, quantities, duplicate protection, ledger, REST snapshots and outbox; all fixtures rolled back.");
} finally { await prisma.$disconnect(); }
