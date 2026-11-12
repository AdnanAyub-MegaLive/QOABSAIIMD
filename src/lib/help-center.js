import { createHash } from "node:crypto";
import { z } from "zod";

export const helpDefaults = { supportEmail: "support@megalive.live", termsUrl: "https://megachat.live/terms", privacyUrl: "https://megachat.live/privacy-policy", liveChatEnabled: true, liveChatHours: null };
const plain = max => z.string().max(max).refine(s => !/<\/?[a-z][^>]*>/i.test(s), "Use plain text, not HTML.");
const nullable = max => plain(max).nullable().optional().transform(s => s || null);
const https = z.string().max(2048).url().refine(s => new URL(s).protocol === "https:", "Use an HTTPS URL.");
export const helpLanguage = z.string().regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/).max(35);
export const helpEntrySchema = z.object({
  type: z.enum(["FAQ", "GUIDE", "SAFETY", "POLICY"]), slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  icon: nullable(40), iconUrl: z.union([https, z.string().regex(/^\/api\/help-center\/icons\/[a-z0-9]+$/)]).nullable().optional().transform(s => s || null),
  title: plain(120).refine(s => s.trim().length > 0, "Title is required."), summary: nullable(200), body: nullable(2000),
  sections: z.array(z.object({ heading: plain(120), body: plain(4000) })).max(30).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).default(0), published: z.boolean().default(true), language: helpLanguage.default("en"),
}).superRefine((value, ctx) => {
  if (value.type === "FAQ" && !value.body?.trim()) ctx.addIssue({ code: "custom", path: ["body"], message: "An answer is required." });
  if (value.type !== "FAQ" && !value.sections?.length) ctx.addIssue({ code: "custom", path: ["sections"], message: "Add at least one section." });
}).transform(v => ({ ...v, body: v.type === "FAQ" ? v.body : null, sections: v.type === "FAQ" ? [] : v.sections, summary: v.type === "FAQ" ? null : v.summary }));
export const helpSettingsSchema = z.object({ supportEmail: z.string().email().max(254), termsUrl: https, privacyUrl: https, liveChatEnabled: z.boolean(), liveChatHours: nullable(200) });
export const helpError = (message, status = 422) => Object.assign(new Error(message), { status });
const jsonValue = value => JSON.parse(JSON.stringify(value));

