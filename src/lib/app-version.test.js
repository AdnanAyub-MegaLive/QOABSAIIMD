import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ settings: null }));
vi.mock("./prisma.js", () => ({ prisma: { appVersionSettings: { findUnique: async () => m.settings }, apiRequestLog: { create: async () => ({}) } } }));
vi.mock("./prisma", () => ({ prisma: { appVersionSettings: { findUnique: async () => m.settings }, apiRequestLog: { create: async () => ({}) } } }));
import { authVersionGate, clearAppVersionCache, gateMessage, parseVersionCode, socketVersionGate, validateAppVersionInput, versionDecision, assertMobileAppVersion } from "./app-version.js";
import { GET } from "../app/api/v1/app/version/route.js";

const enabled = { forceUpdateEnabled: true, androidMinVersionCode: 22, androidLatestVersionName: "2.0.2", androidStoreUrl: "https://play.google.com/store/apps/details?id=com.megachat.megalive", updateMessage: "A new version of MegaLive is available. Please update MegaLive from the Play Store to continue.", revision: 1 };
const req = (headers = {}) => new Request("https://portal.test/api/users/login", { method: "POST", headers });
beforeEach(() => { clearAppVersionCache(); m.settings = enabled; });

it("parses version codes strictly", () => {
  expect(parseVersionCode("22")).toBe(22);
  expect(parseVersionCode(" 7 ")).toBe(7);
  for (const bad of [null, undefined, "", "0", "-3", "2.1", "abc", "1234567890"]) expect(parseVersionCode(bad)).toBeNull();
});

it("decides update requirement", () => {
  expect(versionDecision(enabled, "21").updateRequired).toBe(true);
  expect(versionDecision(enabled, "22").updateRequired).toBe(false);
  expect(versionDecision(enabled, "30").updateRequired).toBe(false);
  expect(versionDecision(enabled, null).updateRequired).toBe(true);
  expect(versionDecision(enabled, "junk").updateRequired).toBe(true);
  expect(versionDecision({ ...enabled, forceUpdateEnabled: false }, "1").updateRequired).toBe(false);
  expect(versionDecision({ ...enabled, forceUpdateEnabled: false }, null)).toMatchObject({ forceUpdate: false, updateRequired: false });
  expect(versionDecision(enabled, "21")).toEqual({ platform: "android", minVersionCode: 22, latestVersionName: "2.0.2", storeUrl: enabled.androidStoreUrl, forceUpdate: true, updateRequired: true, message: enabled.updateMessage });
});

it("makes the gate message point to the Play Store", () => {
  expect(gateMessage(enabled.updateMessage)).toBe("A new version of MegaLive is available. Please update MegaLive from the Play Store to continue.");
  expect(gateMessage("Update from the Play Store now.")).toBe("Update from the Play Store now.");
});

it("validates admin input", () => {
  const good = { forceUpdateEnabled: true, androidMinVersionCode: 22, androidLatestVersionName: "2.0.2", androidStoreUrl: enabled.androidStoreUrl, updateMessage: "", revision: 0 };
  const ok = validateAppVersionInput(good);
  expect(ok.errors).toEqual({});
  expect(ok.values.updateMessage).toBe(enabled.updateMessage);
  expect(Object.keys(validateAppVersionInput({ ...good, androidMinVersionCode: 0 }).errors)).toEqual(["androidMinVersionCode"]);
  expect(Object.keys(validateAppVersionInput({ ...good, androidMinVersionCode: 1_000_001 }).errors)).toEqual(["androidMinVersionCode"]);
  expect(Object.keys(validateAppVersionInput({ ...good, androidMinVersionCode: "22" }).errors)).toEqual(["androidMinVersionCode"]);
  expect(Object.keys(validateAppVersionInput({ ...good, androidStoreUrl: "http://play.google.com/x" }).errors)).toEqual(["androidStoreUrl"]);
  expect(Object.keys(validateAppVersionInput({ ...good, androidStoreUrl: "nope" }).errors)).toEqual(["androidStoreUrl"]);
  expect(Object.keys(validateAppVersionInput({ ...good, forceUpdateEnabled: "yes" }).errors)).toEqual(["forceUpdateEnabled"]);
});

