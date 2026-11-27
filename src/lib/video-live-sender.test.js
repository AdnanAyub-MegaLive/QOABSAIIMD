import { beforeEach, expect, it, vi } from "vitest";
const { resolve } = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("./gift-sender.js", () => ({ resolveGiftSender: resolve }));
import { liveChatSender, clearLiveChatSenderCache, LIVE_SENDER_TTL_MS } from "./video-live.js";
const user = { id: "u1", publicId: "USR-1", name: "One", profileImage: null, isOfficial: false };
beforeEach(() => { clearLiveChatSenderCache(); resolve.mockReset(); });

it("falls back to a basic sender instead of throwing when perks fail", async () => {
  resolve.mockRejectedValueOnce(new Error("db down"));
  expect(await liveChatSender(user, "https://portal.test")).toEqual({ publicId: "USR-1", name: "One", profileImage: null, badgeUrls: [], isOfficial: false });
  resolve.mockResolvedValueOnce({ publicId: "USR-1", badgeUrl: "b" });
  expect((await liveChatSender(user, "https://portal.test")).badgeUrls).toEqual(["b"]);
});

it("caches the sender per user for a short time", async () => {
  resolve.mockResolvedValue({ publicId: "USR-1", badgeUrl: null });
  const t = Date.now();
  await liveChatSender(user, "o", t); await liveChatSender(user, "o", t + 1000);
  expect(resolve).toHaveBeenCalledTimes(1);
  await liveChatSender(user, "o", t + LIVE_SENDER_TTL_MS + 1);
  expect(resolve).toHaveBeenCalledTimes(2);
});
