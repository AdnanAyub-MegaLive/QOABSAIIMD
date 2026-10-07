import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { updateProfileWithHistory, readAvatarHistory } from "../src/lib/avatar-history.js";
config({ path: ".env.local", quiet: true });
const { prisma } = await import("../src/lib/prisma.js");
const rollback = new Error("ROLLBACK_TEST");
try {
  await prisma.$transaction(async tx => {
    const db = new Proxy(tx, { get: (object, key) => key === "$transaction" ? fn => fn(tx) : object[key] });
    await tx.userProfileSettings.upsert({ where: { id: "default" }, create: { id: "default", avatarHistoryLimit: 20 }, update: { avatarHistoryLimit: 20 } });
    const user = await tx.user.create({ data: { publicId: `USR-${randomUUID()}`, name: "Avatar test", profileImage: "avatar:first" } });
    assert.deepEqual(await readAvatarHistory(db, user.id, "https://portal.example"), []);
    for (let n = 0; n < 25; n++) await updateProfileWithHistory(db, user.id, { profileImage: `avatar:item${n}` });
    assert.equal(await tx.userAvatarHistory.count({ where: { userId: user.id } }), 20);
    const history = await readAvatarHistory(db, user.id, "https://portal.example");
    assert.equal(history[0].imageUrl, "avatar:item23");
    assert.equal(history.some(row => row.imageUrl === "avatar:item24"), false);
    await updateProfileWithHistory(db, user.id, { profileImage: "avatar:item23" });
    assert.equal((await readAvatarHistory(db, user.id, "https://portal.example")).some(row => row.imageUrl === "avatar:item23"), false);
    throw rollback;
  }, { timeout: 20000 });
} catch (error) { if (error !== rollback) throw error; console.log("PASS: avatar archival, newest ordering, retention, restoration exclusion; fixtures rolled back."); }
finally { await prisma.$disconnect(); }
