import { expect, it, vi } from "vitest";
import { rejectDuplicateArtwork } from "./upload-duplicates";

it("locks identical content consistently and keeps different content/categories separate", async () => {
  const tx = { $executeRaw: vi.fn(), uploadAsset: { findFirst: vi.fn().mockResolvedValue(null) } };
  for (const [category, bytes] of [["FRAMES", "a"], ["FRAMES", "a"], ["FRAMES", "b"], ["BADGES", "a"]]) {
    await rejectDuplicateArtwork(tx, { category, bytes: Buffer.from(bytes) });
  }
  const keys = tx.$executeRaw.mock.calls.map(args => args.slice(1));
  expect(keys[0]).toEqual(keys[1]);
  expect(keys[0]).not.toEqual(keys[2]);
  expect(keys[0]).not.toEqual(keys[3]);
  expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.uploadAsset.findFirst.mock.invocationCallOrder[0]);
  expect(tx.uploadAsset.findFirst.mock.calls[0][0].where).toMatchObject({ archivedAt: null, audioRoomId: null, category: "FRAMES", fileSize: 1, fileData: Buffer.from("a") });
});

it("does not affect uploads outside the VIP artwork categories", async () => {
  const tx = { $executeRaw: vi.fn(), uploadAsset: { findFirst: vi.fn() } };
  await rejectDuplicateArtwork(tx, { category: "MUSIC_TRACKS", bytes: Buffer.from("music") });
  expect(tx.$executeRaw).not.toHaveBeenCalled();
  expect(tx.uploadAsset.findFirst).not.toHaveBeenCalled();
});

it("does not silently reuse disabled assets", async () => {
  const tx = { $executeRaw: vi.fn(), uploadAsset: { findFirst: vi.fn().mockResolvedValue({ publicId: "AST-DISABLED", active: false }) } };
  await expect(rejectDuplicateArtwork(tx, { category: "BADGES", bytes: Buffer.from("badge") })).rejects.toThrow("Enable the existing artwork");
});
