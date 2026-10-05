"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateAgency() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const inputClass = "mt-1 w-full rounded-lg border border-[#c9ddd8] px-3 py-2 text-sm";
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/admin/agencies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Unable to create agency.");
      setSuccess(`Created ${result.data.agency.name} (${result.data.agency.id}).`);
      setOpen(false);
      router.refresh();
    } catch (exception) { setError(exception.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="mb-6">
      <button onClick={() => { setOpen(true); setError(""); setSuccess(""); }} className="rounded-lg bg-[#087f74] px-4 py-2.5 text-sm font-semibold text-white">Create agency</button>
      {success && <p role="status" className="mt-2 text-sm text-[#087f74]">{success}</p>}
      {open && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
        <section role="dialog" aria-modal="true" aria-labelledby="create-agency-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <h2 id="create-agency-title" className="text-lg font-bold">Create agency</h2>
          <p className="mt-2 text-sm text-[#71847f]">Grant an agency to an active user. The owner must not already own or belong to an agency or have a pending application.</p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="block text-sm font-semibold">Agency name<input autoFocus name="agencyName" required maxLength={120} className={inputClass} /></label>
            <label className="block text-sm font-semibold">Owner user ID<input name="ownerPublicId" required maxLength={50} placeholder="USR-123456" className={inputClass} /></label>
            <label className="block text-sm font-semibold">BD/Admin reference ID<input name="bdCode" required maxLength={50} placeholder="Eligible reference in the owner's country" className={inputClass} /></label>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button disabled={busy} className="rounded-lg bg-[#087f74] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Creating…" : "Create agency"}</button>
            </div>
          </form>
        </section>
      </div>}
    </div>
  );
}
