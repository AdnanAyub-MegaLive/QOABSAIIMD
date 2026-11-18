import { describe, expect, it } from "vitest";
import { assertCsRoomEntry, assertCsSeat, csRoomCountry, csStaffCountry } from "./cs-rooms.js";

const user = { appRoles: ["LISTENER"], country: "PK" };
const pkCs = { appRoles: ["CS"], country: "PK" };
const inLeader = { appRoles: ["CS_LEADER"], country: "India" };

describe("cs rooms rules", () => {
  it("accepts only the 15 countries", () => {
    expect(csRoomCountry("pk")).toBe("PK");
    expect(() => csRoomCountry("FR")).toThrow(expect.objectContaining({ code: "CS_ROOM_NOT_FOUND" }));
    for (const removed of ["AE", "QA", "US", "NP", "GB", "CA", "TR", "LK", "MY"]) expect(() => csRoomCountry(removed)).toThrow(expect.objectContaining({ code: "CS_ROOM_NOT_FOUND" }));
    for (const kept of ["PK", "IN", "BD", "SA", "ID", "PH", "NG", "BR", "EG", "IQ"]) expect(csRoomCountry(kept)).toBe(kept);
    expect(() => assertCsSeat({ appRoles: ["LISTENER"], country: "NG" }, "PK", 1)).toThrow(expect.objectContaining({ code: "CS_SEAT_OWN_COUNTRY" }));
    expect(() => assertCsSeat({ appRoles: ["LISTENER"], country: "NG" }, "NG", 1)).not.toThrow();
  });
  it("detects staff country", () => {
    expect(csStaffCountry(user)).toBeNull();
    expect(csStaffCountry(pkCs)).toBe("PK");
    expect(csStaffCountry(inLeader)).toBe("IN");
  });
  it("keeps staff in their own country room", () => {
    expect(() => assertCsRoomEntry(pkCs, "PK")).not.toThrow();
    expect(() => assertCsRoomEntry(inLeader, "PK")).not.toThrow();
    expect(() => assertCsRoomEntry(user, "IN")).not.toThrow();
  });
  it("reserves the top seat for own-country staff", () => {
    expect(() => assertCsSeat(pkCs, "PK", 0)).not.toThrow();
    expect(() => assertCsSeat(user, "PK", 0)).toThrow(expect.objectContaining({ code: "CS_SEAT_STAFF_ONLY" }));
    expect(() => assertCsSeat(inLeader, "PK", 0)).toThrow(expect.objectContaining({ code: "CS_SEAT_STAFF_ONLY" }));
  });
  it("keeps staff off the user seats", () => {
    expect(() => assertCsSeat(pkCs, "PK", 2)).toThrow(expect.objectContaining({ code: "CS_SEAT_USERS_ONLY" }));
    expect(() => assertCsSeat(user, "PK", 4)).not.toThrow();
    expect(() => assertCsSeat(user, "PK", 5)).toThrow(expect.objectContaining({ code: "VALIDATION_ERROR" }));
  });
});

describe("cs rooms heartbeat", () => {
  it("frees a seat the user is no longer allowed to hold", async () => {
    const { heartbeatCsRoom } = await import("./cs-rooms.js");
    const cleared = [];
    const db = {
      csRoomPresence: { findUnique: async () => ({ country: "PK", removedAt: null }), updateMany: async () => ({ count: 1 }) },
      csRoomSeat: { findFirst: async () => ({ country: "PK", seatIndex: 0 }), updateMany: async (q) => { cleared.push(q.where.occupantUserId); return { count: 1 }; } },
    };
    await heartbeatCsRoom(db, { id: "u1", appRoles: ["LISTENER"], country: "PK" }, "PK");
    expect(cleared).toEqual(["u1"]);
  });
  it("keeps a valid seat", async () => {
    const { heartbeatCsRoom } = await import("./cs-rooms.js");
    const cleared = [];
    const db = {
      csRoomPresence: { findUnique: async () => ({ country: "PK", removedAt: null }), updateMany: async () => ({ count: 1 }) },
      csRoomSeat: { findFirst: async () => ({ country: "PK", seatIndex: 0 }), updateMany: async () => { cleared.push(1); return { count: 1 }; } },
    };
    await heartbeatCsRoom(db, { id: "u2", appRoles: ["CS"], country: "PK" }, "PK");
    expect(cleared).toEqual([]);
  });
});

