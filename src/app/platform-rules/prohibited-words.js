"use client";
import { useState } from "react";

export default function ProhibitedWords({ initial, canManage }) {
  const [text, setText] = useState(initial.words.join("\n"));
  const [revision, setRevision] = useState(initial.revision);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(""); setSaved(false);
    try {
      const response = await fetch("/api/admin/prohibited-words", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ words: text.split(/\r?\n/).map(w => w.trim()).filter(Boolean), revision }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || "Unable to save prohibited words.");
      setText(result.data.words.join("\n")); setRevision(result.data.revision); setSaved(true);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <form onSubmit={save} className="rounded-2xl border border-[#dfe9e7] bg-white p-6">
    <h3 className="text-lg font-bold">Prohibited chat words</h3>
    <p className="mt-2 text-sm text-[#71847f]">Block words and phrases in room, world, group and personal messages, including edits. Existing messages are not deleted.</p>
    <label htmlFor="prohibited-words" className="mt-5 block text-sm font-semibold">Words or phrases — one per line</label>
    <textarea id="prohibited-words" value={text} onChange={e => { setText(e.target.value); setSaved(false); }} disabled={!canManage || busy} rows={12} maxLength={30000} className="mt-2 w-full rounded-xl border border-[#dfe9e7] p-4 text-sm focus:outline-[#16877d]" placeholder="Enter words to block" />
    <p className="mt-2 text-xs text-[#71847f]">Up to 500 entries, 100 characters each. Case-insensitive, whole-word/phrase matching. Clear all entries to stop blocking. Spelling variants must be added separately.</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {saved && <p role="status" className="mt-3 text-sm text-emerald-700">Saved. New messages now use this list.</p>}
    {canManage ? <button disabled={busy} className="mt-5 rounded-lg bg-[#087f74] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save prohibited words"}</button> : <p className="mt-4 text-sm text-[#71847f]">You have read-only access. Changing this list requires Rules management permission.</p>}
  </form>;
}
