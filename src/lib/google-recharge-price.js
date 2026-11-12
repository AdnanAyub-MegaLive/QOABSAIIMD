// Display-only USD price; Google remains authoritative for checkout charges.
export function parseGooglePriceUsd(value) {
  const price = String(value ?? "").trim();
  if (!price) return null;
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(price)) throw new Error("Enter a USD price from 0 to 99999999.99 with at most two decimal places.");
  const [whole, fraction = ""] = price.split(".");
  return `${Number(whole)}.${fraction.padEnd(2, "0")}`;
}
export function googleRechargeProductDto(product) {
  return { productId: product.productId, coins: product.coins.toString(), priceUsd: product.priceUsd == null ? null : product.priceUsd.toFixed(2) };
}
