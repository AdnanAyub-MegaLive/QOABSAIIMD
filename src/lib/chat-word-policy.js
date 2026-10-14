export const inappropriateMessage = "Your message contains an inappropriate word. Please edit it before sending.";
export function normalizeChatText(value) {
  return value.normalize("NFKC").toLowerCase().replace(/\p{Cf}/gu, "").replace(/\s+/gu, " ").trim();
}
export function validateProhibitedWords(words) {
  if (!Array.isArray(words) || words.length > 500 || words.some(w => typeof w !== "string" || !normalizeChatText(w) || [...w].length > 100)) {
    throw Object.assign(new Error("Enter up to 500 words or phrases, each between 1 and 100 characters."), { status: 422, code: "VALIDATION_ERROR" });
  }
  return [...new Set(words.map(normalizeChatText))];
}
export function containsProhibitedWord(text, words) {
  const normalized = normalizeChatText(text);
  return words.some(word => {
    const escaped = normalizeChatText(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])${escaped}(?![\\p{L}\\p{N}\\p{M}_])`, "u").test(normalized);
  });
}
export async function assertChatWordsAllowed(db, text) {
  const policy = await db.chatWordPolicy.findUnique({ where: { id: "GLOBAL" } });
  if (containsProhibitedWord(text, policy?.words ?? [])) {
    throw Object.assign(new Error(inappropriateMessage), { code: "INAPPROPRIATE_WORD", status: 422, validationMessage: inappropriateMessage });
  }
}
