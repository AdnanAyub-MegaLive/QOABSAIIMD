import { describe, expect, it, vi } from "vitest";
import { avatarDisplayUrl, readAvatarHistory, updateProfileWithHistory } from "./avatar-history.js";
const origin = "https://portal.example";
describe("avatar display safety", () => {
  it("supports presets and web URLs", () => {
    expect(avatarDisplayUrl("avatar:robot", origin)).toBe("avatar:robot");
    expect(avatarDisplayUrl("/uploads/a.jpg", origin)).toBe(origin + "/uploads/a.jpg");
    expect(avatarDisplayUrl("https://cdn.example/a.jpg", origin)).toBe("https://cdn.example/a.jpg");
  });
  it.each(["C:\\private\\a.jpg", "file:///a.jpg", "content://a", "javascript:alert(1)", "data:image/png;base64,a", "//evil.example/a", "/etc/passwd"])("rejects private or executable value %s", value => {
    expect(avatarDisplayUrl(value, origin)).toBeNull();
  });
});
describe("avatar history", () => {
  function db(current = "avatar:robot") {
    const tx = {
      $queryRaw: vi.fn(async () => []),
      user: { findUnique: vi.fn(async () => ({ profileImage: current })), update: vi.fn(async ({ data }) => data) },
      userProfileSettings: { findUnique: vi.fn(async () => ({ avatarHistoryLimit: 20 })) },
      userAvatarHistory: { findFirst: vi.fn(async () => null), create: vi.fn(), findMany: vi.fn(async () => []), deleteMany: vi.fn() },
    };
    return { ...tx, $transaction: fn => fn(tx) };
  }
  it("archives prior image and updates in the transaction", async () => {
    const database = db();
    await updateProfileWithHistory(database, "u1", { profileImage: "avatar:cat" });
    expect(database.userAvatarHistory.create).toHaveBeenCalledWith({ data: { userId: "u1", imageUrl: "avatar:robot", createdAt: expect.any(Date) } });
    expect(database.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { profileImage: "avatar:cat" } });
  });
  it("does not archive unchanged or consecutive duplicate images", async () => {
    const database = db();
    await updateProfileWithHistory(database, "u1", { profileImage: "avatar:robot" });
    database.userAvatarHistory.findFirst.mockResolvedValue({ imageUrl: "avatar:robot" });
    await updateProfileWithHistory(database, "u1", { profileImage: null });
    expect(database.userAvatarHistory.create).not.toHaveBeenCalled();
  });
  it("returns only own valid historical display URLs, excluding current picture", async () => {
    const database = db();
    database.userAvatarHistory.findMany.mockResolvedValue(["avatar:robot", "avatar:cat", "file:///private"].map((imageUrl, id) => ({ id: String(id), imageUrl, createdAt: new Date(0) })));
    expect(await readAvatarHistory(database, "u1", origin)).toEqual([{ id: "1", imageUrl: "avatar:cat", createdAt: new Date(0).toISOString() }]);
    expect(database.userAvatarHistory.findMany.mock.calls[0][0]).toMatchObject({ where: { userId: "u1" }, take: 20 });
  });
});
