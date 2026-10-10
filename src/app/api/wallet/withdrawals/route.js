import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { isRateLimited } from "@/lib/rate-limit";
import { serializeWithdrawal } from "@/lib/wallet";

export function OPTIONS() {
  return mobileOptions();
}

export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const url = new URL(request.url);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20));
    const cursor = String(url.searchParams.get("cursor") ?? "").trim();
    if (cursor) {
      const ownedCursor = await prisma.walletWithdrawal.findFirst({
        where: { publicId: cursor, userId: user.id },
        select: { publicId: true },
      });
      if (!ownedCursor) {
        const error = new Error("Withdrawal cursor is invalid.");
        error.code = "VALIDATION_ERROR";
        throw error;
      }
    }
    const withdrawals = await prisma.walletWithdrawal.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { publicId: cursor }, skip: 1 } : {}),
    });
    const hasMore = withdrawals.length > limit;
    const page = withdrawals.slice(0, limit);
    const {currencyRequestDto}=await import("@/lib/currency-operations");
    const currencyRequests=await prisma.currencyRequest.findMany({where:{userId:user.id,kind:"USDT"},orderBy:[{createdAt:"desc"},{id:"desc"}],take:50});
    return mobileJson({
      success: true,
      data: {
        withdrawals: page.map(serializeWithdrawal),
        currencyRequests: currencyRequests.map(currencyRequestDto),
        nextCursor: hasMore ? page.at(-1)?.publicId ?? null : null,
      },
    });
  } catch (error) {
    console.error("Wallet withdrawal history failed", error);
    return mobileApiError(error, "WITHDRAWAL_HISTORY_FAILED");
  }
}

export async function POST(request) {
  try {
    const user=await requireMobileUser(request);
    if(isRateLimited(`currency-request:${user.id}`,{limit:10,windowMs:60000}))return mobileJson({success:false,error:{code:"RATE_LIMITED",message:"Try again in a minute."}},429);
    const body=await request.json();
    if(String(body.method??"").toLowerCase()!=="usdt_trc20")throw Object.assign(new Error("Official withdrawals support USDT TRC20 only."),{code:"VALIDATION_ERROR"});
    const {createCurrencyRequest}=await import("@/lib/currency-operations");
    const result=await createCurrencyRequest(prisma,user.id,{kind:"USDT",diamonds:body.diamonds,policyVersion:body.policyVersion,quoteToken:body.quoteToken,destination:body.destination??body.accountNumber},request.headers.get("Idempotency-Key"));
    return mobileJson({success:true,data:{withdrawalId:result.id,status:result.status,diamonds:result.diamonds,netUsdtMicros:result.netUsdtMicros,currency:"USDT",network:"TRC20"}},201);
  }catch(error){return mobileApiError(error,"WITHDRAWAL_FAILED");}
}
