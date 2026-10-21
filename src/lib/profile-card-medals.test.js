import { afterEach, expect, it, vi } from "vitest";
vi.mock("./activity-levels.js",()=>({activityProgress:async()=>({level:5,badgeAssetId:"AST-level"})}));
import { profileCardArtwork, validateCardRanges, normalizeCardRanges } from "./profile-card-artwork.js";
const asset=(id,type="application/svga",version="abc123")=>({publicId:id,mimeType:type,mediaVersion:version});
function db(ranges,assets){return {profileCardArtwork:{findUnique:async()=>({ranges})},uploadAsset:{findMany:vi.fn(async()=>assets)},user:{count:async()=>4}};}
afterEach(()=>vi.unstubAllEnvs());
it("preserves the legacy Supporter badge as TOP 1 but respects explicit removal",()=>{
 const legacy={track:"SUPPORTER",min:0,max:9,badgeAssetId:"AST-old"};
 expect(validateCardRanges([legacy])[0].top1MedalAssetId).toBe("AST-old");
 expect(normalizeCardRanges([{...legacy,top1MedalAssetId:null}])[0].top1MedalAssetId).toBeNull();
});
it("returns separate versioned public medals and backgrounds from the matching Charm range",async()=>{
 vi.stubEnv("AUTH_SECRET","test-only");
 const database=db([{track:"SUPPORTER",min:10,max:19,backgroundAssetId:"AST-bg",top1MedalAssetId:"AST-one",top2MedalAssetId:"AST-two",top3MedalAssetId:null}],[asset("AST-bg","video/mp4"),asset("AST-one"),asset("AST-two","image/png")]);
 const result=await profileCardArtwork(database,"u",10,"https://portal.test",null);
 expect(result.supporterMedals.top1).toMatchObject({mimeType:"application/svga",version:"abc123"});
 expect(result.supporterMedals.top1.url).toContain("displaySig=");expect(result.supporterMedals.top1.url).toContain("v=abc123");
 expect(result.cardBackgrounds.supporter.mimeType).toBe("video/mp4");expect(result.supporterMedals.top3).toBeNull();
 expect(database.uploadAsset.findMany.mock.calls[0][0].where).toMatchObject({active:true,isGlobal:true});
});
it("returns null artwork outside a range or after removing ranges",async()=>{
 const result=await profileCardArtwork(db([],[]),"u",20,"https://portal.test",null);
 expect(result.cardBackgrounds.supporter).toBeNull();expect(result.supporterMedals).toEqual({top1:null,top2:null,top3:null});
});
it("returns agency medal metadata and falls back to the current level badge",async()=>{
 vi.stubEnv("AUTH_SECRET","test-only");
 const agency={id:"a",publicId:"AGN-1",name:"Agency"};
 const database=db([{track:"AGENCY",min:5,max:10,backgroundAssetId:"AST-bg",badgeAssetId:"AST-medal"}],[asset("AST-bg","image/webp"),asset("AST-medal","image/gif","newhash"),asset("AST-level","image/png")]);
 const selected=(await profileCardArtwork(database,"u",0,"https://portal.test",agency)).agency;
 expect(selected).toMatchObject({badgeMimeType:"image/gif",badgeVersion:"newhash",cardBackgroundVersion:"abc123",totalHosts:4});
 const fallback=(await profileCardArtwork(db([],[asset("AST-level","image/png")]),"u",0,"https://portal.test",agency)).agency;
 expect(fallback.badgeUrl).toContain("AST-level");expect(fallback.badgeMimeType).toBe("image/png");
});
it("changes URL cache version when bytes change and tolerates missing origin",async()=>{
 vi.stubEnv("AUTH_SECRET","test-only");
 const ranges=[{track:"SUPPORTER",min:0,max:null,top1MedalAssetId:"AST-one"}];
 const first=await profileCardArtwork(db(ranges,[asset("AST-one")]),"u",0,"https://portal.test",null);
 const next=await profileCardArtwork(db(ranges,[asset("AST-one","application/svga","changed")]),"u",0,"https://portal.test",null);
 expect(first.supporterMedals.top1.url).not.toBe(next.supporterMedals.top1.url);
 expect((await profileCardArtwork(db(ranges,[asset("AST-one")]),"u",0,null,null)).supporterMedals.top1).toBeNull();
});
