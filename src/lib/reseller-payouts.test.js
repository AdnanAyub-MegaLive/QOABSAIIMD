import { it,expect,vi,afterEach } from "vitest";
import { encryptBank,decryptBank,normalizeBank,actOnPayout,uploadPayoutProof,payoutDto,escrowQuote,createEscrow,payoutAccess } from "./reseller-payouts.js";
afterEach(()=>vi.unstubAllEnvs());
const bank={accountHolder:"A",bankName:"Local",accountNumber:"1234567890",otherDetails:""};
function db(initial={}) {
 let row={id:"p",senderId:"s",resellerId:"r",diamonds:100n,hostSource:true,status:"PENDING",paymentDays:null,createdAt:new Date(),paymentDueAt:new Date(Date.now()+3*86400000),quote:{netUsdtMicros:"1000000"},...initial};
 const tx={$queryRaw:vi.fn(),resellerPayout:{findUnique:vi.fn(async()=>row),update:vi.fn(async({data})=>row={...row,...data})},user:{findUnique:vi.fn(async({where})=>({id:where.id,name:"Reseller",publicId:"USR-R",status:"ACTIVE",appRoles:where.id==="r"?["RESELLER"]:["HOST"]})),updateMany:vi.fn(async()=>({count:1}))},walletTransaction:{create:vi.fn()},auditLog:{create:vi.fn()},notification:{upsert:vi.fn()}};
 return {...tx,$transaction:fn=>fn(tx),row:()=>row};
}
it("encrypts bank details with tamper detection and validates input",()=>{
 vi.stubEnv("PAYOUT_BANK_ENCRYPTION_KEY","a".repeat(64));
 const value=encryptBank(bank);expect(value).not.toContain(bank.accountNumber);expect(decryptBank(value)).toEqual(bank);
 expect(()=>decryptBank("b"+value.slice(1))).toThrow();
 expect(()=>normalizeBank({...bank,accountNumber:""})).toThrow();
 expect(()=>normalizeBank({...bank,bankName:"a\nb"})).toThrow();
});
it.each([1,3,5])("anchors %s days to creation and does not allow a second selection",async days=>{
 const database=db();await actOnPayout(database,"p",{id:"r"},{action:"SET_DEADLINE",days});
 expect(+database.row().paymentDueAt-+database.row().createdAt).toBe(days*86400000);
 await actOnPayout(database,"p",{id:"r"},{action:"SET_DEADLINE",days});
 await expect(actOnPayout(database,"p",{id:"r"},{action:"SET_DEADLINE",days:days===1?3:1})).rejects.toMatchObject({code:"INVALID_STATE"});
});
it("proof upload does not release funds, submission starts 24h verification",async()=>{
 const database=db({paymentDays:3});
 await uploadPayoutProof(database,"p",{id:"r"},Buffer.from("decoded"),"image/jpeg");
 expect(database.row().status).toBe("PENDING");expect(database.user.updateMany).not.toHaveBeenCalled();
 await actOnPayout(database,"p",{id:"r"},{action:"SUBMIT_PROOF",reference:"bank-ref"});
 expect(database.row().status).toBe("AWAITING_HOST");
 expect(+database.row().verifyDueAt-+database.row().proofSubmittedAt).toBe(86400000);
 await actOnPayout(database,"p",{id:"r"},{action:"SUBMIT_PROOF"});
 expect(database.walletTransaction.create).not.toHaveBeenCalled();
});
it("host confirmation credits reseller once with Host provenance",async()=>{
 const database=db({status:"AWAITING_HOST",verifyDueAt:new Date(Date.now()+86400000)});
 await actOnPayout(database,"p",{id:"s"},{action:"CONFIRM_RECEIPT"});
 await actOnPayout(database,"p",{id:"s"},{action:"CONFIRM_RECEIPT"});
 expect(database.row().status).toBe("COMPLETED");expect(database.user.updateMany).toHaveBeenCalledTimes(1);
 expect(database.walletTransaction.create).toHaveBeenCalledWith({data:expect.objectContaining({userId:"r",type:"TRANSFER_RECEIVED",diamonds:100n,metadata:{escrow:true,verifiedHostTransfer:true}})});
 await expect(actOnPayout(database,"p",{admin:true,id:"a"},{action:"CANCEL",reason:"test"})).rejects.toMatchObject({code:"INVALID_STATE"});
});
it("unpaid deadline refunds exactly once",async()=>{
 const database=db({paymentDueAt:new Date(0)});
 await actOnPayout(database,"p",{system:true},{action:"EXPIRE"});await actOnPayout(database,"p",{system:true},{action:"EXPIRE"});
 expect(database.row().status).toBe("CANCELLED");expect(database.user.updateMany).toHaveBeenCalledTimes(1);
 expect(database.walletTransaction.create).toHaveBeenCalledWith({data:expect.objectContaining({userId:"s",type:"REFUND"})});
});
it("verification timeout holds funds until explicit support resolution",async()=>{
 const database=db({status:"AWAITING_HOST",verifyDueAt:new Date(0)});
 await actOnPayout(database,"p",{system:true},{action:"EXPIRE"});
 expect(database.row().status).toBe("SUPPORT_REVIEW");expect(database.user.updateMany).not.toHaveBeenCalled();
 await expect(actOnPayout(database,"p",{id:"s"},{action:"CONFIRM_RECEIPT"})).rejects.toMatchObject({code:"INVALID_STATE"});
 await actOnPayout(database,"p",{admin:true,id:"a"},{action:"RESOLVE_REFUND",reason:"Verified non-payment"});
 expect(database.row().status).toBe("CANCELLED");
});
it("host dispute holds funds and support may release once",async()=>{
 const database=db({status:"AWAITING_HOST",verifyDueAt:new Date(Date.now()+86400000)});
 await actOnPayout(database,"p",{id:"s"},{action:"DISPUTE",reason:"Not received"});
 expect(database.row().status).toBe("SUPPORT_REVIEW");expect(database.user.updateMany).not.toHaveBeenCalled();
 await actOnPayout(database,"p",{admin:true,id:"a"},{action:"RESOLVE_RELEASE",reason:"Bank confirmed settlement"});
 await actOnPayout(database,"p",{admin:true,id:"a"},{action:"RESOLVE_RELEASE",reason:"Retry"});
 expect(database.user.updateMany).toHaveBeenCalledTimes(1);
});
it("rejects wrong reseller, late proof and CS mixed-role actions",async()=>{
 const database=db({paymentDueAt:new Date(0)});
 await expect(actOnPayout(database,"p",{id:"other"},{action:"SUBMIT_PROOF"})).rejects.toMatchObject({code:"NOT_FOUND"});
 await expect(uploadPayoutProof(database,"p",{id:"r"},Buffer.from("x"),"image/jpeg")).rejects.toMatchObject({code:"INVALID_STATE"});
 database.user.findUnique.mockResolvedValue({status:"ACTIVE",appRoles:["CS","RESELLER"]});
 await expect(actOnPayout(database,"p",{id:"r"},{action:"SET_DEADLINE",days:5})).rejects.toMatchObject({code:"FORBIDDEN"});
 expect(database.user.updateMany).not.toHaveBeenCalled();
});
it("suspended reseller keeps unpaid escrow held",async()=>{
 const database=db({paymentDueAt:new Date(0)});
 database.user.findUnique.mockResolvedValue({status:"SUSPENDED",appRoles:["RESELLER"]});
 await actOnPayout(database,"p",{system:true},{action:"EXPIRE"});
 expect(database.row().status).toBe("PENDING");expect(database.user.updateMany).not.toHaveBeenCalled();
});
it("list DTO uses private proof endpoints and decimal-string Diamonds",()=>{
 expect(payoutDto({id:"p",senderId:"s",resellerId:"r",diamonds:100n,createdAt:new Date(),proofUploadedAt:new Date()})).toMatchObject({diamonds:"100",proofUrl:"/api/v1/wallet/reseller-payouts/p/proof"});
});
function creationDb(){
 const user={id:"s",publicId:"TLN-S",name:"Sender",status:"ACTIVE",country:"PK",agencyId:"a",appRoles:["HOST"],hostSalaryCoinBalance:9000000n};
 const reseller={id:"r",publicId:"USR-R",status:"ACTIVE",country:"PK",appRoles:["RESELLER"]};
 const rules={hostTransferEnabled:true,transferMinDiamonds:"1",transferMaxDiamonds:"90000000",transferMultiple:"1",transferDailyLimit:"90000000",transferMonthlyLimit:"900000000",usdtEnabled:true,withdrawalDiamondsPerUsd:"90000",usdtMicrosPerUsd:"1000000",withdrawalMinDiamonds:"1800000",withdrawalMaxDiamonds:"90000000",feeBearer:"COMPANY",commissionChart:[{minUsdMicros:"0",bps:"350",fixedUsdtMicros:"10000000",networkUsdtMicros:"0"}]};
 let record=null;
 const tx={user:{findUniqueOrThrow:async()=>user,findFirst:vi.fn(async()=>reseller),updateMany:vi.fn(async()=>({count:1}))},currencyPolicy:{findUnique:async()=>({version:9,rules})},walletTransaction:{aggregate:async()=>({_sum:{diamonds:0n}}),create:vi.fn()},resellerPayout:{findUnique:async()=>record,create:vi.fn(async({data})=>record={id:"p",...data})},auditLog:{create:vi.fn()},notification:{upsert:vi.fn()}};
 return {...tx,$transaction:fn=>fn(tx),record:()=>record};
}
it("creates escrow with one debit and replays without a second charge",async()=>{
 vi.stubEnv("PAYOUT_BANK_ENCRYPTION_KEY","a".repeat(64));vi.stubEnv("AUTH_SECRET","test-quote-secret");
 const database=creationDb(),input={diamonds:"1800000",resellerPublicId:"USR-R",bank};
 const quote=await escrowQuote(database,"s",input);
 expect(quote.netUsdtMicros).toBe("20000000");
 expect(quote.commissionMicros).toBe("0");
 expect(quote.networkFeeMicros).toBe("0");
 const request={...input,quoteToken:quote.quoteToken};
 expect(await createEscrow(database,"s",request,"payout-key-1")).toBe("p");
 expect(await createEscrow(database,"s",request,"payout-key-1")).toBe("p");
 expect(database.user.updateMany).toHaveBeenCalledTimes(1);
 expect(database.walletTransaction.create).toHaveBeenCalledTimes(1);
 expect(database.record().bankCipher).not.toContain(bank.accountNumber);
 await expect(createEscrow(database,"s",{...request,diamonds:"1900000"},"payout-key-1")).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
});
it("rejects altered quote input and insufficient balance without creating escrow",async()=>{
 vi.stubEnv("PAYOUT_BANK_ENCRYPTION_KEY","a".repeat(64));vi.stubEnv("AUTH_SECRET","test-quote-secret");
 const database=creationDb(),input={diamonds:"1800000",resellerPublicId:"USR-R",bank};
 const quote=await escrowQuote(database,"s",input);
 await expect(createEscrow(database,"s",{...input,bank:{...bank,accountNumber:"other"},quoteToken:quote.quoteToken},"payout-key-1")).rejects.toMatchObject({code:"CURRENCY_QUOTE_EXPIRED"});
 expect(database.user.updateMany).not.toHaveBeenCalled();
 database.user.updateMany.mockResolvedValue({count:0});
 await expect(createEscrow(database,"s",{...input,quoteToken:quote.quoteToken},"payout-key-1")).rejects.toMatchObject({code:"INSUFFICIENT_DIAMONDS"});
 expect(database.resellerPayout.create).not.toHaveBeenCalled();
});
it("redacts secrets and keeps full bank data off sender/list responses",async()=>{
 const row={id:"p",senderId:"s",resellerId:"r",diamonds:1n,bankCipher:"secret",proofData:Buffer.from("private"),requestKey:"secret-key",fingerprint:"private",createdAt:new Date()};
 const dto=payoutDto(row);for(const key of ["bankCipher","proofData","requestKey","fingerprint"])expect(dto).not.toHaveProperty(key);
 const database={resellerPayout:{findFirst:vi.fn(async()=>row),findUnique:vi.fn()}};
 expect(await payoutAccess(database,"p",{id:"s"},true)).not.toHaveProperty("bank");
 expect(database.resellerPayout.findUnique).not.toHaveBeenCalled();
 database.resellerPayout.findFirst.mockResolvedValue(null);
 await expect(payoutAccess(database,"p",{id:"other"},true)).rejects.toMatchObject({code:"NOT_FOUND"});
});
