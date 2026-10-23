import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), ranking: vi.fn(), limited: vi.fn() }));
vi.mock("./mobile-api", () => ({
  requireMobileUser: mocks.auth,
  mobileJson: (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } }),
  mobileOptions: () => new Response(null, { status: 204 }),
  mobileApiError: (e, fallback) => Response.json({ success: false, error: { code: e.message === "INVALID_SESSION" ? e.message : fallback } }, { status: e.message === "INVALID_SESSION" ? 401 : 500 }),
}));
vi.mock("./user-perks", () => ({ requestOrigin: () => "https://portal.example" }));
vi.mock("./hourly-gift-rankings", () => ({ getHourlyGiftRankings: mocks.ranking }));
vi.mock("./rate-limit", () => ({ isRateLimited: mocks.limited }));
import { GET } from "../app/api/rankings/hourly-gifts/route.js";
import { GET as aliasGET } from "../app/api/v1/rankings/hourly-gifts/route.js";

beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ id: "internal", publicId: "USR-test" }); mocks.limited.mockReturnValue(false); mocks.ranking.mockResolvedValue({ scope: "GLOBAL_GIFT_SENDING", viewer: { sentCoins: "9007199254740993" } }); });
const request = (query = "") => new Request(`https://portal.example/api/rankings/hourly-gifts${query}`);
describe("hourly route authentication and errors", () => {
  it("shares the exact handler with v1 and returns no-store, exact decimal strings", async () => {
    expect(aliasGET).toBe(GET);
    const r = await GET(request());
    expect(r.status).toBe(200); expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect((await r.json()).data.viewer.sentCoins).toBe("9007199254740993");
    expect(mocks.auth).toHaveBeenCalledWith(expect.any(Request), { syncVip: false });
  });
  it("never computes scores for unauthenticated requests", async () => {
    mocks.auth.mockRejectedValue(new Error("INVALID_SESSION"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try { expect((await GET(request())).status).toBe(401); expect(mocks.ranking).not.toHaveBeenCalled(); } finally { log.mockRestore(); }
  });
  it("rejects client-supplied contributions instead of treating them as scores", async () => {
    const r = await GET(request("?score=9999"));
    expect(r.status).toBe(422); expect((await r.json()).error.code).toBe("VALIDATION_ERROR"); expect(mocks.ranking).not.toHaveBeenCalled();
  });
  it("rate limits before aggregate computation", async () => {
    mocks.limited.mockReturnValue(true); const r = await GET(request());
    expect(r.status).toBe(429); expect(mocks.ranking).not.toHaveBeenCalled();
  });
  it("missing schema produces unavailable, never a success with zero", async () => {
    mocks.ranking.mockRejectedValue({ code: "P2021" }); const r = await GET(request());
    expect(r.status).toBe(503); expect(await r.json()).toMatchObject({ success: false, error: { code: "HOURLY_RANKINGS_UNAVAILABLE" } });
  });
  it("preserves hour-change retry errors", async () => {
    mocks.ranking.mockRejectedValue({ code: "HOUR_CHANGED", status: 409, message: "Refresh." }); const r = await GET(request());
    expect(r.status).toBe(409); expect((await r.json()).error.code).toBe("HOUR_CHANGED");
  });
});
