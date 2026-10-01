import { requireEventUser } from "../../../lib/events/auth.js";
import { listEvents } from "../../../lib/events/service.js";
import EventTable from "../_components/event-table.js";

export default async function PublishedEventsPage() {
  const [user, events] = await Promise.all([requireEventUser(null), listEvents({ status: "PUBLISHED" })]);
  return <><h2 className="text-3xl font-black">Published Events</h2><p className="mt-1 text-slate-500">Publicly accessible experiences.</p><EventTable initialEvents={events} fixedStatus="PUBLISHED" superAdmin={user.role === "SUPER_ADMIN"} /></>;
}
