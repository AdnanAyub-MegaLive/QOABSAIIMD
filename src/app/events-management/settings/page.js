import { redirect } from "next/navigation";
import { requireEventUser } from "../../../lib/events/auth.js";
import { getEventConfig } from "../../../lib/events/config.js";

export default async function EventsSettingsPage() {
  const user = await requireEventUser(null);
  if (user.role !== "SUPER_ADMIN") redirect("/events-management");
  const config = getEventConfig();
  const values = [
    ["Storage directory", config.storageRoot],
    ["Access token lifetime", `${config.accessMinutes} minutes`],
    ["Refresh token lifetime", `${config.refreshDays} days`],
    ["Maximum upload size", `${Math.round(config.maxUploadBytes / 1048576)} MB`],
    ["Maximum extracted size", `${Math.round(config.maxExtractedBytes / 1048576)} MB`],
    ["Maximum files per event", config.maxFiles.toLocaleString()],
    ["Unpublished response", process.env.EVENTS_UNPUBLISHED_MODE === "maintenance" ? "Maintenance page (503)" : "Not Found (404)"],
  ];
  return <><h2 className="text-3xl font-black">Events Settings</h2><p className="mt-1 text-slate-500">Read-only production configuration. Change values through environment variables.</p><section className="mt-7 max-w-3xl divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">{values.map(([label,value]) => <div key={label} className="flex items-center justify-between gap-5 py-4 first:pt-0 last:pb-0"><p className="font-semibold text-slate-500">{label}</p><p className="text-right font-bold">{value}</p></div>)}</section></>;
}
