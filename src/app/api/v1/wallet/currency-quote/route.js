import { prisma } from "@/lib/prisma";
import { currencyPolicy, payoutQuote, amount } from "@/lib/currency-policy";
import { withdrawalAvailability, issueWithdrawalQuote } from "@/lib/withdrawal-contract";
import { validTronAddress } from "@/lib/currency-operations";
import { requireMobileUser, mobileJson, mobileApiError } from "@/lib/mobile-api";
import { withV1Request, v1Options } from "@/lib/mobile-v1";
const path="/api/v1/wallet/currency-quote",methods="POST, OPTIONS";
export function OPTIONS(request){return v1Options(request,methods);}
export function POST(request){return withV1Request(request,{path,methods},async()=>{try{
  const session=await requireMobileUser(request),user=await prisma.user.findUniqueOrThrow({where:{id:session.id}}),body=await request.json();
  const policy=await currencyPolicy(prisma);
  const availability = withdrawalAvailability(user,policy);
  if (!availability.canWithdraw) throw Object.assign(new Error(availability.reason.message), {code:availability.reason.code});
  const diamonds=amount(body.diamonds),destination=String(body.destination??"").trim();
  if (!validTronAddress(destination)) throw Object.assign(new Error("Enter a valid TRON destination."),{code:"VALIDATION_ERROR"});
  if (diamonds>user.hostSalaryCoinBalance) throw new Error("INSUFFICIENT_DIAMONDS");
  return mobileJson({success:true,data:{diamonds:String(diamonds),destination,method:"USDT_TRC20",currency:"USDT",network:"TRC20",policyVersion:policy.version,...payoutQuote(diamonds,policy),...issueWithdrawalQuote({userId:user.id,diamonds,destination,policyVersion:policy.version})}});
}catch(e){return mobileApiError(e,"QUOTE_FAILED");}});}
