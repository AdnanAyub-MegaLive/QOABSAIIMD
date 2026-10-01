import bcrypt from "bcrypt";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

process.loadEnvFile?.(".env.local");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const production = process.env.NODE_ENV === "production";
const email = process.env.EVENTS_SUPER_ADMIN_EMAIL || "events.admin@streamline.local";
const password = process.env.EVENTS_SUPER_ADMIN_PASSWORD || (production ? null : "EventsAdmin#2026");
if (!password)
  throw new Error("EVENTS_SUPER_ADMIN_PASSWORD is required when seeding production.");

try {
  const admin = await prisma.eventUser.upsert({
    where: { email },
    update: {
      name: process.env.EVENTS_SUPER_ADMIN_NAME || "Events Super Admin",
      role: "SUPER_ADMIN",
      active: true,
    },
    create: {
      name: process.env.EVENTS_SUPER_ADMIN_NAME || "Events Super Admin",
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: "SUPER_ADMIN",
    },
  });

  const html = Buffer.from(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./style.css"><title>Streamline Summer Event</title></head>
<body><main><p>STREAMLINE EVENT</p><h1>Summer Live Festival</h1><p>Sample draft event created by the Events seed.</p><button id="join">Join the celebration</button></main><script src="./script.js"></script></body></html>`);
  const css = Buffer.from("body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#073f38,#12a58f);font:16px system-ui;color:white;text-align:center}main{padding:3rem}h1{font-size:clamp(2.5rem,8vw,6rem);margin:.2em 0}button{border:0;border-radius:999px;padding:1rem 1.4rem;font-weight:800;color:#073f38}");
  const js = Buffer.from("document.querySelector('#join').addEventListener('click',()=>alert('Welcome to Streamline!'));");
  const folderName = "sample-summer-event";
  const relativeVersion = `${folderName}/v1`;
  const root = path.resolve(process.cwd(), process.env.EVENTS_STORAGE_ROOT || "storage/events", relativeVersion);
  await mkdir(root, { recursive: true });
  await Promise.all([
    writeFile(path.join(root, "index.html"), html),
    writeFile(path.join(root, "style.css"), css),
    writeFile(path.join(root, "script.js"), js),
  ]);
  const digest = createHash("sha256");
  for (const [name, data] of [["index.html", html], ["script.js", js], ["style.css", css]]) {
    digest.update(name);
    digest.update(data);
  }
  await prisma.event.upsert({
    where: { slug: "sample-summer-event" },
    update: {},
    create: {
      publicId: "EVT-SAMPLE000001",
      name: "Sample Summer Event",
      slug: "sample-summer-event",
      folderName,
      entryFile: "index.html",
      status: "DRAFT",
      createdById: admin.id,
      versions: {
        create: {
          version: 1,
          folderName: relativeVersion,
          entryFile: "index.html",
          fileCount: 3,
          sizeBytes: BigInt(html.length + css.length + js.length),
          checksum: digest.digest("hex"),
          createdById: admin.id,
        },
      },
    },
  });
  console.log(`Events seed complete. Login: ${email}${production ? "" : ` / ${password}`}`);
} finally {
  await prisma.$disconnect();
}
