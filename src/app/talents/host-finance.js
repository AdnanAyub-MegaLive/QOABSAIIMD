import Link from "next/link";
import { prisma } from "@/lib/prisma";
const tabs = { ledger: "Coin & Diamond ledger", exchange: "Exchanges", transfer: "Transfers", withdrawal: "Diamond withdrawals / requests", legacy: "Legacy withdrawals" };
export default async function HostFinance({ user, searchParams = {} }) {
  const tab = Object.hasOwn(tabs, searchParams.financeTab) ? searchParams.financeTab : "ledger";
  const requested = Number(searchParams.financePage ?? 1);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested,100000) : 1;
  const query = { where: { userId: user.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page-1)*25, take: 26 };
  let rows;
  if (tab === "withdrawal") rows = await prisma.currencyRequest.findMany(query);
  else if (tab === "legacy") rows = await prisma.walletWithdrawal.findMany(query);
  else {
    if (tab === "exchange") query.where.type = { in: ["DIAMOND_EXCHANGE_DEBIT","DIAMOND_EXCHANGE_CREDIT"] };
    if (tab === "transfer") query.where.type = { in: ["TRANSFER_SENT","TRANSFER_RECEIVED"] };
    rows = await prisma.walletTransaction.findMany(query);
  }
  const link = (key, number=1) => `/talents/${encodeURIComponent(user.publicId)}?financeTab=${key}&financePage=${number}#finance`;
  return <section id="finance" className="mt-7 rounded-2xl border border-[#dfe9e7] bg-white p-5"><h2 className="text-lg font-bold">Account financial history</h2><div className="my-4 grid gap-3 sm:grid-cols-2">{[["Coins",user.coinBalance],["Diamonds",user.hostSalaryCoinBalance]].map(([name,value])=><div key={name} className="rounded-xl bg-[#f4f8f7] p-4"><p className="text-xs">Current {name}</p><b className="text-xl">{value.toLocaleString()}</b></div>)}</div><nav className="flex flex-wrap gap-2 border-b pb-4">{Object.entries(tabs).map(([key,label])=><Link key={key} href={link(key)} className={`rounded-lg px-3 py-2 text-xs ${tab===key?"bg-[#087f74] text-white":"bg-[#f4f8f7]"}`}>{label}</Link>)}</nav><p className="my-3 text-xs text-[#71847f]">Read-only records, newest first. Exchange debit and credit are separate ledger entries sharing a reference. Requests are not proof of completed payment.</p><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{["Date / ID","Operation","Coins","Diamonds","Status","Reference / details"].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{rows.slice(0,25).map(r=><tr key={r.id} className="border-t"><td className="p-3">{r.createdAt.toLocaleString()}<br/>{r.publicId??r.id}</td><td className="p-3">{r.title??r.kind??r.method}<br/>{r.direction??"Request"}</td><td className="p-3">{r.coins?.toLocaleString()??(r.quotedCoins!=null?r.quotedCoins.toLocaleString():"—")}</td><td className="p-3">{r.diamonds?.toLocaleString()??"—"}</td><td className="p-3">{r.status}</td><td className="max-w-xs break-words p-3">{r.referenceId??r.recipientPublicId??r.providerPayoutReference??r.payoutHash??"—"}<br/>{r.description??r.reviewNote??r.rejectionReason??""}{r.netUsdtMicros!=null&&<p>Quoted USDT: {(r.netUsdtMicros/1000000n).toString()}.{(r.netUsdtMicros%1000000n).toString().padStart(6,"0")}</p>}{r.cashAmount!=null&&<p>{r.cashAmount.toString()} {r.currency}</p>}</td></tr>)}</tbody></table>{!rows.length&&<p className="py-6 text-sm">No records in this category.</p>}</div><div className="mt-4 flex justify-between text-sm">{page>1?<Link href={link(tab,page-1)}>← Previous</Link>:<span/>}<span>Page {page}</span>{rows.length>25?<Link href={link(tab,page+1)}>Next →</Link>:<span/>}</div></section>;
}
