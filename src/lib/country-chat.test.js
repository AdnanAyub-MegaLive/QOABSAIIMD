import {expect,it,vi} from "vitest";
import {assertNoCountryLinks,userChatCountry,countryMessageFilter,refreshCountryChatRooms} from "./country-chat.js";
it.each(["https://site.com","www.site.pk","name.com","t.me/a","wa.me/123","bit.ly/x","hello example.pk!","ｅｘａｍｐｌｅ.com","ex\u200bample.com"])("rejects link %s",text=>{
  expect(()=>assertNoCountryLinks(text)).toThrow("Links are not allowed");
});
it("allows ordinary text and reads country from server data only",async()=>{
  expect(()=>assertNoCountryLinks("Hello everyone! 10.25 points")).not.toThrow();
  const db={user:{findUnique:vi.fn(async()=>({country:"Pakistan"}))}};
  expect(await userChatCountry(db,"u",true)).toBe("PK");
  db.user.findUnique.mockResolvedValue({country:null});
  await expect(userChatCountry(db,"u",true)).rejects.toMatchObject({code:"COUNTRY_REQUIRED"});
  expect(countryMessageFilter(null)).toEqual({senderCountry:"__NO_COUNTRY__"});
});
it("removes stale/global socket memberships and isolates PK/DE/missing-country users",async()=>{
  const sockets=["a","b","c"].map(id=>({data:{userId:id},rooms:new Set(["conversation:CONV-WORLD","conversation:CONV-WORLD:PK"]),leave:vi.fn(async function(r){this.rooms.delete(r);}),join:vi.fn(async function(r){this.rooms.add(r);})}));
  const db={user:{findMany:vi.fn(async()=>[{publicId:"a",country:"PK"},{publicId:"b",country:"DE"},{publicId:"c",country:null}])}};
  await refreshCountryChatRooms(db,{sockets:{sockets:new Map(sockets.map((s,i)=>[i,s]))}});
  expect([...sockets[0].rooms]).toEqual(["conversation:CONV-WORLD:PK"]);
  expect([...sockets[1].rooms]).toEqual(["conversation:CONV-WORLD:DE"]);
  expect([...sockets[2].rooms]).toEqual([]);
  expect(db.user.findMany).toHaveBeenCalledTimes(1);
});
