import { createHash } from "node:crypto";
import { salaryMonth, sessionAttendance } from "./agency-salary.js";
import { agencyWork } from "./agency-work.js";
import { hostReportAliases } from "./host-report-identity.js";

export async function hostCenter(db, userId, selectedMonth, now = new Date()) {
  const period = salaryMonth(selectedMonth, now);
  const user = await db.user.findUnique({ where: { id: userId }, select: {
    id: true, publicId: true, status: true, deletedAt: true, appRoles: true,
    agency: { select: { publicId: true, name: true } },
  } });
  if (!user || user.deletedAt || user.status !== "ACTIVE" || !user.appRoles?.includes("HOST") || !user.agency) {
    throw Object.assign(new Error("An active host with an agency is required."), { code: "HOST_CENTER_FORBIDDEN", status: 403 });
  }
  const talents = await db.talent.findMany({ where: { publicId: user.publicId }, select: { id: true, publicId: true } });
  const aliases = hostReportAliases([user], talents);
  const talentIds = [...aliases.keys()];
  // An explicit recipient User always takes precedence over legacy Talent mapping.
  const recipient = { OR: [{ recipientUserId: user.id }, { recipientUserId: null, talentId: { in: talentIds } }] };
  const overlap = { startedAt: { lt: period.end }, OR: [{ endedAt: null }, { endedAt: { gt: period.start } }] };
  const settlements = await db.giftSettlement.findMany({ where: {
    createdAt: { gte: period.start, lt: period.end }, giftTransaction: { reversedAt: null, ...recipient },
  }, select: { recipientDiamonds: true, agencyId: true, agency: { select: { publicId: true, name: true } },
    giftTransaction: { select: { recipientUserId: true, talentId: true } } } });
  const missingSettlementCount = await db.giftTransaction.count({ where: {
    ...recipient, reversedAt: null, settlement: null, createdAt: { gte: period.start, lt: period.end },
  } });
  const policy = await db.agencySalaryPolicy.findUnique({ where: { month: period.month } });
  const videos = await db.videoLiveSession.findMany({ where: { hostId: user.id, ...overlap }, select: { startedAt: true, endedAt: true } });
  const legacy = await db.liveSession.findMany({ where: { talentId: { in: talentIds }, ...overlap }, select: { startedAt: true, endedAt: true } });
  const work = agencyWork(settlements, policy, aliases);
  const groups = new Map();
  for (const row of settlements) {
    const key = row.agencyId ?? null;
    if (!groups.has(key)) groups.set(key, { agency: row.agency, rows: [] });
    groups.get(key).rows.push(row);
  }
  const breakdown = [...groups.values()].map(group => {
    const report = agencyWork(group.rows, policy, aliases);
    const host = report.hosts[0];
    return { agency: group.agency, recordedGiftDiamonds: report.totalDiamonds,
      achievedTier: group.agency && policy && !report.unvaluedGiftCount && !missingSettlementCount && host?.targetDiamonds
        ? { minDiamonds: host.targetDiamonds, commissionBps: host.commissionBps } : null,
      estimatedAgencyCommission: group.agency && policy && !report.unvaluedGiftCount && !missingSettlementCount
        ? { amount: report.salaryDiamonds, unit: "DIAMONDS" } : null };
  }).sort((a,b) => (a.agency?.publicId ?? "").localeCompare(b.agency?.publicId ?? ""));
  const incomplete = work.unvaluedGiftCount > 0 || missingSettlementCount > 0;
  const data = {
    hostPublicId: user.publicId, agency: user.agency, month: period.month, timezone: "UTC",
    period: { start: period.start.toISOString(), endExclusive: period.end.toISOString() },
    earnings: { monthlyReceivedGiftDiamonds: incomplete ? null : work.totalDiamonds,
      recordedGiftDiamonds: work.totalDiamonds, unit: "DIAMONDS", coverage: incomplete ? "INCOMPLETE" : "RECORDED_SETTLEMENTS",
      unvaluedGiftCount: work.unvaluedGiftCount, missingSettlementCount },
    attendance: { ...sessionAttendance([...videos, ...legacy], period.start, period.end, now),
      coverage: "RECORDED_VIDEO_AND_LEGACY_LIVE_SESSIONS", qualifyingDays: null,
      notice: "Recorded activity only; missing historical audio attendance cannot be reconstructed. No qualifying attendance rules are applied." },
    targets: { type: "AGENCY_COMMISSION_NOT_HOST_SALARY", policyConfigured: Boolean(policy), policyVersion: policy?.version ?? null,
      tiers: policy?.tiers ?? null, bySettlementAgency: breakdown,
      personalTarget: null, remainingPersonalTarget: null, requiredDays: null, requiredHours: null, hostSalaryLevel: null },
    salary: { estimated: null, finalized: null, payable: null, policyStatus: "NO_APPROVED_PERSONAL_HOST_SALARY_POLICY" },
    reportingBasis: { earnings: "NON_REVERSED_SETTLEMENTS_BY_SETTLEMENT_CREATED_AT", identity: "EXACT_USER_TALENT_PUBLIC_ID",
      agencyChanges: "HOST_MONTH_ACROSS_AGENCIES_COMMISSION_GROUPED_BY_SETTLEMENT_AGENCY",
      hostRemoval: "SELF_SERVICE_ACCESS_REVOKED_HISTORICAL_RECORDS_PRESERVED" },
  };
  return { ...data, revision: createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 16), generatedAt: now.toISOString() };
}
