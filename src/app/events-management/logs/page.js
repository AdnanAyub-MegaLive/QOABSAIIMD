import { redirect } from "next/navigation";
import { prisma } from "../../../lib/prisma.js";
import { requireEventUser } from "../../../lib/events/auth.js";
import LogsSearch from "./logs-search.js";

export default async function EventsLogsPage() {
  const user = await requireEventUser(null);
  if (user.role !== "SUPER_ADMIN") redirect("/events-management");
  const logs = await prisma.eventAuditLog.findMany({
    include: {
      user: { select: { name: true, email: true } },
      event: { select: { name: true, slug: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  return <><h2 className="text-3xl font-black">Events Audit Logs</h2><p className="mt-1 text-slate-500">Every authentication, upload, publishing, rollback, user, and deletion action.</p><LogsSearch logs={logs} /></>;
}
