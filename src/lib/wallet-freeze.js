import { prisma } from "./prisma.js";

export const WALLET_FROZEN_MESSAGE = "Your wallet is frozen. You can keep using the app, but buying, gifting and other wallet actions are blocked. Contact support for help.";

/** True when an error came from the database wallet-freeze guard. */
export function isWalletFrozenError(error) {
  if (!error) return false;
  if (error.code === "WALLET_FROZEN") return true;
  const text = `${error.message ?? ""} ${error.meta?.message ?? ""} ${error.cause?.message ?? ""}`;
  return text.includes("WALLET_FROZEN");
}
export function walletFrozenError() {
  return Object.assign(new Error(WALLET_FROZEN_MESSAGE), { status: 403, code: "WALLET_FROZEN" });
}
/** Early, friendly check before a wallet action; the database enforces it regardless. */
export async function assertWalletActive(userId, db = prisma) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { walletFrozen: true } });
  if (user?.walletFrozen) throw walletFrozenError();
}

export async function setWalletFreeze(db, { admin, userId, frozen, reason }) {
  const text = String(reason ?? "").trim();
  if (text.length < 10 || text.length > 500) throw Object.assign(new Error("Explain the reason in 10 to 500 characters."), { status: 422 });
  return db.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, publicId: true, walletFrozen: true } });
    if (!user) throw Object.assign(new Error("User not found."), { status: 404 });
    if (user.walletFrozen === frozen) throw Object.assign(new Error(frozen ? "This wallet is already frozen." : "This wallet is not frozen."), { status: 409 });
    await tx.user.update({ where: { id: user.id }, data: frozen
      ? { walletFrozen: true, walletFrozenReason: text, walletFrozenAt: new Date(), walletFrozenByAdminId: admin.id }
      : { walletFrozen: false, walletFrozenReason: null, walletFrozenAt: null, walletFrozenByAdminId: null } });
    await tx.walletFreezeEvent.create({ data: { userId: user.id, frozen, reason: text, adminId: admin.id } });
    await tx.auditLog.create({ data: { adminId: admin.id, action: frozen ? "WALLET_FREEZE" : "WALLET_UNFREEZE", category: "USER_MANAGEMENT", entityType: "User", entityId: user.id,
      description: `${admin.name} ${frozen ? "froze" : "unfroze"} the wallet of ${user.publicId}.`, metadata: { reason: text } } });
    return { publicId: user.publicId, walletFrozen: frozen };
  });
}

/** Ready-made 403 for mobile routes, or null when the wallet is active. */
export async function walletFrozenResponse(userId, db = prisma) {
  // The database trigger is the real guard; this only gives a friendly early reply.
  const user = userId && typeof db.user?.findUnique === "function" ? await db.user.findUnique({ where: { id: userId }, select: { walletFrozen: true } }).catch(() => null) : null;
  if (!user?.walletFrozen) return null;
  return Response.json({ success: false, error: { code: "WALLET_FROZEN", message: WALLET_FROZEN_MESSAGE } }, { status: 403, headers: { "Cache-Control": "no-store" } });
}
