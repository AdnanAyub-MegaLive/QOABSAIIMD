export function normalizeGiftInteractions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Object.assign(new Error("Gift interactions must be an object."), { code: "VALIDATION_ERROR" });
  const active = Boolean(value.active);
  const items = value.items == null ? [] : value.items;
  if (!Array.isArray(items) || items.length > 50)
    throw Object.assign(new Error("Gift interactions may contain at most 50 items."), { code: "VALIDATION_ERROR" });
  let normalized;
  try { normalized = JSON.parse(JSON.stringify(items)); }
  catch { throw Object.assign(new Error("Gift interaction items must be valid JSON."), { code: "VALIDATION_ERROR" }); }
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > 32_768)
    throw Object.assign(new Error("Gift interaction data is too large."), { code: "VALIDATION_ERROR" });
  return { active, items: normalized };
}

export function serializeGiftInteractions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { active: false, items: [] };
  return { active: Boolean(value.active), items: Array.isArray(value.items) ? value.items : [] };
}
