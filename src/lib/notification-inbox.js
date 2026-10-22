export const inboxWhere = userId => ({ retractedAt: null, OR: [{ userId: null }, { userId }] });
export function notificationPage(url) {
  const limit = Number(url.searchParams.get("limit") ?? 50);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw Object.assign(new Error("Limit must be between 1 and 100."), { code: "VALIDATION_ERROR" });
  let boundary = {};
  const cursor = url.searchParams.get("cursor");
  if (cursor) {
    try {
      if (cursor.length > 500) throw new Error();
      const { id, at } = JSON.parse(Buffer.from(cursor, "base64url").toString());
      if (typeof id !== "string" || id.length > 100 || !id || typeof at !== "string" || !Number.isFinite(Date.parse(at))) throw new Error();
      const createdAt = new Date(at);
      boundary = { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] };
    } catch { throw Object.assign(new Error("Invalid notification cursor."), { code: "VALIDATION_ERROR" }); }
  }
  return { limit, boundary };
}
export const notificationCursor = row => Buffer.from(JSON.stringify({ id: row.id, at: row.createdAt.toISOString() })).toString("base64url");
