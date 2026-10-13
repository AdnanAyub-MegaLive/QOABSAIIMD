import { parsePhoneNumberFromString, isSupportedCountry, getCountries, getCountryCallingCode } from "libphonenumber-js/max";

export function connectionError(code, message, status = 422) {
  return Object.assign(new Error(message), { code, status });
}
export function normalizeConnectionPhone(phone, country) {
  if (typeof country !== "string" || !isSupportedCountry(country.toUpperCase()) || typeof phone !== "string" || phone.length > 40 || !/^[+\d\s().-]+$/.test(phone))
    throw connectionError("PHONE_INVALID", "Select a country and enter a valid phone number.");
  const parsed = parsePhoneNumberFromString(phone, { defaultCountry: country.toUpperCase(), extract: false });
  if (!parsed?.isValid() || parsed.country !== country.toUpperCase() || parsed.ext)
    throw connectionError("PHONE_INVALID", "The phone number is not valid for the selected country.");
  return parsed.number;
}
export function validateConnectionPassword(password) {
  if (typeof password !== "string" || [...password].length < 8 || password.length > 128)
    throw connectionError("WEAK_PASSWORD", "Use a password of 8–128 characters.");
  return password;
}
export function connectionStatus(user) {
  const phone = user.phone;
  return { googleConnected: Boolean(user.googleSubject), phoneConnected: Boolean(phone && user.passwordHash), googleEmail: user.googleSubject ? (user.googleEmail ?? user.email) : null, maskedPhone: phone ? `${phone.slice(0, Math.min(4, phone.length - 4))}${"•".repeat(Math.max(4, phone.length - 8))}${phone.slice(-4)}` : null };
}
export function connectionCountries() {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  return getCountries().map(country => ({ country, name: names.of(country), callingCode: `+${getCountryCallingCode(country)}` })).sort((a, b) => a.name.localeCompare(b.name));
}
// Replace this provider adapter with an SMS provider; keep challenge/confirm contracts unchanged.
export function phoneVerificationProvider(env = process.env) {
  const mode = env.ACCOUNT_LINK_PHONE_VERIFICATION || (env.NODE_ENV === "production" ? "DISABLED" : "TEST");
  if (mode !== "TEST") throw connectionError("PHONE_VERIFICATION_UNAVAILABLE", "Phone connection verification is not configured.", 503);
  return { name: "TEST", delivery: "TEST", async send() {}, async verify(code) { return typeof code === "string" && code === "123456"; } };
}
