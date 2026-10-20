import {expect,it,vi} from "vitest";
import {discoverNotification,notifyMentions} from "./discover-notifications.js";
it("deduplicates repeated likes with stable source keys and includes actor/navigation data",async()=>{
  const rows=new Map();
  const db={user:{findUnique:async()=>({publicId:"USR-A",name:"A",profileImage:"/a.png"})},notification:{upsert:vi.fn(async({where,create})=>{if(!rows.has(where.sourceKey))rows.set(where.sourceKey,create);return rows.get(where.sourceKey);})}};
  const action={actorId:"a",userId:"b",type:"POST_LIKE",postId:"PST-1",key:"p:a"};
  await discoverNotification(db,action);await discoverNotification(db,action);
  await discoverNotification(db,{...action,userId:"a"});
  expect(rows.size).toBe(1);
  expect([...rows.values()][0]).toMatchObject({type:"POST_LIKE",action:{postId:"PST-1",actor:{publicId:"USR-A",name:"A",profileImage:"/a.png"}}});
});
it("does not create mentions for blocked users",async()=>{
  const db={user:{findMany:async()=>[{id:"b"}],findUnique:vi.fn()},userBlock:{findFirst:async()=>({})},notification:{upsert:vi.fn()}};
  await notifyMentions(db,{actorId:"a",text:"Hello @USR-123",postId:"PST-1"});
  expect(db.notification.upsert).not.toHaveBeenCalled();
});
