import { helpDefaults, helpEntrySchema, helpSettingsSchema, helpError } from "./help-center.js";

export function parseHelpSeed(input) {
  const seed = input?.data || input;
  if (!seed || typeof seed !== "object") throw helpError("Seed must be a JSON object.");
  const language = seed.language || "en";
  const raw = Array.isArray(seed.entries) ? seed.entries : [
    ...(seed.faqs || []).map((faq, i) => ({ type: "FAQ", slug: faq.slug || `faq-${i + 1}`, title: faq.question, body: faq.answer, sortOrder: i, language })),
    ...(seed.guides || []).map((e, i) => ({ ...e, type: "GUIDE", sortOrder: e.sortOrder ?? i, language: e.language || language })),
    ...(seed.safety ? [{ ...seed.safety, slug: seed.safety.slug || "safety", type: "SAFETY", sortOrder: 0, language: seed.safety.language || language }] : []),
    ...(seed.policies || []).map((e, i) => ({ ...e, type: "POLICY", sortOrder: e.sortOrder ?? i, language: e.language || language })),
  ];
  if (!raw.length || raw.length > 1000) throw helpError("Seed must contain 1–1000 entries.");
  const entries = raw.map(e => helpEntrySchema.parse(e));
  if (new Set(entries.map(e => `${e.slug}:${e.language}`)).size !== entries.length) throw helpError("Seed contains duplicate slugs in one language.");
  const safety = entries.filter(e => e.type === "SAFETY" && e.published);
  if (new Set(safety.map(e => e.language)).size !== safety.length) throw helpError("Seed has more than one published Safety article per language.");
  const settings = helpSettingsSchema.parse({ ...helpDefaults, ...seed.settings,
    supportEmail: seed.settings?.supportEmail ?? seed.supportEmail ?? helpDefaults.supportEmail,
    termsUrl: seed.settings?.termsUrl ?? seed.termsUrl ?? helpDefaults.termsUrl,
    privacyUrl: seed.settings?.privacyUrl ?? seed.privacyUrl ?? helpDefaults.privacyUrl,
    liveChatEnabled: seed.settings?.liveChatEnabled ?? seed.liveChat?.enabled ?? true,
    liveChatHours: seed.settings?.liveChatHours ?? seed.liveChat?.hours ?? null,
  });
  return { entries, settings };
}

export async function importHelpSeed(db, admin, seed) {
  const parsed = parseHelpSeed(seed);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('help-center-editor'))::text AS locked`;
    const settings = await tx.helpSettings.findUnique({ where: { id: "GLOBAL" } });
    if (settings?.seededAt) return { imported: 0, alreadyImported: true };
    let imported = 0;
    for (const data of parsed.entries) {
      const before = await tx.helpEntry.findUnique({ where: { slug_language: { slug: data.slug, language: data.language } } });
      if (before) continue; // Never overwrite Portal edits on import/retry.
      if (data.type === "SAFETY" && data.published && await tx.helpEntry.findFirst({ where: { type: "SAFETY", published: true, language: data.language } })) throw helpError("A different Safety article already exists. Review before importing.");
      const entry = await tx.helpEntry.create({ data: { ...data, updatedById: admin.id } });
      await tx.auditLog.create({ data: { adminId: admin.id, action: "HELP_ENTRY_SEEDED", category: "CONTENT_MANAGEMENT", entityType: "HelpCenter", entityId: entry.id, description: "Imported original app Help Center content.", metadata: { source: admin.source || "admin-import", before: null, after: JSON.parse(JSON.stringify(entry)) } } });
      imported++;
    }
    const after = await tx.helpSettings.upsert({ where: { id: "GLOBAL" }, create: { ...parsed.settings, seededAt: new Date(), updatedById: admin.id }, update: { seededAt: new Date(), updatedById: admin.id } });
    await tx.auditLog.create({ data: { adminId: admin.id, action: "HELP_SEED_IMPORTED", category: "CONTENT_MANAGEMENT", entityType: "HelpCenter", entityId: "GLOBAL", description: "Completed one-time Help Center import.", metadata: JSON.parse(JSON.stringify({ source: admin.source || "admin-import", before: settings, after, imported })) } });
    return { imported, skipped: parsed.entries.length - imported, alreadyImported: false };
  }, { timeout: 30000 });
}
