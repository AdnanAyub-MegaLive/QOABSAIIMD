import { beforeEach, describe, expect, it, vi } from "vitest";

const hasVip = vi.fn();
const create = vi.fn();
vi.mock("@/lib/mobile-api", async (orig) => ({ ...(await orig()), requireMobileUser: vi.fn(async () => ({ id: "u1", publicId: "USR-1" })) }));
vi.mock("@/lib/vip-capabilities", () => ({ hasVipPrivilege: (...a) => hasVip(...a) }));
vi.mock("@/lib/messaging", () => ({ createGroupConversation: (...a) => create(...a), emitConversationEvent: vi.fn(), groupConversationWithArtwork: vi.fn(async (c) => c) }));
vi.mock("@/lib/user-perks", () => ({ requestOrigin: () => "https://portal.test" }));

const { POST } = await import("@/app/api/v1/conversations/groups/route");
const req = () => new Request("https://portal.test/api/v1/conversations/groups", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": `198.51.100.${Math.floor(Math.random() * 200)}` }, body: JSON.stringify({ name: "G", participantIds: ["USR-2"] }) });

describe("group creation VIP gate", () => {
  beforeEach(() => { hasVip.mockReset(); create.mockReset(); });
  it("refuses users without the GROUP_CHAT privilege", async () => {
    hasVip.mockResolvedValue(false);
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("VIP_PRIVILEGE_REQUIRED");
    expect(hasVip).toHaveBeenCalledWith("u1", "GROUP_CHAT");
    expect(create).not.toHaveBeenCalled();
  });
  it("lets VIP users with the privilege create groups", async () => {
    hasVip.mockResolvedValue(true);
    create.mockResolvedValue({ publicId: "conv-1" });
    const res = await POST(req());
    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalled();
  });
});
