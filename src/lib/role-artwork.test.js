import { expect, it, vi } from "vitest";
vi.mock("./upload-assets.js",()=>({createPublicDisplayAssetUrl:(origin,id)=>`${origin}/display/${id}`}));
import { resolveRoleTags } from "./role-tags.js";
import { validateTopUpTargets } from "./role-topup-targets.js";
it("returns graphical role metadata without replacing equipped badges",async()=>{
  const db={uploadAsset:{findMany:async()=>[{publicId:"AST-CS",category:"USER_TAGS",distribution:"ROLE_CS",mimeType:"image/png"}]}};
  const tags=await resolveRoleTags([{publicId:"USR-1",appRoles:["CS","BD"]}],"https://portal.example",db);
  expect(tags.get("USR-1").find(t=>t.role==="CS")).toMatchObject({assetId:"AST-CS",mimeType:"image/png"});
  expect(tags.get("USR-1").find(t=>t.role==="BD").imageUrl).toBeNull();
});
it("validates salary drafts without inventing rates",()=>{
  const row={role:"BD",targetDiamonds:"1000",salaryAmount:"10",salaryCurrency:"USD",scope:"OWN"};
  expect(validateTopUpTargets([row])).toEqual([row]);
  expect(()=>validateTopUpTargets([row,row])).toThrow();
  expect(()=>validateTopUpTargets([{...row,targetDiamonds:"-1"}])).toThrow();
  expect(()=>validateTopUpTargets([{...row,scope:"SUBTREE"}])).toThrow();
  expect(()=>validateTopUpTargets([{...row,salaryCurrency:"COINS",salaryAmount:"1.5"}])).toThrow();
});
