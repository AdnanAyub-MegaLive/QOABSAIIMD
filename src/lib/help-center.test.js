import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { helpDefaults, helpEntrySchema, publicHelp, helpResponse, mutateHelp } from "./help-center.js";
import { parseHelpSeed, importHelpSeed } from "./help-center-seed.js";
import { hasPermission, validatePermissions, permissionForPage } from "./portal-permissions.js";

const faq = (extra = {}) => ({ id: "one", type: "FAQ", slug: "faq-one", title: "Coins?", body: "Line one\nLine two", language: "en", published: true, sortOrder: 0, updatedAt: new Date("2026-11-12T08:00:00Z"), ...extra });
const settings = { ...helpDefaults, updatedAt: new Date("2026-11-11T08:00:00Z") };
describe("Help Center public content", () => {
  it("falls back per slug and never returns unpublished translations", () => {
    const data = publicHelp([faq(), faq({ language: "ur", body: "Translated" }), faq({ slug: "other" }), faq({ slug: "other", language: "ur", body: "Hidden", published: false })], settings, "ur");
    expect(data.faqs.map(e => e.answer)).toEqual(["Translated", "Line one\nLine two"]);
    expect(data.updatedAt).toBe("2026-11-12T08:00:00.000Z");
  });
  it("orders content and includes settings updates in its timestamp", () => {
    const data = publicHelp([faq({ sortOrder: 2 }), faq({ slug: "first", sortOrder: 1 })], { ...settings, updatedAt: new Date("2026-11-13Z"), liveChatEnabled: false }, "en");
    expect(data.faqs[0].slug).toBe("first"); expect(data.liveChat.enabled).toBe(false);
    expect(data.updatedAt).toBe("2026-11-13T00:00:00.000Z");
  });
  it("makes uploaded icons usable by the mobile client", () => {
    const guide = faq({ type: "GUIDE", iconUrl: "/api/help-center/icons/abc", sections: [{ heading: "Coins", body: "Help" }] });
    expect(publicHelp([guide], settings, "en", "https://portal.megachat.live").guides[0].iconUrl).toBe("https://portal.megachat.live/api/help-center/icons/abc");
  });
  it("supports cache validators, weak validators, and changed content", async () => {
    const data = publicHelp([faq()], settings, "en"), response = helpResponse(data);
    const etag = response.headers.get("etag");
    expect(response.headers.get("cache-control")).toContain("max-age=300");
    const cached = helpResponse(data, `"other", W/${etag}`);
    expect(cached.status).toBe(304); expect(await cached.text()).toBe("");
    expect(helpResponse({ ...data, supportEmail: "new@example.com" }, etag).status).toBe(200);
  });
  it("preserves the app fallback before an initial import", () => {
    expect(helpResponse(publicHelp([], null, "en")).status).toBe(503);
  });
});
describe("Help Center validation and access", () => {
  it.each([{ title: "<b>Title</b>" }, { body: "x".repeat(2001) }, { title: " " }, { language: "../en" }, { iconUrl: "javascript:alert(1)" }])("refuses invalid content %o", change => {
    expect(helpEntrySchema.safeParse(faq(change)).success).toBe(false);
  });
  it("retains plain links and line breaks", () => {
    expect(helpEntrySchema.parse(faq({ body: "Read\nhttps://megachat.live" })).body).toBe("Read\nhttps://megachat.live");
  });
  it("requires the dedicated permission, allowing standalone manage", () => {
    const root = { active: true, role: "SUPER_ADMIN", permissions: [] };
    expect(validatePermissions(["help_center.manage"], root)).toEqual(["help_center.manage"]);
    expect(permissionForPage("/help-center")).toBe("help_center.manage");
    expect(hasPermission({ active: true, role: "STAFF", permissions: ["messages.view"] }, "help_center.manage")).toBe(false);
  });
});
describe("Help Center edits and seed", () => {
  it("imports all bundled content once with deployment audit attribution", async () => {
    const seed = JSON.parse(readFileSync(new URL("../../prisma/help_center_seed.json", import.meta.url), "utf8"));
    const rows = [], audits = []; let storedSettings = null;
    const tx = { $queryRaw: vi.fn(), helpEntry: {
      findUnique: async ({ where }) => rows.find(e => e.slug === where.slug_language.slug && e.language === where.slug_language.language),
      findFirst: async () => null,
      create: async ({ data }) => { const row = { ...data, id: String(rows.length), updatedAt: new Date() }; rows.push(row); return row; },
    }, helpSettings: {
      findUnique: async () => storedSettings,
      upsert: async ({ create, update }) => (storedSettings = { ...(storedSettings ? { ...storedSettings, ...update } : create), updatedAt: new Date() }),
    }, auditLog: { create: async ({ data }) => audits.push(data) } };
    const db = { $transaction: fn => fn(tx) }, actor = { id: null, source: "deployment:bundled-help-center" };
    expect((await importHelpSeed(db, actor, seed)).imported).toBe(22);
    const data = publicHelp(rows, storedSettings, "en");
    expect(data.faqs).toHaveLength(13); expect(data.guides).toHaveLength(5); expect(data.policies).toHaveLength(3);
    expect(data.safety.sections).toEqual(seed.safety.sections);
    expect(data.faqs.map(f => f.answer)).toEqual(seed.faqs.map(f => f.answer));
    expect(data.guides.map(g => g.sections)).toEqual(seed.guides.map(g => g.sections));
    expect(data.policies.map(p => p.sections)).toEqual(seed.policies.map(p => p.sections));
    expect(audits).toHaveLength(23);
    expect(audits.every(a => a.adminId === null && a.metadata.source === actor.source)).toBe(true);
    expect((await importHelpSeed(db, actor, seed)).alreadyImported).toBe(true);
    expect(rows).toHaveLength(22); expect(audits).toHaveLength(23);
  });
  it("audits deletes with before/after and invalidates public content", async () => {
    const tx = { $queryRaw: vi.fn(), helpEntry: { findUnique: vi.fn().mockResolvedValue(faq()), delete: vi.fn() }, auditLog: { create: vi.fn() }, helpSettings: { upsert: vi.fn() } };
    await mutateHelp({ $transaction: fn => fn(tx) }, { id: "admin" }, { action: "DELETE_ENTRY", id: "one" });
    expect(tx.auditLog.create.mock.calls[0][0].data.metadata).toMatchObject({ before: { id: "one" }, after: null });
    expect(tx.helpSettings.upsert.mock.calls[0][0].update.updatedAt).toBeInstanceOf(Date);
  });
  it("rejects stale or incomplete reorder lists before any updates", async () => {
    const tx = { $queryRaw: vi.fn(), helpEntry: { findMany: vi.fn().mockResolvedValue([faq()]), update: vi.fn() } };
    await expect(mutateHelp({ $transaction: fn => fn(tx) }, { id: "admin" }, { action: "REORDER", type: "FAQ", language: "en", ids: [] })).rejects.toThrow("list changed");
    expect(tx.helpEntry.update).not.toHaveBeenCalled();
  });
  it("preserves seed wording and permits translated slugs", () => {
    const parsed = parseHelpSeed({ entries: [faq(), faq({ language: "ur" })] });
    expect(parsed.entries[0].body).toBe("Line one\nLine two");
    expect(() => parseHelpSeed({ entries: [faq(), faq()] })).toThrow("duplicate");
  });
  it("never repeats an import after the import marker exists", async () => {
    const tx = { $queryRaw: vi.fn(), helpSettings: { findUnique: vi.fn().mockResolvedValue({ seededAt: new Date() }) }, helpEntry: { create: vi.fn() } };
    expect(await importHelpSeed({ $transaction: fn => fn(tx) }, { id: "admin" }, { entries: [faq()] })).toEqual({ imported: 0, alreadyImported: true });
    expect(tx.helpEntry.create).not.toHaveBeenCalled();
  });
  it("keeps existing Portal entries and settings during first import", async () => {
    const tx = { $queryRaw: vi.fn(), helpSettings: { findUnique: vi.fn().mockResolvedValue(settings), upsert: vi.fn().mockResolvedValue(settings) }, helpEntry: { findUnique: vi.fn().mockResolvedValue(faq({ body: "Edited in Portal" })), create: vi.fn() }, auditLog: { create: vi.fn() } };
    expect(await importHelpSeed({ $transaction: fn => fn(tx) }, { id: "admin" }, { entries: [faq()] })).toMatchObject({ imported: 0, skipped: 1 });
    expect(tx.helpEntry.create).not.toHaveBeenCalled();
    expect(tx.helpSettings.upsert.mock.calls[0][0].update).not.toHaveProperty("supportEmail");
    expect(tx.auditLog.create).toHaveBeenCalled();
  });
});
