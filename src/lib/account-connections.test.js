import { describe, it, expect, vi } from "vitest";
import { normalizeConnectionPhone, validateConnectionPassword, connectionStatus, phoneVerificationProvider, connectionCountries } from "./account-connection-policy";
import { linkGoogle, requestPhoneConnection, confirmPhoneConnection, consumeConnectionRequest } from "./account-connections";

const identity = { id: "internal-1", publicId: "TLN-123", sessionVersion: 2, status: "ACTIVE", phone: null, passwordHash: null, coinBalance: 100n, googleSubject: "google-1", email: "user@gmail.com" };
function database(overrides = {}) {
  let user = { ...identity, ...overrides }; let state = null;
  const audit = vi.fn(); let other = null;
  const tx = {
    $queryRaw: vi.fn(async () => []),
    user: { findUnique: async () => ({ ...user }), findFirst: async () => other, update: vi.fn(async ({ data }) => (user = { ...user, ...data })) },
    ban: { findFirst: async () => null },
    auditLog: { create: audit },
    accountConnectionState: {
      findUnique: async () => state,
      upsert: async ({ create, update }) => (state = state ? { ...state, ...update } : { windowAt: new Date(), requestCount: 0, attempts: 0, ...create }),
      update: async ({ data }) => (state = { ...state, ...data, attempts: data.attempts?.increment ? state.attempts + data.attempts.increment : data.attempts ?? state.attempts }),
    },
  };
  return { ...tx, $transaction: fn => fn(tx), getUser: () => user, getState: () => state, conflict: () => { other = { id: "someone-else" }; }, audit };
}
const provider = phoneVerificationProvider({ NODE_ENV: "test" });
describe("connection input policy", () => {
  it("validates country and normalizes international phone numbers", () => {
    expect(normalizeConnectionPhone("0300 1234567", "PK")).toBe("+923001234567");
    expect(normalizeConnectionPhone("+49 1512 3456789", "DE")).toBe("+4915123456789");
    expect(normalizeConnectionPhone("07400 123456", "GB")).toBe("+447400123456");
    expect(() => normalizeConnectionPhone("+923001234567", "DE")).toThrow();
    expect(() => normalizeConnectionPhone("123", "PK")).toThrow();
    expect(() => normalizeConnectionPhone("phone +923001234567", "PK")).toThrow();
    expect(connectionCountries()).toContainEqual({ country: "PK", name: "Pakistan", callingCode: "+92" });
  });
  it("requires a password and never exposes sensitive status fields", () => {
    expect(() => validateConnectionPassword("short")).toThrow();
    expect(() => validateConnectionPassword("x".repeat(129))).toThrow();
    const status = connectionStatus({ ...identity, phone: "+923001234567", passwordHash: "secret" });
    expect(status.phoneConnected).toBe(true);
    expect(JSON.stringify(status)).not.toContain("+923001234567");
    expect(status).not.toHaveProperty("googleSubject");
    expect(status).not.toHaveProperty("passwordHash");
  });
  it("disables temporary verification by default in production", async () => {
    expect(() => phoneVerificationProvider({ NODE_ENV: "production" })).toThrow();
    expect(await provider.verify("123456")).toBe(true);
    expect(await provider.verify("999999")).toBe(false);
  });
});
describe("existing-account links", () => {
  it("links Google to the same user without touching identity or balances", async () => {
    const db = database({ googleSubject: null });
    const result = await linkGoogle(db, identity, { subject: "new-google", email: "verified@gmail.com" });
    expect(result.googleConnected).toBe(true);
    expect(db.getUser().publicId).toBe("TLN-123");
    expect(db.getUser().coinBalance).toBe(100n);
    expect(db.user.update.mock.calls[0][0].data).toEqual({ googleSubject: "new-google", email: "verified@gmail.com", googleEmail: "verified@gmail.com" });
    expect(db.audit).toHaveBeenCalledOnce();
    await linkGoogle(db, identity, { subject: "new-google", email: "verified@gmail.com" });
    expect(db.audit).toHaveBeenCalledOnce();
  });
  it("rejects Google conflicts and revoked sessions", async () => {
    const db = database({ googleSubject: null }); db.conflict();
    await expect(linkGoogle(db, identity, { subject: "other", email: "other@gmail.com" })).rejects.toMatchObject({ code: "GOOGLE_ACCOUNT_ALREADY_CONNECTED" });
    await expect(linkGoogle(database({ sessionVersion: 3 }), identity, {})).rejects.toMatchObject({ status: 401 });
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it("persists wrong OTP attempts, consumes a valid challenge once, stores only a hash", async () => {
    const db = database();
    const challenge = await requestPhoneConnection(db, identity, { country: "PK", phone: "03001234567" }, provider);
    const input = { challengeId: challenge.challengeId, password: "password123", otp: "000000" };
    const hash = vi.fn(async () => "scrypt$hashed");
    await expect(confirmPhoneConnection(db, identity, input, hash, provider)).rejects.toMatchObject({ code: "OTP_INCORRECT" });
    expect(db.getState().attempts).toBe(1);
    input.otp = "123456";
    expect((await confirmPhoneConnection(db, identity, input, hash, provider)).phoneConnected).toBe(true);
    await confirmPhoneConnection(db, identity, input, hash, provider);
    expect(db.audit).toHaveBeenCalledOnce();
    expect(db.getUser().passwordHash).toBe("scrypt$hashed");
    expect(db.getUser().publicId).toBe(identity.publicId);
    expect(db.getUser().phone).toBe("+923001234567");
  });
  it("blocks five failed attempts, expired challenges, other users and conflicting phones", async () => {
    const db = database(); const hash = async () => "hash";
    const { challengeId } = await requestPhoneConnection(db, identity, { country: "PK", phone: "03001234567" }, provider);
    for (let i = 0; i < 5; i++) await expect(confirmPhoneConnection(db, identity, { challengeId, otp: "wrong", password: "password123" }, hash, provider)).rejects.toThrow();
    await expect(confirmPhoneConnection(db, identity, { challengeId, otp: "123456", password: "password123" }, hash, provider)).rejects.toMatchObject({ code: "OTP_ATTEMPTS_EXCEEDED" });
    db.getState().expiresAt = new Date(0);
    await expect(confirmPhoneConnection(db, identity, { challengeId, otp: "123456", password: "password123" }, hash, provider)).rejects.toMatchObject({ code: "OTP_EXPIRED" });
    db.conflict();
    await expect(requestPhoneConnection(db, identity, { country: "PK", phone: "03001234567" }, provider)).rejects.toMatchObject({ code: "PHONE_ALREADY_CONNECTED_ELSEWHERE" });
  });
  it("limits persisted requests per account", async () => {
    const db = database();
    for (let i = 0; i < 10; i++) await consumeConnectionRequest(db, identity);
    await expect(consumeConnectionRequest(db, identity)).rejects.toMatchObject({ status: 429 });
  });
});
