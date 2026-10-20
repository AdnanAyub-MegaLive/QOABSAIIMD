import {beforeEach,expect,it,vi} from "vitest";
import sharp from "sharp";
vi.mock("./prisma.js",()=>({prisma:{}}));
const {filter}=vi.hoisted(()=>({filter:vi.fn(async()=>{})}));
vi.mock("./chat-word-policy.js",()=>({assertChatWordsAllowed:filter}));
import {changeGroup,removeGroupMemberSafely,decodeGroupIcon,groupDetails} from "./group-details.js";
let db,state;
beforeEach(()=>{
  filter.mockReset().mockResolvedValue();
  const users=["a","b"].map(id=>({id,publicId:`USR-${id}`,name:id.toUpperCase()}));
  state={group:{id:"c",publicId:"CONV-c",kind:"GROUP",name:"Old name",description:null,revision:0,createdAt:new Date(),participants:users.map((user,i)=>({id:`p${i}`,userId:user.id,user,role:i?"MEMBER":"OWNER",joinedAt:new Date()}))},requests:[],messages:[],events:[],icons:[]};
  db={
    userEquippedProp:{findMany:vi.fn(async()=>[])},
    user:{findFirst:vi.fn(async({where})=>users.find(u=>u.id===where.id))},
    conversation:{findUnique:async()=>structuredClone(state.group),update:async({data})=>{const {revision,...rest}=data;Object.assign(state.group,rest);if(revision)state.group.revision++;return structuredClone(state.group);}},
    conversationParticipant:{update:async({where,data})=>Object.assign(state.group.participants.find(p=>p.id===where.id),data),delete:async({where})=>{state.group.participants=state.group.participants.filter(p=>p.id!==where.id);}},
    groupChangeRequest:{findUnique:async({where})=>state.requests.find(r=>r.actorId===where.actorId_requestId.actorId&&r.requestId===where.actorId_requestId.requestId),create:async({data})=>state.requests.push(data)},
    message:{create:async({data})=>{const row={id:`m${state.messages.length}`,createdAt:new Date(),...data};state.messages.push(row);return row;}},
    realtimeOutbox:{create:async({data})=>state.events.push(data)},messageReceipt:{createMany:vi.fn()},auditLog:{create:vi.fn()},
    groupIcon:{findFirst:async({where})=>state.icons.find(i=>i.id===where.id),update:async({where,data})=>Object.assign(state.icons.find(i=>i.id===where.id),data)},
  };
  db.$transaction=async(fn)=>{const before=structuredClone(state);try{return await fn(db);}catch(e){state=before;throw e;}};
});
it("updates details once, returns owner/icon metadata and emits one system line",async()=>{
  const result=await changeGroup("CONV-c","a","request-1",{name:"New name",description:"Hello"},db);
  expect(result.conversation).toMatchObject({name:"New name",description:"Hello",owner:{publicId:"USR-a"},iconUrl:null,revision:1});
  expect(state.messages).toHaveLength(1);expect(state.messages[0]).toMatchObject({kind:"system",senderId:null});
  expect(state.events.map(e=>e.event)).toEqual(["message:new","conversation:updated"]);
  expect(await changeGroup("CONV-c","a","request-1",{name:"New name",description:"Hello"},db)).toEqual(result);
  expect(state.messages).toHaveLength(1);
  await expect(changeGroup("CONV-c","a","request-1",{name:"Other name"},db)).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
});
it("rejects nonowners, removed and banned actors",async()=>{
  await expect(changeGroup("CONV-c","b","request-1",{name:"New"},db)).rejects.toMatchObject({code:"GROUP_OWNER_REQUIRED"});
  state.group.participants=state.group.participants.filter(p=>p.userId!=="b");
  await expect(changeGroup("CONV-c","b","request-1",{name:"New"},db)).rejects.toMatchObject({code:"CONVERSATION_NOT_FOUND"});
  db.user.findFirst.mockResolvedValue(null);
  await expect(changeGroup("CONV-c","a","request-1",{name:"New"},db)).rejects.toMatchObject({code:"USER_NOT_FOUND"});
  expect(state.messages).toHaveLength(0);
});
it("validates length, word policy and clearing without no-op system lines",async()=>{
  await expect(changeGroup("CONV-c","a","request-1",{description:"x".repeat(501)},db)).rejects.toMatchObject({code:"VALIDATION_ERROR"});
  await expect(changeGroup("CONV-c","a","request-1",{name:"x"},db)).rejects.toMatchObject({code:"GROUP_NAME_INVALID"});
  filter.mockRejectedValueOnce(Object.assign(Error("word"),{code:"INAPPROPRIATE_WORD"}));
  await expect(changeGroup("CONV-c","a","request-1",{name:"Bad name"},db)).rejects.toMatchObject({code:"INAPPROPRIATE_WORD"});
  await changeGroup("CONV-c","a","request-1",{name:"Old name",description:""},db);
  expect(state.messages).toHaveLength(0);
  state.group.description="Old description";
  expect((await changeGroup("CONV-c","a","request-2",{description:null},db)).conversation.description).toBeNull();
});
it("transfers ownership atomically; former owner can replay then leave",async()=>{
  const result=await changeGroup("CONV-c","a","request-1",{ownerPublicId:"USR-b"},db);
  expect(result.conversation.owner.publicId).toBe("USR-b");
  expect(state.group.participants.filter(p=>p.role==="OWNER")).toHaveLength(1);
  expect(await changeGroup("CONV-c","a","request-1",{ownerPublicId:"USR-b"},db)).toEqual(result);
  await expect(changeGroup("CONV-c","a","request-2",{name:"No"},db)).rejects.toMatchObject({code:"GROUP_OWNER_REQUIRED"});
  await removeGroupMemberSafely("CONV-c","a","USR-a",db);
  expect(state.group.participants.map(p=>p.userId)).toEqual(["b"]);
});
it("requires ownership transfer before leaving, and closes a sole-owner group",async()=>{
  await expect(removeGroupMemberSafely("CONV-c","a","USR-a",db)).rejects.toMatchObject({code:"GROUP_OWNER_CANNOT_LEAVE"});
  await removeGroupMemberSafely("CONV-c","b","USR-b",db);
  const group=await removeGroupMemberSafely("CONV-c","a","USR-a",db);
  expect(group.closedAt).toBeInstanceOf(Date);expect(group.participants).toHaveLength(0);expect(groupDetails(group).closed).toBe(true);
});
it("retains old icon for one hour; repeated upload does not duplicate the system line",async()=>{
  state.icons=[{id:"old",expiresAt:null},{id:"new",mediaVersion:"hash",expiresAt:new Date(Date.now()+86400000)}];
  state.group.iconId="old";
  const input={icon:{id:"new",mediaVersion:"hash"}};
  await changeGroup("CONV-c","a","request-1",input,db);
  expect(state.icons[0].expiresAt.getTime()-Date.now()).toBeGreaterThan(3590000);
  expect(state.icons[1].expiresAt).toBeNull();expect(state.icons[1].publishedAt).toBeInstanceOf(Date);
  await changeGroup("CONV-c","a","request-1",input,db);
  expect(state.messages).toHaveLength(1);
  await changeGroup("CONV-c","a","request-2",{removeIcon:true},db);
  expect(state.group.iconId).toBeNull();
});
it("rolls back group changes when message persistence fails",async()=>{
  db.message.create=async()=>{throw Error("database failure");};
  await expect(changeGroup("CONV-c","a","request-1",{ownerPublicId:"USR-b",name:"Changed"},db)).rejects.toThrow("database failure");
  expect(state.group.name).toBe("Old name");expect(groupDetails(state.group).owner.publicId).toBe("USR-a");expect(state.requests).toHaveLength(0);
});
it("decodes still icons, strips metadata, and rejects animation, corruption and oversized files",async()=>{
  const bytes=await sharp({create:{width:20,height:10,channels:3,background:"red"}}).png().toBuffer();
  const output=await decodeGroupIcon(new File([bytes],"icon.png",{type:"image/png"}));
  expect((await sharp(output).metadata()).format).toBe("webp");
  await expect(decodeGroupIcon(new File([bytes],"bad.jpg",{type:"image/jpeg"}))).rejects.toMatchObject({code:"VALIDATION_ERROR"});
  await expect(decodeGroupIcon({size:5*1024*1024+1})).rejects.toMatchObject({code:"FILE_TOO_LARGE"});
  const animated=await sharp(Buffer.from([255,0,0,0,255,0]),{raw:{width:1,height:2,channels:3,pageHeight:1}}).webp({delay:[100,100]}).toBuffer();
  await expect(decodeGroupIcon(new File([animated],"animated.webp",{type:"image/webp"}))).rejects.toMatchObject({code:"VALIDATION_ERROR"});
});
