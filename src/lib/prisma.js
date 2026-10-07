import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis;
const prismaSchemaVersion = "2026-10-07-avatar-history";
const requiredUserFields = [
  "sessionVersion",
  "forcedLogoutAt",
  "passwordHash",
  "deletedAt",
  "totalTopUp",
  "gender",
  "dob",
  "bio",
  "isVerified",
  "isOfficial",
  "appRoles",
  "agencyId",
  "hostSalaryCoinBalance",
  "couponBalance",
  "profilePrivate",
  "showDateOfBirth",
];

const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

const cachedUserFields =
  globalForPrisma.prisma?._runtimeDataModel?.models?.User?.fields?.map(
    (field) => field.name,
  ) ?? [];
const cachedAudioRoomFields =
  globalForPrisma.prisma?._runtimeDataModel?.models?.AudioRoom?.fields?.map(
    (field) => field.name,
  ) ?? [];
const cachedUploadAssetFields =
  globalForPrisma.prisma?._runtimeDataModel?.models?.UploadAsset?.fields?.map(
    (field) => field.name,
  ) ?? [];
const cachedUploadAssignmentFields =
  globalForPrisma.prisma?._runtimeDataModel?.models?.UploadAssetAssignment?.fields?.map(
    (field) => field.name,
  ) ?? [];
const cachedAgencyApplicationFields =
  globalForPrisma.prisma?._runtimeDataModel?.models?.AgencyApplication?.fields?.map(
    (field) => field.name,
  ) ?? [];
const cachedWalletWithdrawalFields =
  globalForPrisma.prisma?._runtimeDataModel?.models?.WalletWithdrawal?.fields?.map(
    (field) => field.name,
  ) ?? [];
const cachedClientMatchesSchema =
  globalForPrisma.prismaSchemaVersion === prismaSchemaVersion &&
  requiredUserFields.every((field) => cachedUserFields.includes(field)) &&
  [
    "joiningDisabledUntil",
    "blockedUntil",
    "terminatedUntil",
    "passwordHash",
    "chatLocked",
    "chatRevision",
    "chatClearedAt",
    "roomBackgroundAssetId",
    "roomBackgroundVersion",
    "seatStyleAssetId",
    "seatStyleVersion",
    "announcement",
    "language",
    "tags",
    "privacyMode",
    "paidEntryCoins",
    "revision",
    "seatRevision",
  ].every((field) => cachedAudioRoomFields.includes(field)) &&
  ["details", "tags", "isGlobal", "actionUrl", "placement", "sortOrder", "posterFileName", "posterMimeType", "posterFileSize", "posterFileData", "giftRewardMinBps", "giftRewardMaxBps"].every(
    (field) => cachedUploadAssetFields.includes(field),
  ) &&
  ["durationMinutes", "expiresAt"].every((field) =>
    cachedUploadAssignmentFields.includes(field),
  ) &&
  ["reviewedById", "reviewedAt", "reviewNote", "rejectionReason"].every(
    (field) => cachedAgencyApplicationFields.includes(field),
  ) &&
  [
    "reviewedByAdminId",
    "completedAt",
    "reviewNote",
    "rejectionReason",
    "providerPayoutReference",
  ].every((field) => cachedWalletWithdrawalFields.includes(field)) &&
  [
    "agency",
    "profitSplitRule",
    "giftSettlement",
    "userAlbumItem",
    "specialIdAssignment",
    "specialIdDefinition",
    "gameLog",
    "gameDefinition",
    "gameRound",
    "gameSettingsAudit",
    "gamePlayerSession",
    "liveSession",
    "talentPerformance",
    "talentViolation",
    "audioRoom",
    "audioRoomRole",
    "audioRoomBan",
    "audioRoomModerationLog",
    "audioRoomMember",
    "audioRoomAdmission",
    "audioRoomSeatInvitation",
    "redEnvelope",
    "redEnvelopeClaim",
    "redEnvelopeSettings",
    "redEnvelopePreset",
    "uploadAsset",
    "uploadAssetAssignment",
    "customRoomBackgroundSettings",
    "customRoomBackgroundPrice",
    "customRoomBackgroundRequest",
    "userEquippedProp",
    "propPurchase",
    "agencyApplication",
    "conversation",
    "conversationParticipant",
    "message",
    "messageReceipt",
    "userBlock",
    "notification",
    "notificationRead",
    "friendRequest",
    "walletCoinPackage",
    "walletTopUpOrder",
    "walletWithdrawal",
    "walletTransaction",
    "dailyTaskCategory",
    "dailyTaskDefinition",
    "dailyTaskInstance",
    "dailyTaskStreak",
    "eventUser",
    "event",
    "eventVersion",
    "eventRefreshToken",
    "uploadLog",
    "publishLog",
    "eventAuditLog",
    "legacyIdMapping",
    "apiRequestLog",
  ].every((model) => Boolean(globalForPrisma.prisma?.[model]));

// Fast Refresh keeps globalThis alive. Reuse only a client that contains every
// field required by the current application schema.
export const prisma = cachedClientMatchesSchema
  ? globalForPrisma.prisma
  : createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaVersion = prismaSchemaVersion;
}
