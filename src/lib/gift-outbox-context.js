import { AsyncLocalStorage } from "node:async_hooks";
// Share across the custom server and bundled route modules in this process.
const key = Symbol.for("portal.giftOutboxContext");
export const giftOutboxContext = globalThis[key] ??= new AsyncLocalStorage();
export const isGiftEvent = event => event === "gift:received" || event === "gift:received-multi";
export function captureGiftEvent(row) {
  if (isGiftEvent(row.event)) giftOutboxContext.getStore()?.push(row);
}
