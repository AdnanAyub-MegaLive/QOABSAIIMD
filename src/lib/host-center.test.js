import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./prisma.js", () => ({ prisma: {} }));
import { hostCenter } from "./host-center.js";
const now = new Date("2026-10-21T12:00:00Z");
let db;
beforeEach(() => {
  db = {
    user: { findUnique: vi.fn().mockResolvedValue({ id: "u", publicId: "TLN-1", status: "ACTIVE", appRoles: ["HOST"], agency: { publicId: "AGN-2", name: "Current", status: "ACTIVE" } }) },
    audioRoomMicSession: { findMany: vi.fn().mockResolvedValue([]) },
    talent: { findMany: vi.fn().mockResolvedValue([{ id: "t", publicId: "TLN-1" }]) },
    giftSettlement: { findMany: vi.fn().mockResolvedValue([]) }, giftTransaction: { count: vi.fn().mockResolvedValue(0) },
    agencySalaryPolicy: { findUnique: vi.fn().mockResolvedValue({ version: 2, tiers: [{ minDiamonds: "100", commissionBps: 1000 }], diamondsPerUsd: 90000n }) },
    videoLiveSession: { findMany: vi.fn().mockResolvedValue([{ startedAt: new Date("2026-10-01T00:00:00Z"), endedAt: new Date("2026-10-01T01:00:00Z") }]) },
    liveSession: { findMany: vi.fn().mockResolvedValue([{ startedAt: new Date("2026-10-01T00:30:00Z"), endedAt: new Date("2026-10-01T02:00:00Z") }]) },
  };
});
it("reuses attendance and commission calculations without calling other members or mutating data", async () => {
  db.giftSettlement.findMany.mockResolvedValue([{ agencyId: "old", agency: { publicId: "AGN-1", name: "Old" }, recipientDiamonds: 200n, giftTransaction: { recipientUserId: null, talentId: "t" } }]);
  const report = await hostCenter(db, "u", "2026-10", now);
  expect(report.earnings.monthlyReceivedGiftDiamonds).toBe("200");
  expect(report.attendance).toMatchObject({ liveMinutes: 120, activeDays: 1, qualifyingDays: null });
  expect(report.targets.bySettlementAgency[0]).toMatchObject({ agency: { publicId: "AGN-1" }, estimatedAgencyCommission: { amount: "20", unit: "DIAMONDS" }, achievedTier: { minDiamonds: "100" } });
  expect(report.agency.publicId).toBe("AGN-2");
  expect(report.salary).toMatchObject({ estimated: null, finalized: null, payable: null });
  expect(db.giftSettlement.findMany.mock.calls[0][0].where.giftTransaction).toEqual({ reversedAt: null, OR: [{ recipientUserId: "u" }, { recipientUserId: null, talentId: { in: ["t"] } }] });
  expect(report.revision).toBe((await hostCenter(db, "u", "2026-10", new Date(+now + 1000))).revision);
});
it("distinguishes missing valuations and settlements from zero", async () => {
  expect((await hostCenter(db, "u", "2026-10", now)).earnings.monthlyReceivedGiftDiamonds).toBe("0");
  db.giftTransaction.count.mockResolvedValue(1);
  const report = await hostCenter(db, "u", "2026-10", now);
  expect(report.earnings).toMatchObject({ monthlyReceivedGiftDiamonds: null, recordedGiftDiamonds: "0", coverage: "INCOMPLETE" });
});
it("leaves unconfigured targets null and never invents salary", async () => {
  db.agencySalaryPolicy.findUnique.mockResolvedValue(null);
  expect((await hostCenter(db, "u", "2026-10", now)).targets).toMatchObject({ tiers: null, policyConfigured: false, personalTarget: null });
});
it.each([{ status: "BANNED" }, { deletedAt: now }, { appRoles: [] }, { agency: null }])("rejects ineligible accounts %j", async change => {
  db.user.findUnique.mockResolvedValue({ id: "u", publicId: "TLN-1", status: "ACTIVE", appRoles: ["HOST"], agency: {}, ...change });
  await expect(hostCenter(db, "u", "2026-10", now)).rejects.toMatchObject({ code: "HOST_CENTER_FORBIDDEN" });
  expect(db.giftSettlement.findMany).not.toHaveBeenCalled();
});
it("rejects future or malformed reporting months", async () => {
  await expect(hostCenter(db, "u", "2026-11", now)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  await expect(hostCenter(db, "u", "2026-13", now)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
});
it("counts a completed 30-minute mic session and retains its day after leaving", async () => {
  db.videoLiveSession.findMany.mockResolvedValue([]); db.liveSession.findMany.mockResolvedValue([]);
  db.audioRoomMicSession.findMany.mockResolvedValue([{startedAt:new Date("2026-10-10T10:00:00Z"),endedAt:new Date("2026-10-10T10:30:00Z"),lastSeenAt:new Date("2026-10-10T10:30:00Z")}]);
  const report=await hostCenter(db,"u","2026-10",now);
  expect(report.attendance).toMatchObject({liveMinutes:30,activeDays:1,coverage:"RECORDED_AUDIO_VIDEO_AND_LEGACY_LIVE_SESSIONS"});
  expect(db.audioRoomMicSession.findMany.mock.calls[0][0].where.userId).toBe("u");
});
it("unions audio/video overlaps, clips the month, and counts UTC days", async () => {
  db.audioRoomMicSession.findMany.mockResolvedValue([
    {startedAt:new Date("2026-09-30T23:45:00Z"),endedAt:new Date("2026-10-01T00:45:00Z")},
    {startedAt:new Date("2026-10-01T01:30:00Z"),endedAt:new Date("2026-10-01T02:30:00Z")},
    {startedAt:new Date("2026-10-02T00:00:00Z"),endedAt:new Date("2026-10-02T00:30:00Z")},
  ]);
  expect((await hostCenter(db,"u","2026-10",now)).attendance).toMatchObject({liveMinutes:180,activeDays:2});
});
it("counts ongoing mic time but never counts an unbounded offline/crash gap", async () => {
  db.videoLiveSession.findMany.mockResolvedValue([]); db.liveSession.findMany.mockResolvedValue([]);
  db.audioRoomMicSession.findMany.mockResolvedValue([{startedAt:new Date(+now-30*60000),endedAt:null,lastSeenAt:now}]);
  expect((await hostCenter(db,"u","2026-10",now)).attendance.liveMinutes).toBe(30);
  db.audioRoomMicSession.findMany.mockResolvedValue([{startedAt:new Date(+now-60*60000),endedAt:null,lastSeenAt:new Date(+now-30*60000)}]);
  expect((await hostCenter(db,"u","2026-10",now)).attendance.liveMinutes).toBe(30);
});
it("admits an active agency owner with HOST and no agency membership", async () => {
  db.user.findUnique.mockResolvedValue({id:"u",publicId:"USR-OWNER",status:"ACTIVE",appRoles:["HOST"],agency:null,ownedAgencies:[{publicId:"AGN-OWN",name:"Owned",status:"ACTIVE"}]});
  const report=await hostCenter(db,"u","2026-10",now);
  expect(report.agency).toEqual({publicId:"AGN-OWN",name:"Owned"});
  expect(db.user.findUnique.mock.calls[0][0].select.ownedAgencies).toMatchObject({where:{status:"ACTIVE"},take:1,orderBy:[{createdAt:"asc"},{id:"asc"}]});
});
it.each([
  {appRoles:[],ownedAgencies:[{status:"ACTIVE"}]},
  {appRoles:["HOST"],ownedAgencies:[{status:"SUSPENDED"}]},
  {appRoles:["HOST"],agency:{status:"SUSPENDED"}},
])("does not grant access to inactive agencies or non-host owners: %j", async change => {
  db.user.findUnique.mockResolvedValue({id:"u",publicId:"USR-OWNER",status:"ACTIVE",agency:null,...change});
  await expect(hostCenter(db,"u","2026-10",now)).rejects.toMatchObject({code:"HOST_CENTER_FORBIDDEN"});
});
it("prefers active membership over owned agencies without moving settlement attribution", async () => {
  db.user.findUnique.mockResolvedValue({id:"u",publicId:"TLN-1",status:"ACTIVE",appRoles:["HOST"],agency:{publicId:"AGN-MEMBER",name:"Membership",status:"ACTIVE"},ownedAgencies:[{publicId:"AGN-OWN",name:"Owned",status:"ACTIVE"}]});
  expect((await hostCenter(db,"u","2026-10",now)).agency.publicId).toBe("AGN-MEMBER");
});
it("returns an ISO start date and rejects earlier months before querying activity", async () => {
  const user=await db.user.findUnique();user.hostSince=new Date("2026-10-15T12:30:00Z");
  const report=await hostCenter(db,"u","2026-10",now);
  expect(report.hostSince).toBe("2026-10-15T12:30:00.000Z");
  db.giftSettlement.findMany.mockClear();
  await expect(hostCenter(db,"u","2026-09",now)).rejects.toMatchObject({code:"HOST_MONTH_BEFORE_START",status:422,details:{earliestMonth:"2026-10"}});
  expect(db.giftSettlement.findMany).not.toHaveBeenCalled();
});
it("does not invent a host start for legacy accounts with no historical evidence", async () => {
  expect((await hostCenter(db,"u","2026-09",now)).hostSince).toBeNull();
});
