import { readFileSync } from "node:fs";
import dotenv from "dotenv";

// Read-only deployment guard: never print or rewrite secret values.
const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const parsed = dotenv.parse(raw);
const definitions = raw.split(/\r?\n/).filter(line => /^\s*(?:export\s+)?AUTH_SECRET\s*=/.test(line));
const errors = [];
if (definitions.length !== 1) errors.push("Keep exactly one AUTH_SECRET entry in .env.local; retain the currently effective value, do not generate a new secret.");
if (!parsed.AUTH_SECRET?.trim()) errors.push("AUTH_SECRET must not be empty.");
if (process.env.AUTH_SECRET && process.env.AUTH_SECRET !== parsed.AUTH_SECRET) errors.push("Inherited AUTH_SECRET differs from .env.local. Resolve the deployment environment before restarting.");
if (errors.length) { errors.forEach(message => console.error(message)); process.exitCode = 1; }
else console.log("Authentication configuration check passed (no secrets displayed).");
