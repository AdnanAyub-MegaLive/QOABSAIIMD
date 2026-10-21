import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { event: { findMany: m.findMany } } }));
vi.mock("@/lib/mobile-api", () => ({ requireMobileUser: m.auth, mobileOptions: () => new Response(null), mobileJson: data => Response.json(data), mobileApiError: () => Response.json({ error: { code: "INVALID_SESSION" } }, { status: 401 }) }));
vi.mock("@/lib/user-perks", () => ({ requestOrigin: r => new URL(r.url).origin }));
import { GET } from "../app/api/v1/events/route.js";
beforeEach(() => { vi.clearAllMocks(); m.auth.mockResolvedValue({ id: "u" }); m.findMany.mockResolvedValue([{ publicId: "EVT-1", name: "Ranking", slug: "rankings" }]); });
it("lists only published events without exposing uploader or storage data", async () => {
  const response = await GET(new Request("https://portal.test/api/v1/events"));
  expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "PUBLISHED" }, select: { publicId: true, name: true, slug: true } }));
  expect((await response.json()).data.events[0]).toEqual({ publicId: "EVT-1", name: "Ranking", slug: "rankings", bannerUrl: null, startsAt: null, endsAt: null, url: "https://portal.test/event/rankings" });
});
it("denies invalid sessions before querying events", async () => {
  m.auth.mockRejectedValue(Error("INVALID_SESSION"));
  expect((await GET(new Request("https://portal.test/api/v1/events"))).status).toBe(401);
  expect(m.findMany).not.toHaveBeenCalled();
});
