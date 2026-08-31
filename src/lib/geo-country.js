const GEO_HEADERS = [
  "cf-ipcountry",
  "x-vercel-ip-country",
  "x-geo-country",
];

export function normalizeCountryCode(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) && code !== "XX" ? code : null;
}

export function requiresSignupGeolocation() {
  return process.env.GEOLOCATION_REQUIRED === "true" || process.env.NODE_ENV === "production";
}

export function resolveSignupCountry(request) {
  // Public clients can forge forwarding headers. Production must only enable
  // this after its reverse proxy removes incoming copies and writes its own.
  const headersAreTrusted =
    process.env.NODE_ENV !== "production" ||
    process.env.TRUST_PROXY_GEO_HEADERS === "true";
  if (!headersAreTrusted) return { country: null, source: null };

  for (const header of GEO_HEADERS) {
    const country = normalizeCountryCode(request.headers.get(header));
    if (country) return { country, source: header };
  }
  return { country: null, source: null };
}