describe("cs rooms own-country seats", () => {
  it("keeps users from the 15 countries in their own room", () => {
    expect(() => assertCsSeat({ appRoles: ["LISTENER"], country: "PK" }, "IN", 1)).toThrow(expect.objectContaining({ code: "CS_SEAT_OWN_COUNTRY" }));
    expect(() => assertCsSeat({ appRoles: ["LISTENER"], country: "Pakistan" }, "PK", 1)).not.toThrow();
  });
  it("sends users without a CS country to the Pakistan room only", () => {
    const fr = { appRoles: ["LISTENER"], country: "FR" };
    const none = { appRoles: ["LISTENER"], country: null };
    expect(() => assertCsSeat(fr, "PK", 2)).not.toThrow();
    expect(() => assertCsSeat(none, "PK", 3)).not.toThrow();
    expect(() => assertCsRoomEntry(fr, "IN")).toThrow(expect.objectContaining({ code: "CS_ROOM_PAKISTAN_ONLY" }));
    expect(() => assertCsSeat(none, "NG", 3)).toThrow(expect.objectContaining({ code: "CS_ROOM_PAKISTAN_ONLY" }));
  });
  it("keeps the 9 older rooms for app 2.0.3 and older only", () => {
    const uaeOld = { appRoles: ["LISTENER"], country: "AE", csLegacy: true };
    const uaeNew = { appRoles: ["LISTENER"], country: "AE", csLegacy: false };
    expect(csRoomCountry("AE", uaeOld)).toBe("AE");
    expect(() => csRoomCountry("AE", uaeNew)).toThrow(expect.objectContaining({ code: "CS_ROOM_NOT_FOUND" }));
    expect(() => assertCsSeat(uaeOld, "AE", 1)).not.toThrow();
    expect(() => assertCsSeat(uaeNew, "PK", 1)).not.toThrow();
    expect(() => assertCsSeat(uaeNew, "IN", 1)).toThrow(expect.objectContaining({ code: "CS_ROOM_PAKISTAN_ONLY" }));
    expect(csStaffCountry({ appRoles: ["CS"], country: "AE", csLegacy: true })).toBe("AE");
    expect(csStaffCountry({ appRoles: ["CS"], country: "AE", csLegacy: false })).toBe("");
  });
});

