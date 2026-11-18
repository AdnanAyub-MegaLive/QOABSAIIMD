import { prisma } from "./prisma.js";

export const DEFAULT_STORE_URL = "https://play.google.com/store/apps/details?id=com.megachat.megalive";
export const DEFAULT_UPDATE_MESSAGE = "A new version of MegaLive is available. Please update MegaLive from the Play Store to continue.";
export const DEFAULT_MINOR_MESSAGE = "A new version of MegaLive is available with improvements. Update now for the best experience.";
export const STORE_HINT = "Please update MegaLive from the Play Store to continue.";
export const appVersionDefaults = { forceUpdateEnabled: false, androidMinVersionCode: 1, androidLatestVersionName: "", androidStoreUrl: DEFAULT_STORE_URL, updateMessage: DEFAULT_UPDATE_MESSAGE, minorUpdateEnabled: false, androidRecommendedVersionCode: 1, minorUpdateMessage: DEFAULT_MINOR_MESSAGE, revision: 0 };
const fields = ["forceUpdateEnabled", "androidMinVersionCode", "androidLatestVersionName", "androidStoreUrl", "updateMessage", "minorUpdateEnabled", "androidRecommendedVersionCode", "minorUpdateMessage", "revision"];

export function appVersionSettingsDto(row) {
  const source = row ?? appVersionDefaults;
  return Object.fromEntries(fields.map(key => [key, source[key] ?? appVersionDefaults[key]]));
}

const CACHE_MS = 10_000;
let cached = null;
export function clearAppVersionCache() { cached = null; }

export async function loadAppVersionSettings(db = prisma, { fresh = false } = {}) {
  if (typeof db?.appVersionSettings?.findUnique !== "function") return appVersionSettingsDto(null);
  const now = Date.now();
  if (!fresh && cached && cached.db === db && cached.expiresAt > now) return cached.value;
  try {
    let row;
    try { row = await db.appVersionSettings.findUnique({ where: { id: "GLOBAL" } }); }
    catch { row = await db.appVersionSettings.findUnique({ where: { id: "GLOBAL" }, select: { forceUpdateEnabled: true, androidMinVersionCode: true, androidLatestVersionName: true, androidStoreUrl: true, updateMessage: true, revision: true } }); }
    const value = appVersionSettingsDto(row);
    cached = { db, value, expiresAt: now + CACHE_MS };
    return value;
  } catch (error) {
    console.error("App version settings unavailable", error);
    return appVersionSettingsDto(null);
  }
}

export function parseVersionCode(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,9}$/.test(text)) return null;
  const code = Number(text);
  return code >= 1 ? code : null;
}

export function validateAppVersionInput(input) {
  const errors = {};
  const latest = typeof input?.androidLatestVersionName === "string" ? input.androidLatestVersionName.trim() : "";
  const storeUrl = typeof input?.androidStoreUrl === "string" ? input.androidStoreUrl.trim() : "";
  const message = typeof input?.updateMessage === "string" && input.updateMessage.trim() ? input.updateMessage.trim() : DEFAULT_UPDATE_MESSAGE;
  if (typeof input?.forceUpdateEnabled !== "boolean") errors.forceUpdateEnabled = "Choose whether force update is enabled.";
  if (!Number.isInteger(input?.androidMinVersionCode) || input.androidMinVersionCode < 1 || input.androidMinVersionCode > 1_000_000) errors.androidMinVersionCode = "Minimum version code must be a whole number from 1 to 1000000.";
  if (!latest || latest.length > 32) errors.androidLatestVersionName = "Latest version name must be 1–32 characters.";
  let url = null;
  try { url = new URL(storeUrl); } catch { url = null; }
  if (!url || url.protocol !== "https:" || storeUrl.length > 500) errors.androidStoreUrl = "Store URL must be a valid https:// link.";
  if (message.length > 500) errors.updateMessage = "Update message must be 500 characters or fewer.";
  const minorMessage = typeof input?.minorUpdateMessage === "string" && input.minorUpdateMessage.trim() ? input.minorUpdateMessage.trim() : DEFAULT_MINOR_MESSAGE;
  const minorEnabled = input?.minorUpdateEnabled === undefined ? false : input.minorUpdateEnabled;
  const recommended = input?.androidRecommendedVersionCode === undefined ? (Number.isInteger(input?.androidMinVersionCode) && input.androidMinVersionCode >= 1 && input.androidMinVersionCode <= 1_000_000 ? input.androidMinVersionCode : 1) : input.androidRecommendedVersionCode;
  if (typeof minorEnabled !== "boolean") errors.minorUpdateEnabled = "Choose whether the minor update is enabled.";
  if (!Number.isInteger(recommended) || recommended < 1 || recommended > 1_000_000) errors.androidRecommendedVersionCode = "Recommended version code must be a whole number from 1 to 1,000,000.";
  else if (!errors.androidMinVersionCode && recommended < input.androidMinVersionCode) errors.androidRecommendedVersionCode = "Recommended version code must be at least the minimum version code.";
  if (minorMessage.length > 500) errors.minorUpdateMessage = "Minor update message must be 500 characters or fewer.";
  if (!Number.isInteger(input?.revision) || input.revision < 0) errors.revision = "Reload the page and try again.";
  return { errors, values: { forceUpdateEnabled: input?.forceUpdateEnabled, androidMinVersionCode: input?.androidMinVersionCode, androidLatestVersionName: latest, androidStoreUrl: storeUrl, updateMessage: message, minorUpdateEnabled: minorEnabled, androidRecommendedVersionCode: recommended, minorUpdateMessage: minorMessage } };
}