export function publicHelp(entries, settings, language, origin) {
  if (!settings) return null; // Keep the app's bundled fallback until content is imported/configured.
  const chosen = new Map();
  for (const e of entries.filter(e => e.published && e.language === "en")) chosen.set(e.slug, e);
  for (const e of entries.filter(e => e.published && e.language === language)) chosen.set(e.slug, e);
  const rows = [...chosen.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug));
  const safety = rows.find(e => e.type === "SAFETY" && e.language === language) || rows.find(e => e.type === "SAFETY");
  const returned = rows.filter(e => e.type !== "SAFETY" || e === safety);
  const article = e => ({ slug: e.slug, icon: e.icon, iconUrl: e.iconUrl && origin ? new URL(e.iconUrl, origin).toString() : e.iconUrl, title: e.title, summary: e.summary, sections: e.sections || [] });
  return {
    updatedAt: new Date(Math.max(new Date(settings.updatedAt).getTime(), ...returned.map(e => new Date(e.updatedAt).getTime()))).toISOString(),
    supportEmail: settings.supportEmail, termsUrl: settings.termsUrl, privacyUrl: settings.privacyUrl,
    liveChat: { enabled: settings.liveChatEnabled, hours: settings.liveChatHours },
    faqs: rows.filter(e => e.type === "FAQ").map(e => ({ slug: e.slug, question: e.title, answer: e.body })),
    guides: rows.filter(e => e.type === "GUIDE").map(article),
    safety: safety ? article(safety) : null,
    policies: rows.filter(e => e.type === "POLICY").map(article),
  };
}
export function helpResponse(data, ifNoneMatch) {
  if (!data) return Response.json({ success: false, error: { code: "HELP_CENTER_UNAVAILABLE", message: "Help content is not available yet." } }, { status: 503, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } });
  const body = JSON.stringify({ success: true, data });
  const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
  const headers = { ETag: etag, "Cache-Control": "public, max-age=300", "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "ETag" };
  const matches = ifNoneMatch?.split(",").map(s => s.trim().replace(/^W\//, ""));
  return new Response(matches?.includes(etag) || matches?.includes("*") ? null : body, { status: matches?.includes(etag) || matches?.includes("*") ? 304 : 200, headers });
}

async function audit(tx, admin, action, entityId, before, after) {
  await tx.auditLog.create({ data: { adminId: admin.id, action, category: "CONTENT_MANAGEMENT", entityType: "HelpCenter", entityId, description: action.replaceAll("_", " "), metadata: jsonValue({ before, after }) } });
}
export async function mutateHelp(db, admin, input) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('help-center-editor'))`;
    const now = new Date();
    let result;
    if (input.action === "SAVE_ENTRY") {
      const data = helpEntrySchema.parse(input.entry);
      const before = input.id ? await tx.helpEntry.findUnique({ where: { id: String(input.id) } }) : null;
      if (input.id && !before) throw helpError("Entry not found.", 404);
      if (data.type === "SAFETY" && data.published && await tx.helpEntry.findFirst({ where: { type: "SAFETY", published: true, language: data.language, ...(before ? { id: { not: before.id } } : {}) } })) throw helpError("Only one Safety article can be published per language.");
      result = before ? await tx.helpEntry.update({ where: { id: before.id }, data: { ...data, updatedAt: now, updatedById: admin.id } }) : await tx.helpEntry.create({ data: { ...data, updatedById: admin.id } });
      await audit(tx, admin, "HELP_ENTRY_SAVED", result.id, before, result);
    } else if (input.action === "DELETE_ENTRY") {
      const before = await tx.helpEntry.findUnique({ where: { id: String(input.id || "") } });
      if (!before) throw helpError("Entry not found.", 404);
      await tx.helpEntry.delete({ where: { id: before.id } }); result = { deleted: true };
      await audit(tx, admin, "HELP_ENTRY_DELETED", before.id, before, null);
    } else if (input.action === "REORDER") {
      const language = helpLanguage.parse(input.language), type = z.enum(["FAQ", "GUIDE", "SAFETY", "POLICY"]).parse(input.type);
      const ids = z.array(z.string()).max(1000).parse(input.ids);
      const before = await tx.helpEntry.findMany({ where: { language, type }, orderBy: [{ sortOrder: "asc" }, { slug: "asc" }] });
      if (new Set(ids).size !== ids.length || ids.length !== before.length || before.some(e => !ids.includes(e.id))) throw helpError("The list changed. Reload before reordering.", 409);
      for (const [sortOrder, id] of ids.entries()) await tx.helpEntry.update({ where: { id }, data: { sortOrder, updatedAt: now, updatedById: admin.id } });
      result = { reordered: true }; await audit(tx, admin, "HELP_ENTRIES_REORDERED", type, before.map(e => ({ id: e.id, sortOrder: e.sortOrder })), ids.map((id, sortOrder) => ({ id, sortOrder })));
    } else if (input.action === "SETTINGS") {
      const data = helpSettingsSchema.parse(input.settings);
      const before = await tx.helpSettings.findUnique({ where: { id: "GLOBAL" } });
      result = await tx.helpSettings.upsert({ where: { id: "GLOBAL" }, create: { ...data, updatedById: admin.id }, update: { ...data, updatedAt: now, updatedById: admin.id } });
      await audit(tx, admin, "HELP_SETTINGS_SAVED", "GLOBAL", before, result);
    } else throw helpError("Unknown Help Center action.");
    await tx.helpSettings.upsert({ where: { id: "GLOBAL" }, create: { ...helpDefaults, updatedById: admin.id }, update: { updatedAt: now, updatedById: admin.id } });
    return result;
  }, { timeout: 30000 });
}
