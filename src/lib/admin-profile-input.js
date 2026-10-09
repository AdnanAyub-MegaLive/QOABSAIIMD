import { normalizeSignupCountry } from "./geo-country.js";

export function adminProfileFields(changes) {
  const data = {};
  if (changes.name !== undefined) {
    data.name = String(changes.name ?? "").trim();
    if (!data.name || data.name.length > 120) throw new Error("Enter a name between 1 and 120 characters.");
  }
  if (changes.phone !== undefined) {
    data.phone = String(changes.phone ?? "").trim().replace(/[\s().-]/g, "") || null;
    if (data.phone && !/^\+?[0-9]{7,15}$/.test(data.phone)) throw new Error("Enter a valid phone number or leave it blank.");
  }
  if (changes.email !== undefined) {
    data.email = String(changes.email ?? "").trim().toLowerCase() || null;
    if (data.email && (data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))) throw new Error("Enter a valid email address or leave it blank.");
  }
  if (changes.country !== undefined) {
    const raw = String(changes.country ?? "").trim();
    data.country = raw ? normalizeSignupCountry(raw) : null;
    if (raw && !data.country) throw new Error("Select a valid country from the list.");
  }
  return data;
}
