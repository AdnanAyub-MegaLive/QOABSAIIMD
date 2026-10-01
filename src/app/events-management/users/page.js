import { redirect } from "next/navigation";
import { prisma } from "../../../lib/prisma.js";
import { requireEventUser } from "../../../lib/events/auth.js";
import EventUsersManager from "./users-manager.js";

export default async function EventUsersPage() {
  const admin = await requireEventUser(null);
  if (admin.role !== "SUPER_ADMIN") redirect("/events-management");
  const users = await prisma.eventUser.findMany({
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return <><h2 className="text-3xl font-black">Events Users</h2><p className="mt-1 text-slate-500">Independent credentials for this module only.</p><EventUsersManager initialUsers={users} currentId={admin.id} /></>;
}
