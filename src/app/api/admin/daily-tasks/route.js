import { portalPermissionError } from "@/lib/portal-admin";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";

function json(body, status = 200) {
  return Response.json(body, { status });
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) throw Object.assign(new Error("UNAUTHORIZED"), { status: 401 });
  const admin = await prisma.admin.findUnique({ where: { email: session.user.email } });
  if (!admin?.active) throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
  return admin;
}

function wholeNumber(value, field, { min = 0, max = 2_147_483_647 } = {}) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    throw Object.assign(new Error(`${field} is invalid.`), { status: 422 });
  return parsed;
}

function rewardCoins(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text) || BigInt(text) > 1_000_000_000n)
    throw Object.assign(new Error("Reward must be between 0 and 1000000000 coins."), { status: 422 });
  return BigInt(text);
}

function text(value, field, max = 120) {
  const result = String(value ?? "").trim();
  if (!result || result.length > max)
    throw Object.assign(new Error(`${field} must contain 1 to ${max} characters.`), { status: 422 });
  return result;
}

function optionalUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch {
    throw Object.assign(new Error("Icon URL must be a valid HTTPS URL."), { status: 422 });
  }
}

async function audit(tx, admin, action, entityType, entityId, metadata) {
  await tx.auditLog.create({
    data: {
      adminId: admin.id,
      action,
      category: "CONTENT_MANAGEMENT",
      entityType,
      entityId,
      description: `${admin.name} updated daily-task configuration ${entityId}.`,
      metadata,
    },
  });
}

