import { afterEach, it, expect, vi } from "vitest";
import { vipTagAssets, vipTagListenerConnection, invalidateVipTags } from "./vip-tag-cache.js";
afterEach(() => vipTagListenerConnection(false));
it("reuses rows while connected and refreshes immediately on invalidation", async () => {
  const db = { uploadAsset: { findMany: vi.fn().mockResolvedValueOnce([{ publicId: "old" }]).mockResolvedValueOnce([{ publicId: "new" }]) } };
  vipTagListenerConnection(true);
  expect(await vipTagAssets(db)).toEqual([{ publicId: "old" }]);
  await vipTagAssets(db);
  expect(db.uploadAsset.findMany).toHaveBeenCalledTimes(1);
  invalidateVipTags();
  expect(await vipTagAssets(db)).toEqual([{ publicId: "new" }]);
});
it("bypasses cache during listener outages", async () => {
  const db = { uploadAsset: { findMany: vi.fn(async () => []) } };
  vipTagListenerConnection(false);
  await vipTagAssets(db); await vipTagAssets(db);
  expect(db.uploadAsset.findMany).toHaveBeenCalledTimes(2);
});
it("an in-flight stale read cannot repopulate the invalidated cache", async () => {
  let resolve;
  const db = { uploadAsset: { findMany: vi.fn().mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValueOnce([{ publicId: "new" }]) } };
  vipTagListenerConnection(true);
  const old = vipTagAssets(db);
  invalidateVipTags();
  resolve([{ publicId: "old" }]); await old;
  expect(await vipTagAssets(db)).toEqual([{ publicId: "new" }]);
});
