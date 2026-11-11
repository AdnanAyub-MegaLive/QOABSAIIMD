import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (!["enable", "disable"].includes(mode)) throw new Error("Usage: node scripts/set-super-admin-devices.mjs enable|disable");
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.local");
let content = fs.readFileSync(file, "utf8");
if (mode === "enable") {
  const secret = content.match(/^SUPER_ADMIN_MTLS_PROXY_SECRET=(.*)$/m)?.[1]?.trim();
  const fingerprints = content.match(/^SUPER_ADMIN_MTLS_FINGERPRINTS=(.*)$/m)?.[1]?.trim().split(",");
  if (!/^[a-f0-9]{64}$/i.test(secret || "") || fingerprints?.length !== 2 ||
      new Set(fingerprints).size !== 2 || fingerprints.some(f => !/^[a-f0-9]{64}$/i.test(f)))
    throw new Error("Provision two distinct device fingerprints and a proxy secret first.");
}
content = content.replace(/^SUPER_ADMIN_MTLS_ENABLED=.*\r?\n?/gm, "");
fs.writeFileSync(file, content.trimEnd() + `\nSUPER_ADMIN_MTLS_ENABLED=${mode === "enable"}\n`);
console.log(`Super Admin device restriction ${mode}d in .env.local. Restart PM2 with --update-env.`);
