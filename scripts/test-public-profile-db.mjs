import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
config({ path: ".env.local", quiet: true });
const { profileAccess, profileExtras, recordProfileVisit, equippedProfileAssets, receivedGiftWall } = await import("../src/lib/public-profile.js");
const { changeProfileRelationship } = await import("../src/lib/profile-relationships.js");
const { prisma } = await import("../src/lib/prisma.js");
const rollback = new Error("ROLLBACK_TEST"), origin = "https://portal.example";
try {
  await prisma.$transaction(async tx => {
    const createUser = name => tx.user.create({ data: { publicId: `USR-${randomUUID()}`, name, status: "ACTIVE" } });
    const viewer = await createUser("Viewer"), target = await createUser("Target");
    const db = new Proxy(tx, { get: (o, key) => key === "$transaction" ? fn => fn(tx) : o[key] });
    const invitation = await changeProfileRelationship(db, viewer.id, { action: "REQUEST", userPublicId: target.publicId, type: "CP" });
    await assert.rejects(changeProfileRelationship(db, viewer.id, { action: "ACCEPT", relationshipId: invitation.id }), { code: "RELATIONSHIP_RECIPIENT_REQUIRED" });
    await changeProfileRelationship(db, target.id, { action: "ACCEPT", relationshipId: invitation.id });
    const asset = await tx.uploadAsset.create({ data: { publicId: `AST-${randomUUID()}`, name: "Frame", category: "FRAMES", mimeType: "image/webp", fileName: "test.webp", fileSize: 1, fileData: Buffer.from([0]), isGlobal: true } });
    assert.equal((await equippedProfileAssets([target], origin, tx)).get(target.id).avatarFrame, null);
    await tx.userEquippedProp.create({ data: { userId: target.id, category: "FRAMES", assetId: asset.id } });
    assert.equal((await equippedProfileAssets([target], origin, tx)).get(target.id).avatarFrame.assetId, asset.publicId);
    await tx.userEquippedProp.deleteMany({ where: { userId: target.id } });
    assert.equal((await equippedProfileAssets([target], origin, tx)).get(target.id).avatarFrame, null);
    await recordProfileVisit(target.id, viewer.id, tx); await recordProfileVisit(target.id, viewer.id, tx);
    assert.equal((await tx.userProfileVisit.findUnique({ where: { targetId_visitorId: { targetId: target.id, visitorId: viewer.id } } })).visitCount, 1);
    const { target: loaded } = await profileAccess(viewer, target.publicId, tx);
    const result = await profileExtras(loaded, viewer, origin, tx);
    assert.equal(result.progression.user.lifetimePoints, "0"); assert.equal(result.relationships[0].partner.publicId, viewer.publicId); assert.deepEqual(result.medalWall.items, []);
    const medal = await tx.uploadAsset.create({ data: { publicId: `AST-${randomUUID()}`, name: "Earned medal", category: "MEDALS", mimeType: "image/webp", fileName: "medal.webp", fileSize: 1, fileData: Buffer.from([0]) } });
    await tx.userMedal.create({ data: { publicId: `MEDAL-${randomUUID()}`, userId: target.id, assetPublicId: medal.publicId, name: medal.name, pinned: true } });
    await tx.userMedal.create({ data: { publicId: `MEDAL-${randomUUID()}`, userId: target.id, assetPublicId: medal.publicId, name: "Expired", expiresAt: new Date(0) } });
    assert.equal((await profileExtras(loaded, viewer, origin, tx)).medalWall.items.length, 1);
    await tx.giftTransaction.create({ data: { senderId: viewer.id, recipientUserId: target.id, giftAssetId: asset.id, giftName: "Test", coinValue: 100n } });
    await tx.giftTransaction.create({ data: { senderId: viewer.id, recipientUserId: target.id, giftAssetId: asset.id, giftName: "Reversed", coinValue: 900n, reversedAt: new Date() } });
    assert.equal((await receivedGiftWall(target.id, origin, {}, tx)).items[0].totalCoins, "100");
    await tx.user.update({ where: { id: target.id }, data: { profilePrivate: true } });
    await assert.rejects(profileAccess(viewer, target.publicId, tx), { code: "PROFILE_PRIVATE" });
    await tx.userBlock.create({ data: { blockerId: viewer.id, blockedId: target.id } });
    await assert.rejects(profileAccess(viewer, target.publicId, tx), { code: "PROFILE_BLOCKED" });
    throw rollback;
  }, { timeout: 20000 });
} catch (error) { if (error !== rollback) throw error; console.log("PASS: equipment/unequip, visit throttling, progression, reversed gifts and profile privacy; fixtures rolled back."); }
finally { await prisma.$disconnect(); }
