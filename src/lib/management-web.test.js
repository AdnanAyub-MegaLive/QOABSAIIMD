import { expect,it } from "vitest";
import { validateManagementSession,tokenHash } from "./management-web.js";
import { countryModerator,moderateCountryTarget } from "./management-moderation.js";
const me={id:"a",publicId:"USR-A",status:"ACTIVE",deletedAt:null,sessionVersion:2,appRoles:["SUPER_ADMIN"],country:"PK"};
const row={userId:"a",sessionVersion:2,mobileIssuedAt:BigInt(Date.now()),expiresAt:new Date(Date.now()+60000),mobileExpiresAt:new Date(Date.now()+60000)};
const dbFor=user=>({user:{findUnique:async()=>user},ban:{findFirst:async()=>null}});
it("revalidates roles and session revocation on every management request",async()=>{
 expect((await validateManagementSession(row,dbFor(me))).id).toBe("a");
 for(const change of [{appRoles:["ADMIN"]},{status:"BANNED"},{sessionVersion:3},{deletedAt:new Date()}])await expect(validateManagementSession(row,dbFor({...me,...change}))).rejects.toThrow();
 await expect(validateManagementSession({...row,mobileExpiresAt:new Date(0)},dbFor(me))).rejects.toThrow();
});
it("revokes web access when its device is banned",async()=>{await expect(validateManagementSession({...row,deviceId:"d"},{...dbFor(me),device:{findUnique:async()=>({isBanned:true})}})).rejects.toThrow();});
it("keeps Country Head access separate from Super Admin ban authority",async()=>{expect((await validateManagementSession(row,dbFor({...me,appRoles:["COUNTRY_HEAD"]}))).id).toBe("a");await expect(countryModerator("a",dbFor({...me,appRoles:["COUNTRY_HEAD"]}))).rejects.toThrow();});
it("denies cross-country mutations before writing any moderation data",async()=>{const db={user:{findUnique:async({where})=>where.id?me:{id:"b",country:"US",status:"ACTIVE"}}};db.$transaction=work=>work(db);await expect(moderateCountryTarget("a",{type:"USER",action:"BAN",publicId:"USR-B",reason:"test",durationMinutes:60},db)).rejects.toThrow("outside your country");});
it("stores a digest rather than the bearer handoff secret",()=>{expect(tokenHash("abc")).toHaveLength(64);expect(tokenHash("abc")).not.toContain("abc");});
