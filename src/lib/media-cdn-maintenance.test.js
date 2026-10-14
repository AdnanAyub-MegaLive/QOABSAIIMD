import { it, expect, vi, afterEach } from "vitest";
import { createMediaCdnMaintenance } from "./media-cdn-maintenance.js";
const publicAsset = { id: "1", publicId: "AST-1", active: true, category: "GIFTS", isGlobal: true, mimeType: "image/png" };
afterEach(() => vi.unstubAllEnvs());
it("retries public uploads, never loading or publishing private bytes", async () => {
  vi.stubEnv("MEDIA_CDN_ENABLED", "true");
  const rows = [publicAsset, { ...publicAsset, id:"2", isGlobal:false }, { ...publicAsset, id:"3", category:"MUSIC_TRACKS" }, { ...publicAsset, id:"4", category:"AVATARS" }, { ...publicAsset, id:"5", audioRoomId:"room" }];
  const db = { uploadAsset: { findMany:vi.fn().mockResolvedValue(rows), findUnique:vi.fn().mockResolvedValue(publicAsset) } };
  const mirror = vi.fn();
  await createMediaCdnMaintenance(db, mirror)();
  expect(db.uploadAsset.findUnique).toHaveBeenCalledTimes(1);
  expect(mirror).toHaveBeenCalledExactlyOnceWith(db, publicAsset);
});
it("rechecks eligibility after reading current state", async () => {
  vi.stubEnv("MEDIA_CDN_ENABLED", "true");
  const db = { uploadAsset: { findMany:vi.fn().mockResolvedValue([publicAsset]), findUnique:vi.fn().mockResolvedValue({...publicAsset,isGlobal:false}) } };
  const mirror = vi.fn(); await createMediaCdnMaintenance(db, mirror)(); expect(mirror).not.toHaveBeenCalled();
});
it("does nothing while CDN is disabled", async () => {
  vi.stubEnv("MEDIA_CDN_ENABLED", "false");
  const db={uploadAsset:{findMany:vi.fn()}};await createMediaCdnMaintenance(db)();expect(db.uploadAsset.findMany).not.toHaveBeenCalled();
});
it("prevents overlapping retries and retries again after a failure", async () => {
  vi.stubEnv("MEDIA_CDN_ENABLED", "true");
  const db={uploadAsset:{findMany:vi.fn().mockResolvedValue([publicAsset]),findUnique:vi.fn().mockResolvedValue(publicAsset)}};
  let release; const mirror=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(publicAsset);
  const run=createMediaCdnMaintenance(db,mirror);const first=run();await vi.waitFor(()=>expect(release).toBeTypeOf("function"));await run();expect(mirror).toHaveBeenCalledTimes(1);release();await first;
  const log=vi.spyOn(console,"error").mockImplementation(()=>{});try{await run();await run();expect(mirror).toHaveBeenCalledTimes(3);}finally{log.mockRestore();}
});
