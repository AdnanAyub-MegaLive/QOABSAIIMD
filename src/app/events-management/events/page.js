import { requireEventUser } from "../../../lib/events/auth.js";
import { listEvents } from "../../../lib/events/service.js";
import EventTable from "../_components/event-table.js";

export default async function EventsPage() {
  const [user, events] = await Promise.all([requireEventUser(null), listEvents()]);
  return <><h2 className="text-3xl font-black">Events</h2><p className="mt-1 text-slate-500">Search, publish, version, roll back, or remove hosted experiences.</p><EventTable initialEvents={events} superAdmin={user.role === "SUPER_ADMIN"} /></>;
}
