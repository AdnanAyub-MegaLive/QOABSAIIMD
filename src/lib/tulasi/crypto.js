import { constants, privateDecrypt, publicEncrypt } from "node:crypto";

// Tulasi wire format: UTF-8 bytes split into 200-byte chunks, each RSA/ECB/PKCS1 encrypted,
// base64-encoded and joined with ":".
const SPLIT_SIZE = 200;
const SPLIT = ":";

export function pemKey(value, type) {
  const text = String(value ?? "").trim().replace(/\\n/g, "\n");
  if (!text) throw new Error("TULASI_KEY_MISSING");
  if (text.includes("-----BEGIN")) return text;
  const body = text.replace(/\s+/g, "").match(/.{1,64}/g).join("\n");
  return `-----BEGIN ${type}-----\n${body}\n-----END ${type}-----\n`;
}

export function encryptBigData(publicKey, data) {
  const key = { key: pemKey(publicKey, "PUBLIC KEY"), padding: constants.RSA_PKCS1_PADDING };
  const bytes = Buffer.from(String(data), "utf8");
  const chunks = [];
  for (let i = 0; i < bytes.length; i += SPLIT_SIZE) chunks.push(publicEncrypt(key, bytes.subarray(i, i + SPLIT_SIZE)).toString("base64"));
  return chunks.join(SPLIT);
}

export function decryptBigData(privateKey, encryptedText) {
  const key = { key: pemKey(privateKey, "PRIVATE KEY"), padding: constants.RSA_PKCS1_PADDING };
  const parts = String(encryptedText ?? "").trim().replace(/^"|"$/g, "").split(SPLIT).filter((part) => part.trim());
  if (!parts.length) throw new Error("TULASI_EMPTY_BODY");
  return Buffer.concat(parts.map((part) => privateDecrypt(key, Buffer.from(part.trim(), "base64")))).toString("utf8");
}
