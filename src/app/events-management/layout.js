import Link from "../components/intent-link";
import { redirect } from "next/navigation";
import { requireEventUser } from "../../lib/events/auth.js";
import EventsNavigation from "./_components/events-navigation.js";
import EventsSessionKeeper from "./_components/events-session-keeper.js";

// Authenticated studio data must be rendered per request, never at build time.
export const dynamic = "force-dynamic";

const links = [
  ["Dashboard", "/events-management", "▦"],
  ["Events", "/events-management/events", "◇"],
  ["Upload Event", "/events-management/events/upload", "↑"],
  ["Published Events", "/events-management/published", "●"],
  ["Draft Events", "/events-management/drafts", "○"],
  ["Users", "/events-management/users", "♙", true],
  ["Logs", "/events-management/logs", "≡", true],
  ["Settings", "/events-management/settings", "⚙", true],
];

export default async function EventsManagementLayout({ children }) {
  let user;
  try {
    user = await requireEventUser(null);
  } catch {
    redirect("/events-login");
  }
  return (
    <div className="portal-ui min-h-screen bg-[#f4f8f7] text-slate-900">
      <EventsSessionKeeper />
      <EventsNavigation links={links.filter(item => !item[3] || user.role === "SUPER_ADMIN").map(([label, href]) => [label, href])} user={{name:user.name, role:user.role}} />
      <div className="ops-events-workspace lg:pl-64">
        <header className="ops-events-header sticky top-0 z-20 flex min-h-20 flex-wrap gap-3 py-4 items-center justify-between border-b border-slate-200 bg-white/90 px-6 backdrop-blur md:px-10">
          <div><p className="text-xs font-bold uppercase tracking-widest text-[#0c796b]">Events Management</p><p className="text-sm text-slate-500">Web experiences for the Mega Live Portal in-app browser</p></div>
          <Link href="/events-management/events/upload" className="rounded-xl bg-[#0c796b] px-4 py-2.5 text-sm font-bold text-white">Upload event</Link>
        </header>
        <main id="portal-content" tabIndex={-1} className="ops-events-main mx-auto max-w-7xl p-6 md:p-10">{children}</main>
      </div>
    </div>
  );
}
