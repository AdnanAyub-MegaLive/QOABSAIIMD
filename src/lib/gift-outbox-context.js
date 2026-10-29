import { AsyncLocalStorage } from "node:async_hooks";
// Share across the custom server and bundled route modules in this process.
const key = Symbol.for("portal.giftOutboxContext");
export const giftOutboxContext = globalThis[key] ??= new AsyncLocalStorage();
export const isGiftEvent = event => event === "gift:received" || event === "gift:received-multi";
export function rememberGiftRecovery(tx, gift, settlement, pk) {
  const context = giftOutboxContext.getStore();
  if (!context) return;
  context.recoveryInputs ??= new Map();
  context.recoveryInputs.set(gift.id, { tx, gift, settlement, pk });
}
export function giftEventTiming(channel, event, data) {
  const timing = giftOutboxContext.getStore()?.comboTiming;
  return timing && isGiftEvent(event) && channel.startsWith("audio-room:")
    ? { ...data, comboTiming: timing } : data;
}
export function captureGiftEvent(row) {
  if (isGiftEvent(row.event)) giftOutboxContext.getStore()?.push(row);
}