export async function POST(request) {
  const permissionDenied = await portalPermissionError("tasks.manage");
  if (permissionDenied) return permissionDenied;

  try {
    const admin = await requireAdmin();
    const body = await request.json();
    if (body?.entity === "category") {
      const key = text(body.key, "Category name", 40);
      const icon = text(body.icon, "Category icon", 40);
      const sortOrder = wholeNumber(body.sortOrder ?? 0, "Sort order", { max: 1_000_000 });
      const category = await prisma.$transaction(async (tx) => {
        const created = await tx.dailyTaskCategory.create({ data: { key, icon, sortOrder, active: body.active !== false } });
        await audit(tx, admin, "DAILY_TASK_CATEGORY_CREATED", "DailyTaskCategory", key, { icon, sortOrder });
        return created;
      });
      return json({ success: true, data: { category } }, 201);
    }
    const type = text(body.type, "Task type", 60).toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*$/.test(type)) throw Object.assign(new Error("Task type must use uppercase letters, numbers, and underscores."), { status: 422 });
    const categoryKey = text(body.categoryKey, "Category", 40);
    const category = await prisma.dailyTaskCategory.findUnique({ where: { key: categoryKey } });
    if (!category) throw Object.assign(new Error("The selected category does not exist."), { status: 422 });
    const id = `TASKDEF-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const data = taskData(body, category);
    const task = await prisma.$transaction(async (tx) => {
      if (data.featured) await tx.dailyTaskDefinition.updateMany({ where: { featured: true }, data: { featured: false } });
      if (data.topSupporter) await tx.dailyTaskDefinition.updateMany({ where: { topSupporter: true }, data: { topSupporter: false } });
      const created = await tx.dailyTaskDefinition.create({ data: { id, type, ...data } });
      await audit(tx, admin, "DAILY_TASK_CREATED", "DailyTaskDefinition", id, { type, ...serializableTaskData(data) });
      return created;
    });
    return json({ success: true, data: { task: serializeTask(task) } }, 201);
  } catch (error) {
    return adminError(error);
  }
}

export async function PATCH(request) {
  const permissionDenied = await portalPermissionError("tasks.manage");
  if (permissionDenied) return permissionDenied;

  try {
    const admin = await requireAdmin();
    const body = await request.json();
    if (body?.entity === "category") {
      const key = text(body.key, "Category name", 40);
      const category = await prisma.$transaction(async (tx) => {
        const updated = await tx.dailyTaskCategory.update({
          where: { key },
          data: {
            icon: text(body.icon, "Category icon", 40),
            sortOrder: wholeNumber(body.sortOrder, "Sort order", { max: 1_000_000 }),
            active: Boolean(body.active),
          },
        });
        await audit(tx, admin, "DAILY_TASK_CATEGORY_UPDATED", "DailyTaskCategory", key, body);
        return updated;
      });
      return json({ success: true, data: { category } });
    }
    const id = text(body.id, "Task ID", 100);
    const current = await prisma.dailyTaskDefinition.findUnique({ where: { id } });
    if (!current) throw Object.assign(new Error("Task definition was not found."), { status: 404 });
    const categoryKey = text(body.categoryKey, "Category", 40);
    const category = await prisma.dailyTaskCategory.findUnique({ where: { key: categoryKey } });
    if (!category) throw Object.assign(new Error("The selected category does not exist."), { status: 422 });
    const data = taskData(body, category);
    const task = await prisma.$transaction(async (tx) => {
      if (data.featured) await tx.dailyTaskDefinition.updateMany({ where: { id: { not: id }, featured: true }, data: { featured: false } });
      if (data.topSupporter) await tx.dailyTaskDefinition.updateMany({ where: { id: { not: id }, topSupporter: true }, data: { topSupporter: false } });
      const updated = await tx.dailyTaskDefinition.update({ where: { id }, data });
      await audit(tx, admin, "DAILY_TASK_UPDATED", "DailyTaskDefinition", id, serializableTaskData(data));
      return updated;
    });
    return json({ success: true, data: { task: serializeTask(task) } });
  } catch (error) {
    return adminError(error);
  }
}

function taskData(body, category) {
  const cadence = String(body.cadence ?? "DAILY").toUpperCase();
  const unit = String(body.unit ?? "COUNT").toUpperCase();
  if (!new Set(["DAILY", "WEEKLY"]).has(cadence)) throw Object.assign(new Error("Cadence must be DAILY or WEEKLY."), { status: 422 });
  if (!new Set(["COUNT", "SECONDS"]).has(unit)) throw Object.assign(new Error("Unit must be COUNT or SECONDS."), { status: 422 });
  return {
    title: text(body.title, "Title", 120),
    description: String(body.description ?? "").trim().slice(0, 500) || null,
    rewardCoins: rewardCoins(body.rewardCoins),
    targetValue: wholeNumber(body.targetValue, "Target", { min: 1 }),
    unit,
    cadence,
    categoryKey: category.key,
    categoryIcon: category.icon,
    icon: String(body.icon ?? "").trim().slice(0, 40) || null,
    iconUrl: optionalUrl(body.iconUrl),
    featured: Boolean(body.featured),
    topSupporter: Boolean(body.topSupporter),
    sortOrder: wholeNumber(body.sortOrder ?? 0, "Sort order", { max: 1_000_000 }),
    active: body.active !== false,
  };
}

function serializeTask(task) {
  return { ...task, rewardCoins: task.rewardCoins.toString(), createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString() };
}
function serializableTaskData(data) { return { ...data, rewardCoins: data.rewardCoins.toString() }; }

function adminError(error) {
  if (error?.code === "P2002") return json({ success: false, error: { code: "DUPLICATE_CONFIGURATION", message: "That task type or category already exists." } }, 409);
  if (error?.code === "P2025") return json({ success: false, error: { code: "CONFIGURATION_NOT_FOUND", message: "The selected configuration no longer exists." } }, 404);
  const status = error?.status ?? 500;
  if (status === 500) console.error("Daily-task administration failed", error);
  return json({ success: false, error: { code: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : status === 422 ? "VALIDATION_ERROR" : "DAILY_TASK_ADMIN_FAILED", message: status === 500 ? "Unable to update daily tasks right now." : error.message } }, status);
}
