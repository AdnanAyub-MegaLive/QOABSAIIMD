// Presentation/audit correlation only: never an idempotency or settlement key.
export function parseGiftBatchId(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || [...value].length > 64 || !value.trim()) {
    throw Object.assign(new Error("giftBatchId must be a non-empty string of at most 64 characters."), { code: "VALIDATION_ERROR" });
  }
  return value;
}
