"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function EventsLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/events-auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setError(result.error?.message || "Unable to sign in.");
    const next = params.get("next");
    router.replace(next?.startsWith("/events-management") ? next : "/events-management");
    router.refresh();
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={submit}>
      <label className="block text-sm font-semibold">Email
        <input name="email" type="email" required autoComplete="username" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#0c796b] focus:ring-4 focus:ring-emerald-100" />
      </label>
      <label className="block text-sm font-semibold">Password
        <input name="password" type="password" minLength={8} required autoComplete="current-password" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#0c796b] focus:ring-4 focus:ring-emerald-100" />
      </label>
      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700">{error}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-[#0c796b] px-5 py-3.5 font-bold text-white transition hover:bg-[#095f54] disabled:opacity-60">{busy ? "Signing in…" : "Sign in to Events"}</button>
    </form>
  );
}
