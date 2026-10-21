import { assertChatWordsAllowed } from "./chat-word-policy.js";
import { assertNoCountryLinks } from "./country-chat.js";
const fail = (code, message) => { throw Object.assign(new Error(message), { code, status: 422 }); };
function clean(value, field) {
  if (typeof value !== "string") fail("BANNER_TEXT_INVALID", `${field} must be text.`);
  return value.normalize("NFKC").replace(/\r\n?|\u2028|\u2029/g, "\n")
    .replace(/\t/g, " ").replace(/[\p{Cc}\p{Cf}]/gu, ch => ch === "\n" ? ch : "")
    .replace(/[\u034f\uFE00-\uFE0F]/gu, "").replace(/[^\S\n]+/gu, " ").trim();
}
export function normalizeBannerText(input) {
  return { name: clean(input.name ?? "", "Name"), description: clean(input.description ?? "", "Description") };
}
export async function validateBannerText(db, input, { allowBlankName = false } = {}) {
  const { name, description } = normalizeBannerText(input);
  if (!name && !allowBlankName) fail("BANNER_NAME_REQUIRED", "Banner name is required.");
  if ([...name].length > 60) fail("BANNER_NAME_TOO_LONG", "Banner name must not exceed 60 characters.");
  if (name.includes("\n")) fail("BANNER_NAME_SINGLE_LINE", "Banner name must be one line.");
  if ([...description].length > 2000) fail("BANNER_DESCRIPTION_TOO_LONG", "Description must not exceed 2,000 characters.");
  if (description && description.split(/\s+/u).length > 200) fail("BANNER_DESCRIPTION_TOO_MANY_WORDS", "Description must not exceed 200 words.");
  if ((description.match(/\n/g) || []).length > 10) fail("BANNER_DESCRIPTION_TOO_MANY_LINES", "Description must not contain more than 10 line breaks.");
  // Use the existing public Country Chat link policy for both fields.
  for (const [field, text] of [["name", name], ["description", description]]) {
    if (/[a-z][a-z0-9+.-]*:\/\//iu.test(text)) fail("BANNER_LINK_NOT_ALLOWED", `Links are not allowed in the banner ${field}.`);
    try { assertNoCountryLinks(text); } catch { fail("BANNER_LINK_NOT_ALLOWED", `Links are not allowed in the banner ${field}.`); }
    await assertChatWordsAllowed(db, text);
  }
  return { name, description };
}
