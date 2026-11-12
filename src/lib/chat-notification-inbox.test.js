import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ list: vi.fn(), count: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { notification: { findMany: m.list, count: m.count } } }));
vi.mock("./mobile-api", () => ({ requireMobileUser: async () => ({ id: "viewer" }), mobileJson: body => Response.json(body), mobileApiError: e => { throw e; }, mobileOptions: () => {} }));
vi.mock("../app/api/admin/notifications/route", () => ({ POST: () => {} }));
import { GET } from "../app/api/notifications/route.js";
beforeEach(() => { vi.clearAllMocks(); m.list.mockResolvedValue([]); m.count.mockResolvedValue(0); });
it.each(["", "?types=CHAT_MESSAGE,OFFICIAL"])("excludes stored chat alerts from both list and unread count %s", async query => {
  const response = await GET(new Request(`https://portal.test/api/notifications${query}`));
  expect(response.status).toBe(200);
  for (const method of [m.list, m.count]) {
    const visibility = method.mock.calls[0][0].where.AND[0];
    expect(visibility.AND).toContainEqual({ type: { not: "CHAT_MESSAGE" } });
  }
});
