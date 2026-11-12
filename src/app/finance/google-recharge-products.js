import { parseGooglePriceUsd } from "@/lib/google-recharge-price";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";

async function saveProduct(form) {
  "use server";
  const admin = await requirePermission("rules.currency");
  const productId = String(form.get("productId") ?? "").trim();
  if (!/^[a-z0-9][a-z0-9._]{0,127}$/.test(productId)) throw new Error("Invalid Google Play product ID.");
  const action = form.get("action");
  if (!["add", "price", "enable", "disable"].includes(action)) throw new Error("Invalid product action.");
  const add = action === "add";
  const priceUsd = add || action === "price" ? parseGooglePriceUsd(form.get("priceUsd")) : undefined;
  const amount = String(form.get("coins") ?? "");
  if (add && (!/^[1-9]\d{0,18}$/.test(amount) || BigInt(amount)>9223372036854775807n)) throw new Error("Invalid coin amount.");
  const active = add || form.get("action") === "enable";
  await prisma.$transaction(async tx=>{
    const before = await tx.googleRechargeProduct.findUnique({where:{productId}});
    if (add) await tx.googleRechargeProduct.create({data:{productId,coins:BigInt(amount),active,priceUsd}});
    else await tx.googleRechargeProduct.update({where:{productId},data:action === "price" ? {priceUsd} : {active}});
    await tx.auditLog.create({data:{adminId:admin.id,action:"GOOGLE_RECHARGE_PRODUCT_UPDATED",category:"FINANCE",entityType:"GoogleRechargeProduct",entityId:productId,description:add?"Added Google recharge product.":action === "price"?"Changed Google recharge USD price.":"Changed Google recharge availability.",metadata:{...(action !== "price"?{active}:{}),...(add?{coins:amount}:{}),...(priceUsd !== undefined?{priceUsd,previousPriceUsd:before?.priceUsd?.toFixed(2) ?? null}:{})}}});
  });
  revalidatePath("/finance");
}
export default async function GoogleRechargeProducts({canEdit}) {
  const rows=await prisma.googleRechargeProduct.findMany({orderBy:{coins:"asc"}});
  return <section className="mb-6 rounded-xl border border-[#dfe9e7] bg-white p-5">
    <h3 className="font-bold">Google Recharge · One-time products</h3>
    <p className="mt-2 text-sm text-gray-600">Set this display price to match the same product’s US price in Play Console, and update both when it changes. Google checkout uses the buyer’s local currency. Leave blank to mark the USD price as not set.</p>
    <table className="my-4 w-full text-left text-sm"><thead><tr><th>Google Play product ID</th><th>Coins</th><th>Price (USD)</th><th>Status</th>{canEdit&&<th>Availability</th>}</tr></thead>
    <tbody>{rows.map(row=><tr key={row.productId} className="border-t border-[#dfe9e7]"><td className="py-2 font-mono">{row.productId}</td><td>{row.coins.toLocaleString("en-US")}</td><td>{canEdit?<form action={saveProduct} className="flex items-center gap-2"><input type="hidden" name="productId" value={row.productId}/><span>$</span><input aria-label={`Price (USD) for ${row.productId}`} name="priceUsd" type="number" min="0" max="99999999.99" step="0.01" defaultValue={row.priceUsd?.toFixed(2) ?? ""} placeholder="Not set" className="w-32 rounded border p-2"/><button className="text-[#16877d]" name="action" value="price">Save</button></form>:row.priceUsd == null?"Not set":`$${row.priceUsd.toFixed(2)}`}</td><td>{row.active?"Enabled":"Disabled"}</td>{canEdit&&<td><form action={saveProduct}><input type="hidden" name="productId" value={row.productId}/><button className="text-[#16877d]" name="action" value={row.active?"disable":"enable"}>{row.active?"Disable":"Enable"}</button></form></td>}</tr>)}</tbody></table>
    {canEdit&&<form action={saveProduct} className="flex flex-wrap items-end gap-3"><label>Product ID<input name="productId" required pattern="[a-z0-9][a-z0-9._]{0,127}" className="block rounded border p-2"/></label><label>Coins<input name="coins" required inputMode="numeric" pattern="[1-9][0-9]{0,18}" className="block rounded border p-2"/></label><label>Price (USD)<span className="flex items-center gap-1">$<input name="priceUsd" type="number" min="0" max="99999999.99" step="0.01" placeholder="Not set" className="block rounded border p-2"/></span></label><button className="rounded bg-[#16877d] px-4 py-2 text-white" name="action" value="add">Add product</button></form>}
  </section>;
}
