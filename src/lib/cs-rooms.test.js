import { describe, expect, it } from "vitest";
import { assertCsRoomEntry, assertCsSeat, csRoomCountry, csStaffCountry } from "./cs-rooms.js";

const user = { appRoles: ["LISTENER"], country: "PK" };
const pkCs = { appRoles: ["CS"], country: "PK" };
const inLeader = { appRoles: ["CS_LEADER"], country: "India" };

describe("cs rooms rules", () => {
  it("accepts only the 15 countries", () => {
    expect(csRoomCountry("pk")).toBe("PK");
    expect(() => csRoomCountry("FR")).toThrow(expect.objectContaining({ code: "CS_ROOM_NOT_FOUND" }));
  });
  it("detects staff country", () => {
    expect(csStaffCountry(user)).toBeNull();
    expect(csStaffCountry(pkCs)).toBe("PK");
    expect(csStaffCountry(inLeader)).toBe("IN");
  });
  it("keeps staff in their own country room", () => {
    expect(() => assertCsRoomEntry(pkCs, "PK")).not.toThrow();
    expect(() => assertCsRoomEntry(inLeader, "PK")).toThrow(expect.objectContaining({ code: "CS_ROOM_OTHER_COUNTRY" }));
    expect(() => assertCsRoomEntry(user, "IN")).not.toThrow();
  });
  it("reserves the top seat for own-country staff", () => {
    expect(() => assertCsSeat(pkCs, "PK", 0)).not.toThrow();
    expect(() => assertCsSeat(user, "PK", 0)).toThrow(expect.objectContaining({ code: "CS_SEAT_STAFF_ONLY" }));
    expect(() => assertCsSeat(inLeader, "PK", 0)).toThrow(expect.objectContaining({ code: "CS_ROOM_OTHER_COUNTRY" }));
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
      csRoomPresence: { updateMany: async () => ({ count: 1 }) },
      csRoomSeat: { findFirst: async () => ({ country: "PK", seatIndex: 0 }), updateMany: async (q) => { cleared.push(q.where.occupantUserId); return { count: 1 }; } },
    };
    await heartbeatCsRoom(db, { id: "u1", appRoles: ["LISTENER"], country: "PK" }, "PK");
    expect(cleared).toEqual(["u1"]);
  });
  it("keeps a valid seat", async () => {
    const { heartbeatCsRoom } = await import("./cs-rooms.js");
    const cleared = [];
    const db = {
      csRoomPresence: { updateMany: async () => ({ count: 1 }) },
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
  it("lets users from other countries sit anywhere", () => {
    expect(() => assertCsSeat({ appRoles: ["LISTENER"], country: "FR" }, "IN", 2)).not.toThrow();
    expect(() => assertCsSeat({ appRoles: ["LISTENER"], country: null }, "US", 3)).not.toThrow();
  });
});
