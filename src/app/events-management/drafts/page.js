import { requireEventUser } from "../../../lib/events/auth.js";
import { listEvents } from "../../../lib/events/service.js";
import EventTable from "../_components/event-table.js";

export default async function DraftEventsPage() {
  const [user, events] = await Promise.all([requireEventUser(null), listEvents({ status: "DRAFT" })]);
  return <><h2 className="text-3xl font-black">Draft Events</h2><p className="mt-1 text-slate-500">Validated uploads that are not publicly available.</p><EventTable initialEvents={events} fixedStatus="DRAFT" superAdmin={user.role === "SUPER_ADMIN"} /></>;
}
