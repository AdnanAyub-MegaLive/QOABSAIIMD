import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
dotenv.config({ path: ".env.local", quiet: true });
const { prisma } = await import("../src/lib/prisma.js");
const { createEventWithUpload, changeEventStatus } = await import("../src/lib/events/service.js");
try {
  const existing = await prisma.event.findUnique({ where: { slug: "cp-lover" } });
  if (existing) {
    console.log(JSON.stringify({ name: existing.name, status: existing.status, url: "/event/cp-lover", note: "Existing event preserved; no overwrite." }));
  } else {
    const user = await prisma.eventUser.findFirst({ where: { active: true, role: "SUPER_ADMIN" }, orderBy: { createdAt: "asc" } });
    if (!user) throw new Error("No active Events Super Admin exists. Configure Events administration first.");
    const html = await readFile(new URL("../events/CP%20Lover/index.html", import.meta.url));
    const formData = new FormData();
    formData.append("files", new File([html], "index.html", { type: "text/html" }));
    formData.append("paths", "CP Lover/index.html");
    const event = await createEventWithUpload({ metadata: { name: "CP Lover", slug: "cp-lover" }, formData, user });
    const published = await changeEventStatus({ id: event.id, status: "PUBLISHED", user });
    console.log(JSON.stringify({ name: published.name, status: published.status, url: published.publicUrl }));
  }
} finally {
  await prisma.$disconnect();
}
