"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const csrf = () => decodeURIComponent(document.cookie.split("; ").find((part) => part.startsWith("streamline_events_csrf="))?.split("=")[1] || "");

export default function EventUploadForm({ event }) {
  const router = useRouter();
  const folder = useRef(null);
  const [mode, setMode] = useState("archive");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    folder.current?.setAttribute("webkitdirectory", "");
    folder.current?.setAttribute("directory", "");
  }, [mode]);

  async function submit(submitEvent) {
    submitEvent.preventDefault();
    setBusy(true);
    setError("");
    const raw = new FormData(submitEvent.currentTarget);
    const payload = new FormData();
    if (!event) {
      payload.set("name", raw.get("name"));
      payload.set("slug", raw.get("slug"));
    }
    if (mode === "archive") {
      const archive = raw.get("archive");
      if (!archive?.size) { setBusy(false); return setError("Select a ZIP or RAR archive."); }
      payload.set("archive", archive);
    } else {
      const files = [...(folder.current?.files || [])];
      if (!files.length) { setBusy(false); return setError("Select a folder containing index.html."); }
      for (const file of files) {
        payload.append("files", file, file.name);
        payload.append("paths", file.webkitRelativePath || file.name);
      }
    }
    const response = await fetch(event ? `/api/events/${event.id}/upload` : "/api/events", {
      method: "POST",
      headers: { "x-events-csrf": csrf() },
      body: payload,
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setError(result.error?.message || "Upload failed.");
    router.push("/events-management/events");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-7 max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
      {!event && <div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-bold">Event name<input name="name" required minLength={2} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#0c796b]" placeholder="Summer Sale" /></label><label className="text-sm font-bold">Public slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#0c796b]" placeholder="summer-sale" /></label></div>}
      {event && <div className="rounded-xl bg-emerald-50 p-4"><p className="font-bold text-emerald-900">{event.name}</p><p className="text-sm text-emerald-700">/{event.slug} · Current latest version {event.latestVersion}</p></div>}
      <fieldset className="mt-6"><legend className="text-sm font-bold">Upload method</legend><div className="mt-3 flex gap-3"><button type="button" onClick={() => setMode("archive")} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${mode === "archive" ? "bg-[#0c796b] text-white" : "bg-slate-100"}`}>ZIP / RAR archive</button><button type="button" onClick={() => setMode("folder")} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${mode === "folder" ? "bg-[#0c796b] text-white" : "bg-slate-100"}`}>Entire folder</button></div></fieldset>
      <div className="mt-5 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
        {mode === "archive" ? <input name="archive" type="file" accept=".zip,.rar" className="mx-auto block max-w-full text-sm" /> : <input ref={folder} type="file" multiple className="mx-auto block max-w-full text-sm" />}
        <p className="mt-3 text-xs text-slate-500">Root index.html is required. Executables and unsafe paths are rejected.</p>
      </div>
      {error && <p className="mt-5 rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p>}
      <button disabled={busy} className="mt-6 rounded-xl bg-[#0c796b] px-6 py-3 font-bold text-white disabled:opacity-50">{busy ? "Validating and storing…" : event ? "Upload new version" : "Create draft event"}</button>
    </form>
  );
}
