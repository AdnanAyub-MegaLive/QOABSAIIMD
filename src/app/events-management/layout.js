import Link from "next/link";
import { redirect } from "next/navigation";
import { requireEventUser } from "../../lib/events/auth.js";
import EventsLogoutButton from "./_components/events-logout-button.js";
import EventsSessionKeeper from "./_components/events-session-keeper.js";

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
    <div className="min-h-screen bg-[#f4f8f7] text-slate-900">
      <EventsSessionKeeper />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#073f38] text-white lg:flex">
        <div className="border-b border-white/10 px-7 py-6">
          <p className="text-xs font-bold tracking-[.22em] text-emerald-300">STREAMLINE</p>
          <h1 className="mt-1 text-xl font-black">Events Studio</h1>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {links.filter((item) => !item[3] || user.role === "SUPER_ADMIN").map(([label, href, icon]) => (
            <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-emerald-50/80 hover:bg-white/10 hover:text-white">
              <span className="w-5 text-center text-emerald-300">{icon}</span>{label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 p-5">
          <p className="truncate font-bold">{user.name}</p>
          <p className="mt-0.5 text-xs text-emerald-200">{user.role.replace("_", " ")}</p>
          <EventsLogoutButton />
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-slate-200 bg-white/90 px-6 backdrop-blur md:px-10">
          <div><p className="text-xs font-bold uppercase tracking-widest text-[#0c796b]">Events Management</p><p className="text-sm text-slate-500">Web experiences for the Mega Live Portal in-app browser</p></div>
          <Link href="/events-management/events/upload" className="rounded-xl bg-[#0c796b] px-4 py-2.5 text-sm font-bold text-white">Upload event</Link>
        </header>
        <main className="mx-auto max-w-7xl p-6 md:p-10">{children}</main>
      </div>
    </div>
  );
}
