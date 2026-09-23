import { prisma } from "./prisma.js";
import { ledgerData } from "./wallet.js";

export function utcDayStart(value = new Date()) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function utcWeekStart(value = new Date()) {
  const start = utcDayStart(value);
  const mondayOffset = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - mondayOffset);
  return start;
}

function periodStart(definition, now) {
  return definition.cadence === "WEEKLY" ? utcWeekStart(now) : utcDayStart(now);
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours) return `${hours}h ${minutes % 60}m`;
  return `${minutes} min`;
}

function taskState(instance, definition) {
  if (instance.claimedAt || instance.state === "COMPLETED") return "completed";
  if (instance.state === "LOCKED") return "locked";
  if (instance.state === "CLAIM") return "claim";
  return instance.progressValue >= definition.targetValue ? "claim" : "progress";
}

export function serializeDailyTask(instance) {
  const definition = instance.definition;
  const progressValue = Math.min(instance.progressValue, definition.targetValue);
  const state = taskState(instance, definition);
  const progress = definition.targetValue
    ? Math.min(progressValue / definition.targetValue, 1)
    : 0;
  const progressLabel = definition.unit === "SECONDS"
    ? `${formatDuration(progressValue)} / ${formatDuration(definition.targetValue)}`
    : `${progressValue} / ${definition.targetValue}`;
  return {
    id: instance.id,
    title: definition.title,
    description: definition.description ?? null,
    reward: Number(definition.rewardCoins),
    state,
    ...(state === "progress" ? { progress, progressLabel } : {}),
    ...(definition.icon ? { icon: definition.icon } : {}),
    ...(definition.iconUrl ? { iconUrl: definition.iconUrl } : {}),
    type: definition.type,
  };
}

async function ensureInstances(userId, definitions, now) {
  await prisma.dailyTaskInstance.createMany({
    data: definitions.map((definition) => ({
      userId,
      definitionId: definition.id,
      periodStart: periodStart(definition, now),
      state: definition.type === "SIGN_IN" ? "CLAIM" : "PROGRESS",
    })),
    skipDuplicates: true,
  });
}

async function synchronizeMeasuredProgress(userId, definitions, now) {
  const dailyStart = utcDayStart(now);
  const weeklyStart = utcWeekStart(now);
  const giftDefinitions = definitions.filter((item) =>
    ["SEND_GIFTS", "TOP_SUPPORTER"].includes(item.type),
  );
  for (const definition of giftDefinitions) {
    const start = definition.cadence === "WEEKLY" ? weeklyStart : dailyStart;
    const result = await prisma.giftTransaction.aggregate({
      where: { senderId: userId, createdAt: { gte: start, lte: now } },
      _sum: { quantity: true },
    });
    const progressValue = result._sum.quantity ?? 0;
    await prisma.dailyTaskInstance.updateMany({
      where: {
        userId,
        definitionId: definition.id,
        periodStart: start,
        claimedAt: null,
      },
      data: {
        progressValue,
        state: progressValue >= definition.targetValue ? "CLAIM" : "PROGRESS",
        ...(progressValue >= definition.targetValue ? { completedAt: now } : {}),
      },
    });
  }
}

export async function getDailyTasksOverview(user, now = new Date()) {
  const [definitions, categoryDefinitions] = await Promise.all([
    prisma.dailyTaskDefinition.findMany({
      where: { active: true, category: { active: true } },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.dailyTaskCategory.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
    }),
  ]);
  await ensureInstances(user.id, definitions, now);
  await synchronizeMeasuredProgress(user.id, definitions, now);
  const instances = await prisma.dailyTaskInstance.findMany({
    where: {
      userId: user.id,
      OR: definitions.map((definition) => ({
        definitionId: definition.id,
        periodStart: periodStart(definition, now),
      })),
    },
    include: { definition: true },
  });
  const ordered = definitions
    .map((definition) => instances.find((item) => item.definitionId === definition.id))
    .filter(Boolean);
  const daily = ordered.filter((item) => item.definition.cadence === "DAILY");
  const categories = categoryDefinitions.map((category) => ({
    key: category.key,
    icon: category.icon,
    tasks: [],
  }));
  for (const instance of ordered.filter((item) => !item.definition.topSupporter)) {
    let category = categories.find((item) => item.key === instance.definition.categoryKey);
    if (!category) continue;
    category.tasks.push(serializeDailyTask(instance));
  }
  const streak = await prisma.dailyTaskStreak.findUnique({ where: { userId: user.id } });
  const streakCount = streak?.currentStreak ?? 0;
  const resetAt = new Date(dailyStartMs(now) + 86400000);
  const remaining = Math.max(0, resetAt.getTime() - now.getTime());
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const featured = ordered.find((item) => item.definition.featured);
  const topSupporter = ordered.find((item) => item.definition.topSupporter);
  return {
    coinBalance: user.coinBalance.toString(),
    today: {
      done: daily.filter((item) => taskState(item, item.definition) === "completed").length,
      total: daily.length,
      resetsInLabel: [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":"),
    },
    streak: {
      label: `Day ${Math.max(streakCount, 1)} streak — keep it up!`,
      days: Array.from({ length: 7 }, (_, index) => ({
        day: index + 1,
        done: index < streakCount,
        ...(index + 1 === Math.min(Math.max(streakCount, 1), 7) ? { current: true } : {}),
      })),
    },
    featured: featured ? serializeDailyTask(featured) : null,
    categories,
    topSupporter: topSupporter
      ? {
          ...serializeDailyTask(topSupporter),
          endsInLabel: weeklyEndsInLabel(now),
        }
      : null,
  };
}