describe("cs room moderation guards", () => {
  const db = (target, presence = { country: "PK", removedAt: null }) => ({
    csRoomPresence: { findUnique: async () => presence },
    user: { findUnique: async () => target },
  });
  it("only own-country staff can moderate", async () => {
    const { moderateCsRoom } = await import("./cs-rooms.js");
    await expect(moderateCsRoom(db({ id: "t", appRoles: ["LISTENER"] }), { id: "a", appRoles: ["LISTENER"], country: "PK" }, "PK", { action: "mute", targetId: "T" })).rejects.toMatchObject({ code: "CS_ADMIN_ONLY" });
    await expect(moderateCsRoom(db({ id: "t", appRoles: ["LISTENER"] }), { id: "a", appRoles: ["CS"], country: "IN" }, "PK", { action: "mute", targetId: "T" })).rejects.toMatchObject({ code: "CS_ADMIN_ONLY" });
  });
  it("staff must be in the room", async () => {
    const { moderateCsRoom } = await import("./cs-rooms.js");
    await expect(moderateCsRoom(db({ id: "t", appRoles: ["LISTENER"] }, null), { id: "a", appRoles: ["CS"], country: "PK" }, "PK", { action: "mute", targetId: "T" })).rejects.toMatchObject({ code: "CS_ROOM_NOT_JOINED" });
  });
  it("cannot act on other staff", async () => {
    const { moderateCsRoom } = await import("./cs-rooms.js");
    await expect(moderateCsRoom(db({ id: "t", appRoles: ["CS_LEADER"], country: "PK" }), { id: "a", appRoles: ["CS"], country: "PK" }, "PK", { action: "ban", targetId: "T", minutes: 10 })).rejects.toMatchObject({ code: "CS_TARGET_STAFF" });
  });
  it("rejects unknown ban lengths and actions", async () => {
    const { moderateCsRoom } = await import("./cs-rooms.js");
    const d = db({ id: "t", appRoles: ["LISTENER"], country: "PK" });
    await expect(moderateCsRoom(d, { id: "a", appRoles: ["CS"], country: "PK" }, "PK", { action: "ban", targetId: "T", minutes: 5 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(moderateCsRoom(d, { id: "a", appRoles: ["CS"], country: "PK" }, "PK", { action: "nuke", targetId: "T" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("CS admin seats a listener", () => {
  it("requires own-country staff and a user seat", async () => {
    const { moderateCsRoom } = await import("./cs-rooms.js");
    const db = { csRoomPresence: { findUnique: async () => ({ country: "PK", removedAt: null }) }, user: { findUnique: async () => ({ id: "t", publicId: "T", appRoles: ["LISTENER"], country: "PK" }) } };
    await expect(moderateCsRoom(db, { id: "a", appRoles: ["LISTENER"], country: "PK" }, "PK", { action: "invite", targetId: "T", seatIndex: 1 })).rejects.toMatchObject({ code: "CS_ADMIN_ONLY" });
    await expect(moderateCsRoom(db, { id: "a", appRoles: ["CS"], country: "PK" }, "PK", { action: "invite", targetId: "T", seatIndex: 0 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("CS invite to seat", () => {
  it("only own-country staff can invite, and only to user seats", async () => {
    const { moderateCsRoom } = await import("./cs-rooms.js");
    const db = { csRoomPresence: { findUnique: async () => ({ country: "PK", removedAt: null, lastSeenAt: new Date() }) }, user: { findUnique: async () => ({ id: "t", publicId: "T", appRoles: ["LISTENER"], country: "PK" }) } };
    await expect(moderateCsRoom(db, { id: "a", appRoles: ["LISTENER"], country: "PK" }, "PK", { action: "invite", targetId: "T", seatIndex: 1 })).rejects.toMatchObject({ code: "CS_ADMIN_ONLY" });
    await expect(moderateCsRoom(db, { id: "a", appRoles: ["CS"], country: "PK" }, "PK", { action: "invite", targetId: "T", seatIndex: 0 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("declining clears the invite and an expired invite cannot be accepted", async () => {
    const { answerCsInvite } = await import("./cs-rooms.js");
    const deleted = [];
    const db = { csRoomInvite: { findUnique: async () => ({ country: "PK", seatIndex: 2, expiresAt: new Date(Date.now() - 1000) }), deleteMany: async (q) => { deleted.push(q.where.userId); return { count: 1 }; } } };
    await answerCsInvite(db, { id: "u" }, "PK", false);
    await expect(answerCsInvite(db, { id: "u" }, "PK", true)).rejects.toMatchObject({ code: "CS_INVITE_EXPIRED" });
    expect(deleted).toEqual(["u", "u"]);
  });
});

describe("official users", () => {
  it("can enter any room and take any seat", () => {
    const official = { appRoles: ["LISTENER", "OFFICIAL"], country: "FR" };
    expect(() => assertCsRoomEntry(official, "BR")).not.toThrow();
    expect(() => assertCsSeat(official, "BR", 0)).not.toThrow();
    expect(() => assertCsSeat(official, "IN", 3)).not.toThrow();
  });
});
