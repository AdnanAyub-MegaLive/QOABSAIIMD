import { describe, it, expect, vi } from "vitest";
import { campaignRequestKey, campaignTransaction } from "./campaign-request";

describe("campaign request isolation", () => {
  it("scopes the same request ID to user and room", () => {
    expect(new Set([campaignRequestKey("u1", "r1", "same"), campaignRequestKey("u2", "r1", "same"), campaignRequestKey("u1", "r2", "same")]).size).toBe(3);
  });
  it("retries serialization conflicts with a bounded attempt count", async () => {
    const db = { $transaction: vi.fn().mockRejectedValueOnce({ code: "P2034" }).mockResolvedValue("done") };
    expect(await campaignTransaction(db, vi.fn())).toBe("done");
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    db.$transaction.mockReset().mockRejectedValue({ code: "P2034" });
    await expect(campaignTransaction(db, vi.fn())).rejects.toEqual({ code: "P2034" });
    expect(db.$transaction).toHaveBeenCalledTimes(3);
  });
});
