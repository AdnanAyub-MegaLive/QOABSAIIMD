import { describe, expect, it, vi } from "vitest";
vi.mock("./prisma.js", () => ({ prisma: {} }));
import { vipTagForLevel } from "./vip-commerce.js";

describe("VIP tag for a level", () => {
  const tags = [{ publicId: "T3", minimumVipLevel: 3 }, { publicId: "T1", minimumVipLevel: 1 }];
  it("picks the highest tag not above the level", () => {
    expect(vipTagForLevel(tags, 1)?.publicId).toBe("T1");
    expect(vipTagForLevel(tags, 2)?.publicId).toBe("T1");
    expect(vipTagForLevel(tags, 3)?.publicId).toBe("T3");
    expect(vipTagForLevel(tags, 7)?.publicId).toBe("T3");
  });
  it("returns nothing when no tag applies", () => {
    expect(vipTagForLevel([{ publicId: "T3", minimumVipLevel: 3 }], 2)).toBeNull();
    expect(vipTagForLevel([], 5)).toBeNull();
  });
});
