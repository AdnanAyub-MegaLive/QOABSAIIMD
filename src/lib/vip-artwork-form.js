// The tier editor is the single VIP upload entry point.
export function vipArtworkForm({ privilege, file, poster, price, senderXp, receiverXp }) {
  const form = new FormData();
  form.set("name", `${/^vip\b/i.test(privilege.label) ? privilege.label : `VIP ${privilege.label}`} — ${file.name}`.slice(0, 80));
  form.set("category", privilege.category);
  form.set("distribution", "MANUAL");
  form.set("storeVisible", "false");
  form.set("file", file);
  if (poster) form.set("posterFile", poster);
  if (privilege.category === "GIFTS") {
    form.set("giftTier", "VIP");
    form.set("giftCategory", "VIP");
    form.set("coinPrice", price);
    form.set("senderXp", senderXp);
    form.set("receiverXp", receiverXp);
  }
  return form;
}
