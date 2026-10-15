import { expect, it, vi } from "vitest";
import { createCurrencyRequest } from "./currency-operations.js";
import { issueWithdrawalQuote } from "./withdrawal-contract.js";

function database() {
  const sender = { id: "u", publicId: "TLN-1", status: "ACTIVE", country: "PK", agencyId: "a", appRoles: ["HOST"] };
  const recipient = { id: "r", publicId: "USR-2", country: "PK" };
  const tx = {
    notification: { upsert: vi.fn(async () => ({})) },
    currencyRequest: { findUnique: vi.fn(async () => null), create: vi.fn(async ({ data }) => ({ id: "request", ...data })) },
    currencyPolicy: { findUnique: vi.fn(async () => ({ version: 1, rules: { hostTransferEnabled: true, transferMinDiamonds: "10", transferMaxDiamonds: "100", transferMultiple: "5", transferDailyLimit: "200", transferMonthlyLimit: "500" } })) },
    user: { findUniqueOrThrow: vi.fn(async () => sender), findFirst: vi.fn(async () => recipient), updateMany: vi.fn(async () => ({ count: 1 })) },
    walletTransaction: { aggregate: vi.fn(async () => ({ _sum: { diamonds: 0n } })), create: vi.fn(async () => ({})) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  return { tx, $transaction: vi.fn(work => work(tx)) };
}
const input = { kind: "RESELLER_TRANSFER", diamonds: "50", recipientPublicId: "USR-2" };
it.each(["ADMIN","RESELLER","HOST"])("accepts a quoted %s withdrawal and replays without a second reservation",async role=>{
  vi.stubEnv("AUTH_SECRET","wallet-eligibility-test-secret");
  try {
    const db=database();
    db.tx.user.findUniqueOrThrow.mockResolvedValue({id:"u",publicId:"USR-1",status:"ACTIVE",appRoles:[role]});
    db.tx.currencyPolicy.findUnique.mockResolvedValue({version:1,rules:{usdtEnabled:true,withdrawalDiamondsPerUsd:"90",usdtMicrosPerUsd:"1000000",withdrawalMinDiamonds:"10",withdrawalMaxDiamonds:"100000",feeBearer:"HOST",commissionChart:[{minUsdMicros:"0",bps:"0",fixedUsdtMicros:"0",networkUsdtMicros:"0"}]}});
    const destination="T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
    const request={kind:"USDT",diamonds:"90",destination,policyVersion:1,...issueWithdrawalQuote({userId:"u",diamonds:"90",destination,policyVersion:1})};
    const first=await createCurrencyRequest(db,"u",request,"withdraw-1");
    expect(first).toMatchObject({status:"PENDING",diamonds:"90",netUsdtMicros:"1000000"});
    expect(db.tx.user.updateMany).toHaveBeenCalledWith({where:{id:"u",hostSalaryCoinBalance:{gte:90n}},data:{hostSalaryCoinBalance:{decrement:90n}}});
    db.tx.currencyRequest.findUnique.mockResolvedValue(first);
    expect(await createCurrencyRequest(db,"u",request,"withdraw-1")).toEqual(first);
    expect(db.tx.user.updateMany).toHaveBeenCalledTimes(1);
    expect(db.tx.walletTransaction.create).toHaveBeenCalledTimes(1);
  } finally { vi.unstubAllEnvs(); }
});
it.each(["HOST","BD","ADMIN","JUNIOR_ADMIN","SENIOR_ADMIN","SUPER_ADMIN","COUNTRY_HEAD","MANAGER","RESELLER"])("allows %s without agency membership to transfer",async role=>{
  const db=database();
  db.tx.user.findUniqueOrThrow.mockResolvedValue({id:"u",publicId:"USR-1",status:"ACTIVE",country:"PK",appRoles:[role]});
  await expect(createCurrencyRequest(db,"u",input,"request-1")).resolves.toMatchObject({diamonds:"50"});
  expect(db.tx.user.updateMany).toHaveBeenCalledTimes(2);
});
it.each([[],["CS"],["CS_LEADER","HOST","RESELLER","ADMIN"]])("blocks restricted roles %j before transfer or withdrawal debits",async appRoles=>{
  for(const kind of ["RESELLER_TRANSFER","USDT"]) {
    const db=database();
    db.tx.user.findUniqueOrThrow.mockResolvedValue({id:"u",status:"ACTIVE",country:"PK",appRoles,agencyId:"a"});
    await expect(createCurrencyRequest(db,"u",{...input,kind},"request-1")).rejects.toMatchObject({code:"WITHDRAWAL_NOT_ALLOWED"});
    expect(db.tx.user.updateMany).not.toHaveBeenCalled();
  }
});
it("allows an active agency owner and rechecks current roles on submission",async()=>{
  const db=database();
  db.tx.user.findUniqueOrThrow.mockResolvedValue({id:"u",publicId:"USR-1",status:"ACTIVE",country:"PK",ownedAgency:{status:"ACTIVE"}});
  await expect(createCurrencyRequest(db,"u",input,"request-1")).resolves.toMatchObject({diamonds:"50"});
  expect(db.tx.user.findUniqueOrThrow).toHaveBeenCalledWith({where:{id:"u"},include:{ownedAgency:{select:{status:true}}}});
});
it("credits the reseller the full submitted amount with no fee", async () => {
  const db = database();
  const row = await createCurrencyRequest(db, "u", input, "request-1");
  expect(row.diamonds).toBe("50");
  expect(db.tx.user.updateMany.mock.calls[0][0].data.hostSalaryCoinBalance).toEqual({ decrement: 50n });
  expect(db.tx.user.updateMany.mock.calls[1][0].data.hostSalaryCoinBalance).toEqual({ increment: 50n });
  expect(db.tx.walletTransaction.create).toHaveBeenCalledTimes(2);
  expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
});
it("rejects a different country before any debit", async () => {
  const db = database();
  db.tx.user.findFirst.mockResolvedValue({ id: "r", country: "DE" });
  await expect(createCurrencyRequest(db, "u", input, "request-1")).rejects.toMatchObject({ code: "TRANSFER_COUNTRY_MISMATCH" });
  expect(db.tx.user.updateMany).not.toHaveBeenCalled();
});
it("rechecks eligibility and rejects an ineligible reseller before debit", async () => {
  const db = database();
  db.tx.user.findFirst.mockResolvedValueOnce({ id: "r", country: "PK" }).mockResolvedValueOnce(null);
  await expect(createCurrencyRequest(db, "u", input, "request-1")).rejects.toMatchObject({ code: "RESELLER_INELIGIBLE" });
  expect(db.tx.user.findFirst.mock.calls[1][0].where.AND[0]).toMatchObject({ country: "PK", id: { not: "u" }, deletedAt: null, status: "ACTIVE" });
  expect(db.tx.user.updateMany).not.toHaveBeenCalled();
});
it("replays current status without another debit and rejects conflicting retries", async () => {
  const db = database();
  const row = await createCurrencyRequest(db, "u", input, "request-1");
  db.tx.currencyRequest.findUnique.mockResolvedValue({ ...row, status: "COMPLETED" });
  db.tx.user.updateMany.mockClear();
  expect((await createCurrencyRequest(db, "u", input, "request-1")).status).toBe("COMPLETED");
  await expect(createCurrencyRequest(db, "u", { ...input, diamonds: "55" }, "request-1")).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  expect(db.tx.user.updateMany).not.toHaveBeenCalled();
});
