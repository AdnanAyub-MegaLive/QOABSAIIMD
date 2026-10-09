const GEO_HEADERS = [
  "cf-ipcountry",
  "x-vercel-ip-country",
  "x-geo-country",
];

// ISO 3166-1 alpha-2 codes. Keeping this list server-side makes validation
// deterministic and prevents arbitrary two-letter values from entering profiles.
const COUNTRY_CODES = new Set((
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" "));
const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
const normalizeName = value => String(value ?? "").trim().toLocaleLowerCase("en").normalize("NFKD").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const COUNTRY_NAMES = new Map([...COUNTRY_CODES].map(code => [normalizeName(displayNames.of(code)), code]));
export const countryOptions = [...COUNTRY_CODES].map(code => ({ code, name: displayNames.of(code) })).sort((a, b) => a.name.localeCompare(b.name, "en"));
for (const [name, code] of Object.entries({
  "united states of america": "US", usa: "US", uk: "GB", "great britain": "GB",
  "south korea": "KR", "north korea": "KP", russia: "RU", vietnam: "VN",
  "ivory coast": "CI", bolivia: "BO", tanzania: "TZ", venezuela: "VE",
  moldova: "MD", "laos": "LA", "syria": "SY", "iran": "IR",
})) COUNTRY_NAMES.set(normalizeName(name), code);

export function normalizeCountryCode(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return COUNTRY_CODES.has(code) ? code : null;
}

export function normalizeSignupCountry(value) {
  return normalizeCountryCode(value) ?? COUNTRY_NAMES.get(normalizeName(value)) ?? null;
}

export function clientSignupCountry(value) {
  const provided = value !== undefined && value !== null && (typeof value !== "string" || Boolean(value.trim()));
  return { provided, country: provided ? normalizeSignupCountry(value) : null };
}

export function chooseSignupCountry(request, value) {
  const selected = clientSignupCountry(value);
  if (selected.provided) return { ...selected, source: selected.country ? "client" : null };
  const connection = resolveSignupCountry(request);
  return { provided: false, country: connection.country, source: connection.source };
}

export function requiresSignupGeolocation() {
  return false;
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
