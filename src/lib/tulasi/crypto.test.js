import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptBigData, encryptBigData, pemKey } from "./crypto.js";

const pair = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
const bare = (pem) => pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");

describe("tulasi crypto", () => {
  it("round-trips multi-chunk UTF-8 JSON", () => {
    const json = JSON.stringify({ nickname: "دیمو 用户 ".repeat(40), coin: 9800 });
    const cipher = encryptBigData(pair.publicKey, json);
    expect(cipher.split(":").length).toBeGreaterThan(1);
    expect(decryptBigData(pair.privateKey, cipher)).toBe(json);
  });
  it("accepts bare base64 keys as shown in the Tulasi panel", () => {
    const cipher = encryptBigData(bare(pair.publicKey), "{\"a\":1}");
    expect(decryptBigData(bare(pair.privateKey), cipher)).toBe("{\"a\":1}");
  });
  it("rejects empty bodies and missing keys", () => {
    expect(() => decryptBigData(pair.privateKey, "")).toThrow("TULASI_EMPTY_BODY");
    expect(() => pemKey("", "PUBLIC KEY")).toThrow("TULASI_KEY_MISSING");
  });
});
