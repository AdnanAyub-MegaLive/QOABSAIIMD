export function profileVisitCursor(row) {
  return Buffer.from(JSON.stringify({ at: row.lastVisitedAt.toISOString(), id: row.visitorId })).toString("base64url");
}
export function profileVisitBoundary(cursor) {
  if (!cursor) return {};
  try {
    if (cursor.length > 512) throw new Error();
    const { at, id } = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (typeof at !== "string" || new Date(at).toISOString() !== at || typeof id !== "string" || !/^[\w-]{1,128}$/.test(id)) throw new Error();
    return { OR: [{ lastVisitedAt: { lt: new Date(at) } }, { lastVisitedAt: new Date(at), visitorId: { gt: id } }] };
  } catch { throw Object.assign(new Error("Invalid visitor cursor. Refresh the visitor list."), { code: "INVALID_CURSOR" }); }
}
export function profileVisitMetadata(row) {
  return { lastVisitedAt: row.lastVisitedAt.toISOString(), firstVisitedAt: row.firstVisitedAt.toISOString(), visitCount: row.visitCount };
}
