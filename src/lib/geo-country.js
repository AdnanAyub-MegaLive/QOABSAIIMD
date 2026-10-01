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
  // Country is a server-authoritative identity field. A new account must not
  // silently receive a null country just because a client sent an unknown
  // location string or the trusted edge header was absent.
  return true;
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
