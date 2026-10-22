function invalid() { return Object.assign(new Error("Invalid review page or cursor."), { status: 422, code: "VALIDATION_ERROR" }); }
export function reviewPage(params, scope, field = "createdAt", direction = "desc", idField = "id") {
  const raw = params.get("limit") ?? "50";
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 100) throw invalid();
  let after = {};
  const cursor = params.get("cursor");
  if (cursor) {
    try {
      if (cursor.length > 2048 || !/^[\w-]+$/.test(cursor)) throw invalid();
      const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      const date = new Date(value.time);
      if (value.scope !== scope || typeof value.id !== "string" || !value.id || value.id.length > 200 || !Number.isFinite(date.getTime())) throw invalid();
      const op = direction === "asc" ? "gt" : "lt";
      after = { OR: [{ [field]: { [op]: date } }, { [field]: date, [idField]: { [op]: value.id } }] };
    } catch { throw invalid(); }
  }
  const limit = Number(raw);
  return {
    after, take: limit + 1, orderBy: [{ [field]: direction }, { [idField]: direction }],
    result(rows) {
      const items = rows.slice(0, limit), last = items.at(-1);
      return { items, nextCursor: rows.length > limit ? Buffer.from(JSON.stringify({ scope, id: last[idField], time: last[field].toISOString() })).toString("base64url") : null };
    },
  };
}
