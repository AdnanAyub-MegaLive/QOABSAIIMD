import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { listUserSpecialIds, promoteSpecialId, reconcileUserSpecialIds, selectUserSpecialId } from "./special-id-ownership.js";

const now = new Date("2026-11-13T00:00:00Z");
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some(w => matches(row, w));
    if (key === "AND") return value.every(w => matches(row, w));
    const actual = row[key];
    if (value === null || typeof value !== "object" || value instanceof Date) return actual === value;
    return Object.entries(value).every(([op, v]) => op === "in" ? v.includes(actual) : op === "not" ? actual !== v : op === "gt" ? actual !== null && actual > v : op === "lte" ? actual !== null && actual <= v : op === "equals" ? String(actual).toUpperCase() === v.toUpperCase() : true);
  });
}
const assignment = (id, changes = {}) => ({ id, userId: "u", specialId: id, definitionId: null, source: "ADMIN", status: "OWNED", startsAt: new Date(+now - 60000), expiresAt: new Date(+now + 3600000), revokedAt: null, ...changes });
function setup(rows) {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  const model = {
    findMany: vi.fn(async ({ where }) => rows.filter(r => matches(r, where)).sort((a,b) => (b.expiresAt?.getTime() ?? Infinity) - (a.expiresAt?.getTime() ?? Infinity) || a.id.localeCompare(b.id))),
    findFirst: vi.fn(async args => (await model.findMany(args))[0] ?? null),
    findUnique: vi.fn(async ({ where }) => rows.find(r => r.id === where.id) ?? null),
    updateMany: vi.fn(async ({ where, data }) => { const found = rows.filter(r => matches(r, where)); found.forEach(r => Object.assign(r, data)); return { count: found.length }; }),
    update: vi.fn(async ({ where, data }) => Object.assign(rows.find(r => r.id === where.id), data)),
  };
  const db = { specialIdAssignment: model, user: { findUnique: async () => ({ id: "u", publicId: "TLN-2030146", status: "ACTIVE" }) }, $queryRaw: vi.fn() };
  db.$transaction = fn => fn(db);
  return db;
}
afterEach(() => { vi.useRealTimers(); delete globalThis.portalIo; delete globalThis.portalScheduleSpecialIdExpiry; delete globalThis.chatPerksCache; });
it.each(["ADMIN", "PURCHASE", "PRETTY_ID"])("switching retains the previous %s ID and both timers", async source => {
  const rows = [assignment("old", { status: "ACTIVE", source }), assignment("0099999")], originalExpiry = rows[0].expiresAt;
  const db = setup(rows);
  expect(await selectUserSpecialId(db,"u","0099999")).toMatchObject({ specialId: "0099999", status: "ACTIVE", type: "LEGACY" });
  expect(rows[0]).toMatchObject({ status: "OWNED", revokedAt: null, expiresAt: originalExpiry });
  expect(rows[1].expiresAt).toEqual(originalExpiry);
  await selectUserSpecialId(db,"u","old");
  expect(rows[0].status).toBe("ACTIVE"); expect(rows[1].status).toBe("OWNED");
  expect(db.$queryRaw.mock.calls[0][0][0]).toContain("pg_advisory_xact_lock(2030140)::text");
});
it("expiry promotes permanent first, then latest expiry, and invalidates profile perks", async () => {
  const rows = [assignment("expired", { status: "ACTIVE", expiresAt: now }), assignment("short"), assignment("long", { expiresAt: new Date(+now + 7200000) }), assignment("permanent", { expiresAt: null })];
  const db = setup(rows), emit = vi.fn(); globalThis.portalIo = { to: () => ({ emit }) }; globalThis.chatPerksCache = new Map([["u:origin", {}]]);
  expect((await reconcileUserSpecialIds(db,"u")).row.id).toBe("permanent");
  expect(globalThis.chatPerksCache.size).toBe(0);
  expect(emit).toHaveBeenCalledWith("profile:updated", expect.objectContaining({ data: expect.objectContaining({ specialId: "permanent" }) }));
  rows[3].status = "REVOKED"; rows[3].revokedAt = now;
  expect((await reconcileUserSpecialIds(db,"u")).row.id).toBe("long");
});
it("CLAIMED starts its grant timer once and keeps it when switching back", async () => {
  const rows = [assignment("claim", { status: "CLAIMED", expiresAt: null, prettyIdGrant: { durationMinutes: 14400 } }), assignment("other")];
  const db = setup(rows), item = await selectUserSpecialId(db,"u","claim");
  expect(item.expiresAt).toBe(new Date(+now + 14400 * 60000).toISOString());
  await selectUserSpecialId(db,"u","other"); vi.setSystemTime(new Date(+now+1000));
  expect((await selectUserSpecialId(db,"u","claim")).expiresAt).toBe(item.expiresAt);
});
it.each([["SPECIAL_ID_EXPIRED", { expiresAt: now }], ["SPECIAL_ID_NOT_OWNED", { userId: "other" }], ["SPECIAL_ID_UNAVAILABLE", { revokedAt: now }]])("refuses %s", async (code, changes) => {
  const db=setup([assignment("chosen",changes)]);
  await expect(selectUserSpecialId(db,"u","chosen")).rejects.toMatchObject({code});
  expect(db.specialIdAssignment.update).not.toHaveBeenCalled();
});
it("skips a conflicting code and exposes active first without losing leading zeros", async () => {
  const rows = [assignment("0099999", { expiresAt: null }), assignment("other-holder", { userId: "v", specialId: "0099999", status: "ACTIVE" }), assignment("valid")];
  const db=setup(rows);
  expect((await promoteSpecialId(db,"u",now)).row.id).toBe("valid");
  await expect(selectUserSpecialId(db,"u","0099999")).rejects.toMatchObject({code:"SPECIAL_ID_UNAVAILABLE"});
  expect((await listUserSpecialIds(db,"u"))[0].assignmentId).toBe("valid");
});
it("repairs replacement records with the real PostgreSQL ownership trigger", async () => {
  const db=new PGlite();
  try {
    await db.exec(`CREATE TABLE "User" (id text PRIMARY KEY);
      CREATE TABLE "PublicNumberReservation" (number text PRIMARY KEY,kind text);
      CREATE TABLE "SpecialIdDefinition" (id text PRIMARY KEY,"defaultDurationMinutes" integer);
      CREATE TABLE "PrettyIdGrant" ("assignmentId" text,"durationMinutes" integer);
      CREATE TABLE "SpecialIdAssignment" (id text PRIMARY KEY,"userId" text,"definitionId" text,"specialId" text,status text,"revokedAt" timestamp,"startsAt" timestamp DEFAULT CURRENT_TIMESTAMP,"expiresAt" timestamp);
      INSERT INTO "User" VALUES ('baidi'),('other');
      INSERT INTO "SpecialIdAssignment" (id,"userId","specialId",status,"revokedAt","expiresAt") VALUES
      ('old','baidi','1122334','ACTIVE',NULL,CURRENT_TIMESTAMP-interval '1 day'),
      ('restore','baidi','0099999','REPLACED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval '1 day'),
      ('gone','baidi','0000001','REPLACED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP-interval '1 day'),
      ('revoked','baidi','0000002','REVOKED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval '1 day'),
      ('conflict','baidi','0000003','REPLACED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval '1 day'),
      ('holder','other','0000003','ACTIVE',NULL,CURRENT_TIMESTAMP+interval '1 day');`);
    const weekly=readFileSync("prisma/migrations/20261103190000_weekly_pretty_ids/migration.sql","utf8");
    await db.exec(weekly.slice(weekly.indexOf("CREATE OR REPLACE FUNCTION guard_special_assignment")));
    await db.exec('CREATE TRIGGER guard_special_assignment BEFORE INSERT OR UPDATE OF status,"revokedAt","expiresAt" ON "SpecialIdAssignment" FOR EACH ROW EXECUTE FUNCTION guard_special_assignment();');
    const sql=readFileSync("prisma/migrations/20261113000100_restore_owned_special_ids/migration.sql","utf8");
    await db.exec(sql); await db.exec(sql);
    const rows=(await db.query('SELECT id,status,"revokedAt" FROM "SpecialIdAssignment"')).rows;
    expect(rows.find(r=>r.id==="restore")).toMatchObject({status:"ACTIVE",revokedAt:null});
    expect(rows.find(r=>r.id==="old").status).toBe("EXPIRED");
    expect(rows.find(r=>r.id==="gone").status).toBe("REPLACED");
    expect(rows.find(r=>r.id==="conflict").status).toBe("REPLACED");
    expect(rows.find(r=>r.id==="revoked").status).toBe("REVOKED");
  } finally { await db.close(); }
});
