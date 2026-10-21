export function giftXpInput(input) {
  const result = {};
  for (const key of ["senderXp", "receiverXp"]) {
    const value = input[key];
    if ((typeof value !== "string" && typeof value !== "number") || !/^\d+$/.test(String(value)) || BigInt(value) > 1000000000000n)
      throw Object.assign(new Error(`${key === "senderXp" ? "Sender" : "Receiver"} XP is required and must be a whole number from 0 to 1000000000000.`), { code: "VALIDATION_ERROR", status: 422 });
    result[key] = BigInt(value);
  }
  return result;
}

export function hostDiamondsInput(value) {
  if (value == null || String(value).trim() === "") return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text) || BigInt(text) > 1000000000000n)
    throw Object.assign(new Error("Host Diamonds must be blank or a whole number from 0 to 1000000000000."), { code: "VALIDATION_ERROR", status: 422 });
  return BigInt(text);
}
