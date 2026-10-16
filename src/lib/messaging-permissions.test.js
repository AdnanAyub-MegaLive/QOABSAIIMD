import {it,expect,vi} from "vitest";
vi.mock("./prisma.js",()=>({prisma:{}}));
import {assertMutualFollow,assertConversationMessagingAllowed} from "./user-blocks.js";
function client(roles=[],count=0){return {userBlock:{findFirst:vi.fn(async()=>null)},user:{findMany:vi.fn(async()=>[{status:"ACTIVE",appRoles:[]},{status:"ACTIVE",appRoles:roles}])},userFollow:{count:vi.fn(async()=>count)},conversationParticipant:{findFirst:async()=>({userId:"b"})}};}
it("requires both follows, not friendship",async()=>{
 for(const count of [0,1])await expect(assertMutualFollow("a","b",client([],count))).rejects.toMatchObject({code:"MUTUAL_FOLLOW_REQUIRED"});
 await expect(assertMutualFollow("a","b",client([],2))).resolves.toBeUndefined();
});
it.each(["RESELLER","CS","CS_LEADER"])("permits %s but never overrides blocks",async role=>{
 const db=client([role]);await assertMutualFollow("a","b",db);expect(db.userFollow.count).not.toHaveBeenCalled();
 db.userBlock.findFirst.mockResolvedValue({blockerId:"a"});await expect(assertMutualFollow("a","b",db)).rejects.toMatchObject({code:"USER_BLOCKED"});
});
it("permits old history after unfollow but rejects sending",async()=>{
 const db=client();await assertConversationMessagingAllowed({kind:"DIRECT",id:"c"},"a",db);
 await expect(assertConversationMessagingAllowed({kind:"DIRECT",id:"c"},"a",db,true)).rejects.toMatchObject({code:"MUTUAL_FOLLOW_REQUIRED"});
 for(const kind of ["WORLD","GROUP"])await assertConversationMessagingAllowed({kind},"a",db,true);
});
