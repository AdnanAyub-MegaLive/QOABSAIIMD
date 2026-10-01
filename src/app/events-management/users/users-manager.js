"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
const csrf = () => decodeURIComponent(document.cookie.split("; ").find((part) => part.startsWith("streamline_events_csrf="))?.split("=")[1] || "");

export default function EventUsersManager({ initialUsers, currentId }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  async function request(url, method, body) {
    setError("");
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json", "x-events-csrf": csrf() }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    if (!response.ok) { setError(result.error?.message || "Action failed."); return false; }
    router.refresh(); return true;
  }
  return <section className="mt-7 rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-center justify-between border-b border-slate-200 p-5"><p className="font-bold">{initialUsers.length} accounts</p><button onClick={() => setOpen(true)} className="rounded-xl bg-[#0c796b] px-4 py-2.5 text-sm font-bold text-white">Create Junior Admin</button></div>
    {error && <p className="bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700">{error}</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[750px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Name","Email","Role","Status","Created","Actions"].map((h) => <th key={h} className="px-5 py-4">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{initialUsers.map((user) => <tr key={user.id}><td className="px-5 py-4 font-bold">{user.name}</td><td className="px-5 py-4">{user.email}</td><td className="px-5 py-4">{user.role.replace("_"," ")}</td><td className="px-5 py-4">{user.active ? "Active" : "Disabled"}</td><td className="px-5 py-4">{new Date(user.createdAt).toLocaleDateString()}</td><td className="px-5 py-4"><div className="flex gap-2">{user.id !== currentId && <><button onClick={() => request(`/api/event-users/${user.id}`, "PUT", { active: !user.active })} className="rounded-lg border px-2.5 py-1.5 font-semibold">{user.active ? "Disable" : "Enable"}</button><button onClick={() => { const password = prompt("Enter a new password (minimum 8 characters)"); if (password) request(`/api/event-users/${user.id}`, "PUT", { password }); }} className="rounded-lg border px-2.5 py-1.5 font-semibold">Reset password</button><button onClick={() => confirm(`Delete ${user.name}?`) && request(`/api/event-users/${user.id}`, "DELETE")} className="rounded-lg border border-rose-200 px-2.5 py-1.5 font-semibold text-rose-700">Delete</button></>}</div></td></tr>)}</tbody></table></div>
    {open && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-5"><form onSubmit={async (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); if (await request("/api/event-users", "POST", { ...data, role: "JUNIOR_ADMIN" })) setOpen(false); }} className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl"><h3 className="text-xl font-black">Create Junior Admin</h3><div className="mt-5 space-y-4">{["name","email","password"].map((name) => <label key={name} className="block text-sm font-bold capitalize">{name}<input name={name} type={name === "password" ? "password" : name === "email" ? "email" : "text"} required minLength={name === "password" ? 8 : undefined} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label>)}</div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setOpen(false)} className="rounded-xl border px-4 py-2.5 font-bold">Cancel</button><button className="rounded-xl bg-[#0c796b] px-4 py-2.5 font-bold text-white">Create account</button></div></form></div>}
  </section>;
}