export function versionDecision(settings, versionCode) {
  const code = parseVersionCode(versionCode);
  const forceUpdate = Boolean(settings.forceUpdateEnabled);
  const recommendedVersionCode = Math.max(settings.androidRecommendedVersionCode ?? settings.androidMinVersionCode, settings.androidMinVersionCode);
  const updateRequired = forceUpdate && (code === null || code < settings.androidMinVersionCode);
  const minorUpdate = !updateRequired && Boolean(settings.minorUpdateEnabled) && code !== null && code < recommendedVersionCode;
  return {
    platform: "android",
    minVersionCode: settings.androidMinVersionCode,
    latestVersionName: settings.androidLatestVersionName,
    storeUrl: settings.androidStoreUrl,
    forceUpdate,
    updateRequired,
    message: settings.updateMessage,
    recommendedVersionCode,
    minorUpdate,
    minorMessage: settings.minorUpdateMessage || DEFAULT_MINOR_MESSAGE,
    updateType: updateRequired ? "MAJOR" : minorUpdate ? "MINOR" : "NONE",
  };
}

export function gateMessage(message) {
  const base = String(message || DEFAULT_UPDATE_MESSAGE).trim();
  return /play store/i.test(base) ? base : `${base} ${STORE_HINT}`;
}

export function updateRequiredBody(settings) {
  return { success: false, error: { code: "APP_UPDATE_REQUIRED", message: gateMessage(settings.updateMessage), storeUrl: settings.androidStoreUrl, minVersionCode: settings.androidMinVersionCode } };
}

export function browserClient(userAgent) {
  return /mozilla\//i.test(String(userAgent ?? ""));
}

export async function outdatedClient({ platform, versionCode, userAgent }, db = prisma) {
  const name = String(platform ?? "").trim().toLowerCase();
  if (name && name !== "android") return null;
  if (String(versionCode ?? "").trim() || browserClient(userAgent)) return null;
  const settings = await loadAppVersionSettings(db);
  return settings.forceUpdateEnabled ? settings : null;
}

function requestClient(request) {
  return { platform: request.headers.get("x-app-platform"), versionCode: request.headers.get("x-app-version-code"), userAgent: request.headers.get("user-agent") };
}

export function appUpdateRequiredError(settings) {
  const { error } = updateRequiredBody(settings);
  return Object.assign(new Error(error.message), error, { status: 426 });
}

export function isAppUpdateRequired(error) {
  return error?.code === "APP_UPDATE_REQUIRED" && error?.status === 426;
}

export function appUpdateRequiredResponse(error, headers = {}) {
  return Response.json({ success: false, error: { code: error.code, message: error.message, storeUrl: error.storeUrl, minVersionCode: error.minVersionCode } }, { status: 426, headers: { ...headers, "Cache-Control": "no-store" } });
}

export async function authVersionGate(request, { db = prisma, headers = {} } = {}) {
  const settings = await outdatedClient(requestClient(request), db);
  return settings ? appUpdateRequiredResponse(appUpdateRequiredError(settings), headers) : null;
}

export async function assertMobileAppVersion(request, db = prisma) {
  const settings = await outdatedClient(requestClient(request), db);
  if (settings) throw appUpdateRequiredError(settings);
}

export async function socketVersionGate(handshake, db = prisma) {
  const headers = handshake?.headers ?? {};
  const auth = handshake?.auth ?? {};
  const settings = await outdatedClient({ platform: auth.platform ?? headers["x-app-platform"], versionCode: auth.versionCode ?? headers["x-app-version-code"], userAgent: headers["user-agent"] }, db);
  if (!settings) return null;
  const { error } = updateRequiredBody(settings);
  return Object.assign(new Error("APP_UPDATE_REQUIRED"), { data: { code: error.code, message: error.message, storeUrl: error.storeUrl, minVersionCode: error.minVersionCode } });
}