it("blocks auth requests only when the version header is missing", async () => {
  const missing = await authVersionGate(req());
  expect(missing.status).toBe(426);
  expect(await missing.json()).toEqual({ success: false, error: { code: "APP_UPDATE_REQUIRED", message: gateMessage(enabled.updateMessage), storeUrl: enabled.androidStoreUrl, minVersionCode: 22 } });
  expect(await authVersionGate(req({ "X-App-Version-Code": "21", "X-App-Platform": "android" }))).toBeNull();
  expect(await authVersionGate(req({ "X-App-Version-Code": "junk" }))).toBeNull();
  expect(await authVersionGate(req({ "X-App-Version-Code": "22", "X-App-Platform": "android" }))).toBeNull();
  expect(await authVersionGate(req({ "X-App-Platform": "ios" }))).toBeNull();
});

it("lets everything through when force update is disabled", async () => {
  m.settings = { ...enabled, forceUpdateEnabled: false };
  expect(await authVersionGate(req())).toBeNull();
  await expect(assertMobileAppVersion(req())).resolves.toBeUndefined();
  expect(await socketVersionGate({ auth: {}, headers: {} })).toBeNull();
});

it("defaults to disabled when no settings row exists", async () => {
  m.settings = null;
  expect(await authVersionGate(req())).toBeNull();
});

it("throws a 426 error for mobile API calls without the version header", async () => {
  await expect(assertMobileAppVersion(req())).rejects.toMatchObject({ status: 426, code: "APP_UPDATE_REQUIRED", minVersionCode: 22 });
  await expect(assertMobileAppVersion(req({ "X-App-Version-Code": "5" }))).resolves.toBeUndefined();
  await expect(assertMobileAppVersion(req({ "X-App-Version-Code": "22" }))).resolves.toBeUndefined();
  await expect(assertMobileAppVersion(req({ "User-Agent": "okhttp/4.12.0" }))).rejects.toMatchObject({ status: 426 });
  await expect(assertMobileAppVersion(req({ "User-Agent": "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36" }))).resolves.toBeUndefined();
});

it("rejects socket handshakes without a version", async () => {
  expect(await socketVersionGate({ auth: { versionCode: 3 }, headers: {} })).toBeNull();
  const error = await socketVersionGate({ auth: {}, headers: {} });
  expect(error.message).toBe("APP_UPDATE_REQUIRED");
  expect(error.data).toMatchObject({ code: "APP_UPDATE_REQUIRED", minVersionCode: 22, storeUrl: enabled.androidStoreUrl });
  expect(await socketVersionGate({ auth: {}, headers: { "x-app-version-code": "22" } })).toBeNull();
});

it("serves the public version endpoint", async () => {
  const response = await GET(new Request("https://portal.test/api/v1/app/version?platform=android&versionCode=21", { headers: { "x-real-ip": "198.51.100.7" } }));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(await response.json()).toEqual({ success: true, data: versionDecision(enabled, "21") });
  const current = await (await GET(new Request("https://portal.test/api/v1/app/version?versionCode=22", { headers: { "x-real-ip": "198.51.100.8" } }))).json();
  expect(current.data.updateRequired).toBe(false);
  const unknown = await (await GET(new Request("https://portal.test/api/v1/app/version", { headers: { "x-real-ip": "198.51.100.9" } }))).json();
  expect(unknown.data.updateRequired).toBe(true);
  expect((await GET(new Request("https://portal.test/api/v1/app/version?platform=ios", { headers: { "x-real-ip": "198.51.100.10" } }))).status).toBe(422);
});
