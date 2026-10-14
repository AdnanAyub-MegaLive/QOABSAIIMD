import HostFinance from "./host-finance";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import PortalSidebar from "../components/portal-sidebar";
export default async function LinkedHostProfile({ user, canViewFinance, searchParams }) {
  const [gifts, devices, payouts, rooms] = await Promise.all([
    prisma.giftTransaction.findMany({where:{recipientUserId:user.id},include:{sender:{select:{publicId:true,name:true}}},orderBy:{createdAt:"desc"},take:100}),
    prisma.device.findMany({where:{userId:user.id},orderBy:{lastLoginAt:"desc"}}),
    prisma.currencyRequest.findMany({where:{userId:user.id},orderBy:{createdAt:"desc"},take:100}),
    prisma.audioRoom.findMany({where:{ownerId:user.id},select:{roomId:true,title:true,status:true,participantCount:true}}),
  ]);
  const groups = [
    ["Gifts received",gifts.map(g=>[g.id,`${g.giftName} × ${g.quantity}`,`${g.sender.name} · ${g.sender.publicId}`,`${g.coinValue.toLocaleString()} Coins · ${g.createdAt.toLocaleString()}`])],
    ["Diamond requests / payouts",payouts.map(p=>[p.id,p.kind,`${p.diamonds.toLocaleString()} Diamonds`,`${p.status} · ${p.createdAt.toLocaleString()}`])],
    ["Devices",devices.map(d=>[d.id,d.deviceName??d.platform??"Device",d.lastLoginIp??"—",`${d.lastLoginAt?.toLocaleString()??"Never"} · ${d.isBanned?"Banned":"Allowed"}`])],
    ["Audio rooms",rooms.map(r=>[r.roomId,r.title,r.roomId,`${r.status} · ${r.participantCount} online`])],
  ];
  return <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]"><PortalSidebar/><section className="p-6 lg:ml-64 md:p-10"><Link href="/talents" className="text-sm text-[#087f74]">← Host Management</Link><h1 className="mt-5 text-2xl font-bold">{user.name}</h1><p className="mt-2 text-sm">{user.publicId} · {user.agency?.name??"No agency — review required"} · {user.status}</p><p className="mt-2 text-sm">Diamond balance: {user.hostSalaryCoinBalance.toLocaleString()}</p><p className="mt-2 text-xs text-[#71847f]">Records belong to the original account. Promotion changes the public ID prefix, not account ownership. Use Manage in the host directory for host changes.</p>{canViewFinance ? <HostFinance user={user} searchParams={searchParams}/> : <p className="mt-5 text-sm">Financial history requires Finance view permission.</p>}<div className="mt-7 grid gap-5 xl:grid-cols-2">{groups.map(([title,rows])=><section key={title} className="rounded-2xl border border-[#dfe9e7] bg-white p-5"><h2 className="font-bold">{title}</h2><div className="mt-3 max-h-96 divide-y overflow-auto">{rows.map(([id,name,detail,status])=><div key={id} className="py-3 text-sm"><b>{name}</b><p>{detail}</p><p className="text-xs text-[#71847f]">{status}</p></div>)}{!rows.length&&<p className="py-4 text-sm">No records.</p>}</div></section>)}</div></section></main>;
}
