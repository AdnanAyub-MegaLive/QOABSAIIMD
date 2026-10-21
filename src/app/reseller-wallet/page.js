import { requirePagePermission } from "@/lib/portal-admin";
import { prisma } from "@/lib/prisma";
import Form from "./wallet-form";
import Link from "next/link";
export default async function Page({searchParams}) {
  await requirePagePermission("finance.adjust");
  const {userId=""}=await searchParams;
  const user=userId?await prisma.user.findFirst({where:{publicId:userId,appRoles:{has:"RESELLER"}},select:{publicId:true,name:true,coinBalance:true,resellerCoinBalance:true}}):null;
  return <main className="mx-auto max-w-xl space-y-5 p-8"><Link href="/users">Back to Users</Link><h1 className="text-2xl font-bold">Reseller Business Wallet</h1><p>New business funding only. Existing personal Coins stay unchanged. Business Coins can recharge customers or the reseller’s own personal account, never the reverse.</p><form><label>Reseller public ID<input className="block border p-2" name="userId" defaultValue={userId} required /></label><button className="mt-2 rounded border p-2">Look up reseller</button></form>{user?<><h2>{user.name} ({user.publicId})</h2><Form key={user.publicId} userId={user.publicId} business={String(user.resellerCoinBalance)} personal={String(user.coinBalance)}/></>:userId?<p>Reseller not found.</p>:null}</main>;
}
