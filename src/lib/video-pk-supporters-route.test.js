import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ pk: null, sides: vi.fn(async () => [{ liveId: "LIVE-L", supporters: [] }, { liveId: "LIVE-R", supporters: [] }]) }));
vi.mock("@/lib/prisma", () => ({ prisma: { videoLiveSession: { findUnique: async () => ({ id: "L", publicId: "LIVE-L", hostId: "h" }) }, videoLivePkSession: { findFirst: async ({ where }) => (where.status === "LIVE" ? mocks.pk : null) } } }));
vi.mock("@/lib/mobile-api", () => ({ requireMobileUser: async () => ({ id: "h" }), mobileOptions: () => new Response(null), mobileJson: (b, s = 200) => Response.json(b, { status: s }), mobileApiError: e => Response.json({ success: false, error: { code: e.code } }, { status: e.status ?? 500 }) }));
vi.mock("@/lib/user-perks", () => ({ requestOrigin: () => "https://portal.test" }));
vi.mock("@/lib/video-pk", () => ({ pkSideSupporters: mocks.sides }));
import { GET } from "@/app/api/v1/live-video/[liveId]/pk/supporters/route.js";
const call = () => GET(new Request("https://portal.test/api/v1/live-video/LIVE-L/pk/supporters"), { params: Promise.resolve({ liveId: "LIVE-L" }) });
it("returns 404 when there is no live PK", async () => {
  const res = await call();
  expect(res.status).toBe(404);
  expect((await res.json()).error.code).toBe("PK_NOT_FOUND");
});
it("returns pkId and sides for the current PK", async () => {
  mocks.pk = { id: "VPK-1", leftSession: {}, rightSession: {} };
  const res = await call();
  expect(await res.json()).toEqual({ success: true, data: { pkId: "VPK-1", sides: [{ liveId: "LIVE-L", supporters: [] }, { liveId: "LIVE-R", supporters: [] }] } });
  expect(mocks.sides.mock.calls[0][3]).toBe(50);
});
