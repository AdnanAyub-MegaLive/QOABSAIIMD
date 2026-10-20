import { randomInt } from "node:crypto";

const MIN_SIX_DIGIT_NUMBER = 100000;
const MAX_SIX_DIGIT_NUMBER_EXCLUSIVE = 1000000;

export async function generateNumericPublicId(
  prefix,
  exists,
  { attempts = 100, nextNumber = randomInt, db } = {},
) {
  if (!/^[A-Z]+$/.test(prefix)) throw new Error("INVALID_PUBLIC_ID_PREFIX");
  if (typeof exists !== "function") throw new Error("PUBLIC_ID_LOOKUP_REQUIRED");
  if (["USR", "TLN", "AGN"].includes(prefix)) {
    const client = db ?? (await import("./prisma.js")).prisma;
    const rows = await client.$queryRaw`SELECT allocate_public_number(${prefix}) AS number`;
    return `${prefix}-${rows[0].number}`;
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const number = nextNumber(
      MIN_SIX_DIGIT_NUMBER,
      MAX_SIX_DIGIT_NUMBER_EXCLUSIVE,
    );
    const publicId = `${prefix}-${number}`;
    if (!(await exists(publicId))) return publicId;
  }

  throw new Error("PUBLIC_ID_GENERATION_EXHAUSTED");
}
