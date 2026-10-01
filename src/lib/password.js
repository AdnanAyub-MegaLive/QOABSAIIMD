import "server-only";
import { promisify } from "node:util";
import { randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const scrypt=promisify(scryptCallback);

export async function hashPassword(password) {
  const value=String(password);
  if(value.length<8)throw new Error("PASSWORD_TOO_SHORT");
  const salt=randomBytes(16).toString("hex");
  const derived=await scrypt(value,salt,64);
  return `scrypt$${salt}$${Buffer.from(derived).toString("hex")}`;
}

export function generateTemporaryPassword() {
  const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  return Array.from({length:8},()=>alphabet[randomInt(alphabet.length)]).join("");
}

export async function verifyPassword(password,storedHash) {
  const [algorithm,salt,expectedHex]=String(storedHash||"").split("$");
  if(algorithm!=="scrypt"||!salt||!expectedHex)return false;
  const derived=Buffer.from(await scrypt(String(password),salt,64));
  const expected=Buffer.from(expectedHex,"hex");
  return derived.length===expected.length&&timingSafeEqual(derived,expected);
}
