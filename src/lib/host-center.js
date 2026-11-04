import { agencyLogoUrl } from "./agency-logo.js";
import { avatarDisplayUrl } from "./avatar-history.js";
import { reportCycle, publicCycle } from './reporting-cycles.js';
import { createHash } from "node:crypto";
import { sessionAttendance } from "./agency-salary.js";
import { agencyWork } from "./agency-work.js";
import { hostReportAliases } from "./host-report-identity.js";
import { audioMicAttendance } from "./audio-mic-attendance.js";

const agencyFields = { publicId: true, name: true, status: true, logoAssetPublicId: true,
  owner: { select: { publicId: true, profileImage: true, deletedAt: true, status: true } } };

export async function hostCenter(db, userId, selectedMonth, now = new Date(), origin) {
  const period = await reportCycle(db, 'HOST_SALARY', selectedMonth, now);
  const user = await db.user.findUnique({ where: { id: userId }, select: {
    id: true, publicId: true, status: true, deletedAt: true, appRoles: true, hostSince: true,
    agency: { select: agencyFields },
    ownedAgencies: { where: { status: "ACTIVE" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 1,
      select: agencyFields },
  } });
  // Personal activity spans agencies; prefer membership, then the earliest active owned agency.
  const agency = user?.agency?.status === "ACTIVE" ? user.agency : user?.ownedAgencies?.find(a => a.status === "ACTIVE");
  if (!user || user.deletedAt || user.status !== "ACTIVE" || !user.appRoles?.includes("HOST") || !agency) {
    throw Object.assign(new Error("An active host with an agency is required."), { code: "HOST_CENTER_FORBIDDEN", status: 403 });
  }
  const hostSince = user.hostSince?.toISOString() ?? null;
  if (hostSince && period.month < hostSince.slice(0, 7))
    throw Object.assign(new Error(`Host Center is available from ${hostSince.slice(0, 7)}.`), {
      code: "HOST_MONTH_BEFORE_START", status: 422, details: { hostSince, earliestMonth: hostSince.slice(0, 7) },
    });
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
  // Commission tiers belong to agency cycles, not an independently configured host period.
  const agencyPeriod = await reportCycle(db, 'AGENCY_COMMISSION', period.key, now).catch(error => { if(error.status===422)return null;throw error; });
  const policy = agencyPeriod && +agencyPeriod.start===+period.start && +agencyPeriod.end===+period.end ? await db.agencySalaryPolicy.findUnique({ where: { month: agencyPeriod.policyKey } }) : null;
  const videos = await db.videoLiveSession.findMany({ where: { hostId: user.id, ...overlap }, select: { startedAt: true, endedAt: true } });
  const legacy = await db.liveSession.findMany({ where: { talentId: { in: talentIds }, ...overlap }, select: { startedAt: true, endedAt: true } });
  const audio = await audioMicAttendance(db, user.id, period, now);
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
    hostPublicId: user.publicId, hostSince, agency: { publicId: agency.publicId, name: agency.name,
      logoUrl: await agencyLogoUrl(db, agency.logoAssetPublicId, origin),
      owner: agency.owner?.status === "ACTIVE" && !agency.owner.deletedAt
        ? { publicId: agency.owner.publicId, profileImage: avatarDisplayUrl(agency.owner.profileImage, origin) } : null }, month: period.month, timezone: "UTC",
    period: publicCycle(period),
    earnings: { periodReceivedGiftDiamonds: incomplete ? null : work.totalDiamonds, monthlyReceivedGiftDiamonds: incomplete || period.days !== 30 ? null : work.totalDiamonds,
      recordedGiftDiamonds: work.totalDiamonds, unit: "DIAMONDS", coverage: incomplete ? "INCOMPLETE" : "RECORDED_SETTLEMENTS",
      unvaluedGiftCount: work.unvaluedGiftCount, missingSettlementCount },
    attendance: { ...sessionAttendance([...videos, ...legacy, ...audio], period.start, period.end, now),
      coverage: "RECORDED_AUDIO_VIDEO_AND_LEGACY_LIVE_SESSIONS", qualifyingDays: null,
      notice: "Recorded audio mic/seat time, video and linked legacy live sessions; overlapping time is counted once, in UTC. Listening off-seat is not hosting. Historical audio time without records cannot be reconstructed. No qualifying attendance rules are applied." },
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