function dailyStartMs(now) {
  return utcDayStart(now).getTime();
}

function weeklyEndsInLabel(now) {
  const end = utcWeekStart(now);
  end.setUTCDate(end.getUTCDate() + 7);
  const remaining = Math.max(0, end.getTime() - now.getTime());
  return `${Math.floor(remaining / 86400000)}d ${Math.floor((remaining % 86400000) / 3600000)}h`;
}

function serializeStreak(currentStreak) {
  const count = Math.max(currentStreak ?? 0, 0);
  return {
    label: `Day ${Math.max(count, 1)} streak — keep it up!`,
    days: Array.from({ length: 7 }, (_, index) => ({
      day: index + 1,
      done: index < count,
      ...(index + 1 === Math.min(Math.max(count, 1), 7)
        ? { current: true }
        : {}),
    })),
  };
}

export async function addDailyTaskProgress(userId, type, amount, now = new Date()) {
  const definition = await prisma.dailyTaskDefinition.findUnique({ where: { type } });
  if (!definition?.active || !Number.isSafeInteger(amount) || amount <= 0) return;
  const start = periodStart(definition, now);
  await prisma.dailyTaskInstance.upsert({
    where: { userId_definitionId_periodStart: { userId, definitionId: definition.id, periodStart: start } },
    create: {
      userId,
      definitionId: definition.id,
      periodStart: start,
      progressValue: Math.min(amount, definition.targetValue),
      state: amount >= definition.targetValue ? "CLAIM" : "PROGRESS",
      ...(amount >= definition.targetValue ? { completedAt: now } : {}),
    },
    update: { progressValue: { increment: amount } },
  });
  await prisma.dailyTaskInstance.updateMany({
    where: { userId, definitionId: definition.id, periodStart: start, progressValue: { gte: definition.targetValue }, claimedAt: null },
    data: { progressValue: definition.targetValue, state: "CLAIM", completedAt: now },
  });
}

export async function claimDailyTask(userId, taskId, expectedType = null, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const instance = await tx.dailyTaskInstance.findFirst({
      where: { id: String(taskId ?? ""), userId },
      include: { definition: true },
    });
    if (!instance) throw taskError("TASK_NOT_FOUND");
    if (
      instance.periodStart.getTime() !==
      periodStart(instance.definition, now).getTime()
    )
      throw taskError("TASK_EXPIRED");
    if (expectedType && instance.definition.type !== expectedType) throw taskError("TASK_CLAIM_ROUTE_INVALID");
    if (!expectedType && instance.definition.type === "SIGN_IN") throw taskError("TASK_CLAIM_ROUTE_INVALID");
    if (instance.claimedAt) throw taskError("TASK_ALREADY_CLAIMED");
    if (instance.progressValue < instance.definition.targetValue && instance.definition.type !== "SIGN_IN") throw taskError("TASK_NOT_READY");
    const claimed = await tx.dailyTaskInstance.updateMany({
      where: { id: instance.id, claimedAt: null },
      data: { state: "COMPLETED", progressValue: instance.definition.targetValue, completedAt: now, claimedAt: now },
    });
    if (!claimed.count) throw taskError("TASK_ALREADY_CLAIMED");
    const user = await tx.user.update({
      where: { id: userId },
      data: { coinBalance: { increment: instance.definition.rewardCoins } },
      select: { coinBalance: true },
    });
    await tx.walletTransaction.create({
      data: ledgerData({
        userId,
        type: "BONUS",
        direction: "CREDIT",
        title: `Daily task: ${instance.definition.title}`,
        coins: instance.definition.rewardCoins,
        referenceId: instance.id,
        metadata: { source: "DAILY_TASK", taskType: instance.definition.type },
      }),
    });
    let streak = null;
    if (instance.definition.type === "SIGN_IN") {
      const today = utcDayStart(now);
      const yesterday = new Date(today.getTime() - 86400000);
      const current = await tx.dailyTaskStreak.findUnique({ where: { userId } });
      const nextStreak = current?.lastSignInDate?.getTime() === yesterday.getTime()
        ? current.currentStreak + 1
        : current?.lastSignInDate?.getTime() === today.getTime()
          ? current.currentStreak
          : 1;
      streak = await tx.dailyTaskStreak.upsert({
        where: { userId },
        create: { userId, currentStreak: nextStreak, lastSignInDate: today },
        update: { currentStreak: nextStreak, lastSignInDate: today },
      });
    }
    return {
      coinBalance: user.coinBalance.toString(),
      task: serializeDailyTask({ ...instance, progressValue: instance.definition.targetValue, state: "COMPLETED", completedAt: now, claimedAt: now }),
      ...(streak ? { streak: serializeStreak(streak.currentStreak) } : {}),
    };
  });
}

function taskError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
