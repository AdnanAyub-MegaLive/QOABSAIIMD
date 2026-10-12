export const GIFT_CATEGORIES = [["NORMAL","Normal"],["LUCKY","Lucky"],["VIP","VIP"],["CP_GIFT","CP Gift"],["COUNTRY","Country"],["CUSTOMIZED","Customized"]];
export function giftCategory(value, tier) {
  if (value == null || value === "") return ["LUCKY","VIP"].includes(tier) ? tier : tier === "BLIND_BOX" ? "CUSTOMIZED" : "NORMAL";
  if (!GIFT_CATEGORIES.some(([id])=>id===value)) throw Object.assign(new Error("Select a valid gift category."),{code:"VALIDATION_ERROR"});
  return value;
}
