import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({user:vi.fn(),policy:vi.fn(),auth:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:{user:{findUniqueOrThrow:mocks.user},currencyPolicy:{findUnique:mocks.policy}}}));
vi.mock("@/lib/diamond-exchange",()=>({exchangeSettings:async()=>({enabled:true,diamondsPerCoin:2n,minDiamonds:10000n})}));
vi.mock("@/lib/currency-policy",async()=>await import("./currency-policy.js"));
vi.mock("@/lib/withdrawal-contract",async()=>await import("./withdrawal-contract.js"));
vi.mock("@/lib/wallet",()=>({WALLET_CURRENCY:"USD"}));
vi.mock("@/lib/mobile-api",()=>({requireMobileUser:mocks.auth,mobileOptions:()=>{},mobileJson:(body)=>Response.json(body),mobileApiError:()=>Response.json({success:false},{status:500})}));
import { GET } from "../app/api/wallet/route.js";
import { currencyDefaults } from "./currency-policy.js";
beforeEach(()=>{
  mocks.auth.mockResolvedValue({id:"user"});
  mocks.user.mockResolvedValue({status:"ACTIVE",agencyId:"agency",role:"HOST",appRoles:["HOST"],coinBalance:1n,hostSalaryCoinBalance:90000n,couponBalance:0,totalTopUp:0n,diamondExchangeEnabled:true,updatedAt:new Date()});
});
it("returns currency policy and reason even without a policy record",async()=>{
  mocks.policy.mockResolvedValue(null);
  const response=await GET(new Request("https://portal.test/api/wallet"));
  expect(response.status).toBe(200);
  const {data}=await response.json();
  expect(data.currencyPolicy.configured).toBe(false);
  expect(data.canWithdraw).toBe(false);
  expect(data.withdrawal.reason.code).toBe("PAYOUT_CONFIGURATION_INCOMPLETE");
  expect(data.diamonds).toBe("90000");
});
it("keeps the actual policy visible when payouts are disabled",async()=>{
  mocks.policy.mockResolvedValue({version:7,rules:{...currencyDefaults,usdtEnabled:false,usdtMicrosPerUsd:"1000000",withdrawalMinDiamonds:"1",withdrawalMaxDiamonds:"1000000",commissionChart:[{minUsdMicros:"0",bps:"0",fixedUsdtMicros:"0",networkUsdtMicros:"0"}]}});
  const {data}=await (await GET(new Request("https://portal.test/api/wallet"))).json();
  expect(data.currencyPolicy.version).toBe(7);
  expect(data.withdrawal.reason.code).toBe("WITHDRAWAL_DISABLED");
  expect(data.withdrawal.configured).toBe(true);
});
