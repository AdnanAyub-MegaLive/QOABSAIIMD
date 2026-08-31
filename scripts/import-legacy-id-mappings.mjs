import { readFile } from "node:fs/promises";
import { prisma } from "../src/lib/prisma.js";
import {
  LEGACY_MAPPING_SOURCE,
  upsertLegacyIdMapping,
} from "../src/lib/legacy-id-mapping.js";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

const file = argument("--file");
const source = argument("--source") || LEGACY_MAPPING_SOURCE;
const dryRun = process.argv.includes("--dry-run");

if (!file) {
  console.error("Usage: npm run legacy-ids:import -- --file <export.json> [--source NAME] [--dry-run]");
  process.exit(1);
}

let input;
try {
  input = JSON.parse(await readFile(file, "utf8"));
} catch (error) {
  console.error("Unable to read a valid JSON mapping export.", error.message);
  process.exit(1);
}

const users = Array.isArray(input.users) ? input.users : [];
const audioRooms = Array.isArray(input.audioRooms) ? input.audioRooms : [];
if (!users.length && !audioRooms.length) {
  console.error("The mapping export must contain a non-empty users or audioRooms array.");
  process.exit(1);
}

const rows = [
  ...users.map((row) => ({ entityType: "USER", ...row })),
  ...audioRooms.map((row) => ({ entityType: "AUDIO_ROOM", ...row })),
];

try {
  if (dryRun) {
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        await upsertLegacyIdMapping(tx, { ...row, source });
      }
      throw new Error("DRY_RUN_COMPLETE");
    });
  } else {
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        await upsertLegacyIdMapping(tx, { ...row, source });
      }
    });
  }
  console.log(`Imported ${rows.length} legacy ID mappings from source ${source}.`);
} catch (error) {
  if (dryRun && error.message === "DRY_RUN_COMPLETE") {
    console.log(`Validated ${rows.length} legacy ID mappings. No database changes were made.`);
  } else {
    console.error("Legacy ID mapping import failed.", error.message);
    process.exit(1);
  }
} finally {
  await prisma.$disconnect();
}
