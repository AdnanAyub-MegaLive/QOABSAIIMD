import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./prisma.js", () => ({ prisma: {} }));
import { hostCenter } from "./host-center.js";
const now = new Date("2026-10-21T12:00:00Z");
let db;
beforeEach(() => {
  db = {
    user: { findUnique: vi.fn().mockResolvedValue({ id: "u", publicId: "TLN-1", status: "ACTIVE", appRoles: ["HOST"], agency: { publicId: "AGN-2", name: "Current" } }) },
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
