import { expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { grantAgency, reviewAgency } from "./agency-management.js";

function setup(changes = {}) {
  const owner = { id: "owner", publicId: "USR-2030146", name: "Owner", role: "LISTENER", appRoles: ["LISTENER"], status: "ACTIVE", country: "PK", ownedAgencies: [], agencyId: null, ...changes };
  const bd = { id: "bd", publicId: "USR-BD", name: "BD", status: "ACTIVE", country: "PK", appRoles: ["BD"] };
  const db = {
    $queryRaw: vi.fn(async () => [{number:"10201"}]),
    user: { findUnique: vi.fn(async ({where}) => where.id === "bd" || where.publicId === "USR-BD" ? bd : owner), update: vi.fn(async ({data}) => data) },
    agency: { findUnique: vi.fn(async () => null), create: vi.fn(async ({data}) => ({id:"agency",...data})) },
    agencyApplication: { findFirst: vi.fn(async ({where}) => where.publicId ? {id:"application",publicId:"AGA-1",status:"PENDING",agencyName:"Agency",bdUserId:"bd",user:owner} : null), updateMany: vi.fn(async () => ({count:1})), update: vi.fn(), create: vi.fn(async ({data}) => data) },
    auditLog: { create: vi.fn() },
  };
  return db;
}
it.each([{adminId:"admin",name:"Admin"},{bdUserId:"bd",name:"BD"}])("approval makes the owner a host through either review entry point: %j", async actor => {
  const db=setup();
  const result=await reviewAgency(db,"AGA-1",{decision:"APPROVED"},actor);
  expect(result.status).toBe("APPROVED");
  expect(db.user.update).toHaveBeenCalledWith({where:{id:"owner"},data:{appRoles:{push:"HOST"},agencyId:"agency"}});
  expect(db.user.update.mock.calls[0][0].data).not.toHaveProperty("publicId");
  expect(db.user.update.mock.calls[0][0].data).not.toHaveProperty("isVerified");
});
it("direct grants also enable hosting", async () => {
  const db=setup(); await grantAgency(db,{agencyName:"Agency",ownerPublicId:"USR-2030146",bdCode:"USR-BD"},{adminId:"admin",name:"Admin"});
  expect(db.user.update).toHaveBeenCalledWith({where:{id:"owner"},data:{appRoles:{push:"HOST"},agencyId:"agency"}});
});
it("preserves existing management roles and membership without duplicating HOST", async () => {
  const db=setup({appRoles:["MANAGER","HOST"],agencyId:"existing",ownedAgencies:[{id:"existing"}]});
  await reviewAgency(db,"AGA-1",{decision:"APPROVED"},{adminId:"admin",name:"Admin"});
  expect(db.user.update).not.toHaveBeenCalled();
});
it("rejection creates neither an agency nor hosting eligibility", async () => {
  const db=setup(); await reviewAgency(db,"AGA-1",{decision:"REJECTED",note:"Missing information"},{adminId:"admin",name:"Admin"});
  expect(db.user.update).not.toHaveBeenCalled(); expect(db.agency.create).not.toHaveBeenCalled();
});
it("repair grants active owners HOST once, preserves membership/tenure, and skips inactive owners", async () => {
  const db=new PGlite();
  try {
    await db.exec(`CREATE TYPE "ApplicationRole" AS ENUM ('LISTENER','HOST','MANAGER');
      CREATE TABLE "User" (id text PRIMARY KEY,role text DEFAULT 'LISTENER',"appRoles" "ApplicationRole"[] DEFAULT ARRAY['LISTENER']::"ApplicationRole"[],"agencyId" text,"hostSince" timestamp,"updatedAt" timestamp DEFAULT CURRENT_TIMESTAMP,status text DEFAULT 'ACTIVE',"deletedAt" timestamp,"companyBdCountry" text);
      CREATE TABLE "Agency" (id text PRIMARY KEY,"ownerUserId" text,status text DEFAULT 'ACTIVE',"createdAt" timestamp DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO "User" (id) VALUES ('owner'),('manager'),('inactive'),('suspended');
      UPDATE "User" SET "appRoles"=ARRAY['MANAGER','HOST']::"ApplicationRole"[],"agencyId"='member',"hostSince"='2026-01-01' WHERE id='manager';
      UPDATE "User" SET status='SUSPENDED' WHERE id='suspended';
      INSERT INTO "Agency" (id,"ownerUserId","createdAt") VALUES ('first','owner','2026-01-01'),('second','owner','2026-02-01'),('managed','manager','2026-01-01'),('disabled','inactive','2026-01-01'),('suspended-owner','suspended','2026-01-01');
      UPDATE "Agency" SET status='SUSPENDED' WHERE id='disabled';`);
    const tenure=readFileSync("prisma/migrations/20261030220000_host_since/migration.sql","utf8");
    await db.exec(tenure.slice(tenure.indexOf("CREATE FUNCTION stamp_host_since")));
    const migration=readFileSync("prisma/migrations/20261113000200_agency_owners_are_hosts/migration.sql","utf8");
    await db.exec(migration); await db.exec(migration);
    const rows=(await db.query('SELECT *, \"appRoles\"::text[] AS \"appRoles\", \"hostSince\"::text AS \"hostSince\" FROM \"User\"')).rows;
    expect(rows.find(r=>r.id==="owner")).toMatchObject({appRoles:["LISTENER","HOST"],agencyId:"first"});
    expect(rows.find(r=>r.id==="owner").hostSince).not.toBeNull();
    expect(rows.find(r=>r.id==="manager")).toMatchObject({appRoles:["MANAGER","HOST"],agencyId:"member"});
    expect(rows.find(r=>r.id==="manager").hostSince).toBe("2026-01-01 00:00:00");
    expect(rows.find(r=>r.id==="inactive").appRoles).toEqual(["LISTENER"]);
    expect(rows.find(r=>r.id==="suspended").appRoles).toEqual(["LISTENER"]);
  } finally { await db.close(); }
});
