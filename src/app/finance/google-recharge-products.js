import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";

async function saveProduct(form) {
  "use server";
  const admin = await requirePermission("rules.currency");
  const productId = String(form.get("productId") ?? "").trim();
  if (!/^[a-z0-9][a-z0-9._]{0,127}$/.test(productId)) throw new Error("Invalid Google Play product ID.");
  const add = form.get("action") === "add";
  const amount = String(form.get("coins") ?? "");
  if (add && (!/^[1-9]\d{0,18}$/.test(amount) || BigInt(amount)>9223372036854775807n)) throw new Error("Invalid coin amount.");
  const active = add || form.get("action") === "enable";
  await prisma.$transaction(async tx=>{
    if (add) await tx.googleRechargeProduct.create({data:{productId,coins:BigInt(amount),active}});
    else await tx.googleRechargeProduct.update({where:{productId},data:{active}});
    await tx.auditLog.create({data:{adminId:admin.id,action:"GOOGLE_RECHARGE_PRODUCT_UPDATED",category:"FINANCE",entityType:"GoogleRechargeProduct",entityId:productId,description:add?"Added Google recharge product.":"Changed Google recharge availability.",metadata:{active,...(add?{coins:amount}:{})}}});
  });
  revalidatePath("/finance");
}
export default async function GoogleRechargeProducts({canEdit}) {
  const rows=await prisma.googleRechargeProduct.findMany({orderBy:{coins:"asc"}});
  return <section className="mb-6 rounded-xl border border-[#dfe9e7] bg-white p-5">
    <h3 className="font-bold">Google Recharge · One-time products</h3>
    <table className="my-4 w-full text-left text-sm"><thead><tr><th>Google Play product ID</th><th>Coins</th><th>Status</th>{canEdit&&<th>Availability</th>}</tr></thead>
    <tbody>{rows.map(row=><tr key={row.productId} className="border-t border-[#dfe9e7]"><td className="py-2 font-mono">{row.productId}</td><td>{row.coins.toLocaleString("en-US")}</td><td>{row.active?"Enabled":"Disabled"}</td>{canEdit&&<td><form action={saveProduct}><input type="hidden" name="productId" value={row.productId}/><button className="text-[#16877d]" name="action" value={row.active?"disable":"enable"}>{row.active?"Disable":"Enable"}</button></form></td>}</tr>)}</tbody></table>
    {canEdit&&<form action={saveProduct} className="flex flex-wrap items-end gap-3"><label>Product ID<input name="productId" required pattern="[a-z0-9][a-z0-9._]{0,127}" className="block rounded border p-2"/></label><label>Coins<input name="coins" required inputMode="numeric" pattern="[1-9][0-9]{0,18}" className="block rounded border p-2"/></label><button className="rounded bg-[#16877d] px-4 py-2 text-white" name="action" value="add">Add product</button></form>}
  </section>;
}
