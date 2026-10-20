import { expect, it, vi } from "vitest";
vi.mock("./upload-assets.js", () => ({ createPublicDisplayAssetUrl: (origin, asset) => `${origin}/api/uploads/${typeof asset === "string" ? asset : asset.publicId}/file?displaySig=test` }));
import { groupMemberArtwork, memberArtwork } from "./group-member-artwork.js";

it("batches 100 members and includes only valid equipped frame and badge metadata", async () => {
  const participants = Array.from({length:100}, (_, i) => ({user:{id:`u${i}`,publicId:`USR-${i}`}}));
  const asset = (category, global = false) => ({publicId:`AST-${category}`,category,mimeType:"application/svga",mediaVersion:"abc",posterMimeType:"image/png",posterMediaVersion:"def",isGlobal:global,assignments:[{userId:"u0"}]});
  const db = {userEquippedProp:{findMany:vi.fn(async()=>[
    {userId:"u0",category:"FRAMES",asset:asset("FRAMES")},
    {userId:"u1",category:"BADGES",asset:asset("BADGES",true)},
    // Expired/not owned: another user's entitlement cannot authorize this.
    {userId:"u2",category:"BADGES",asset:asset("BADGES")},
  ])}};
  const result = await groupMemberArtwork(db,participants,"https://portal.example");
  expect(db.userEquippedProp.findMany).toHaveBeenCalledTimes(1);
  expect(db.userEquippedProp.findMany.mock.calls[0][0].where.userId.in).toHaveLength(100);
  expect(result.get("USR-0")).toMatchObject({frameMimeType:"application/svga",frameMediaVersion:"abc",framePosterMimeType:"image/png",badgeUrl:null});
  expect(result.get("USR-0").frameUrl).toContain("displaySig=");
  expect(result.get("USR-1")).toMatchObject({frameUrl:null,badgeMimeType:"application/svga"});
  expect(memberArtwork(result.get("USR-2"))).toMatchObject({frameUrl:null,badgeUrl:null});
  expect(memberArtwork(result.get("USR-99"))).toMatchObject({frameUrl:null,badgeUrl:null});
});
