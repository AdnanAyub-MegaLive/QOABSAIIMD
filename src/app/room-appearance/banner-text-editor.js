"use client";
import { useState } from "react";
export default function BannerTextEditor({ banner, busy, save }) {
  const [name, setName] = useState(banner.name || ""), [description, setDescription] = useState(banner.description || "");
  if (banner.status !== "PENDING") return <div><p className="font-semibold">{banner.name}</p><p className="whitespace-pre-wrap break-words text-sm">{banner.description}</p></div>;
  const words = description.trim() ? description.trim().split(/\s+/u).length : 0;
  return <div className="space-y-2">
    <label className="block text-sm">Banner name<input className="block w-full rounded border p-2" value={name} onChange={e => setName(e.target.value)}/></label>
    <label className="block text-sm">Description<textarea className="block w-full rounded border p-2" rows={4} value={description} onChange={e => setDescription(e.target.value)}/></label>
    <p className="text-xs">{words} / 200 words · {[...description].length} / 2,000 characters</p>
    <p className="text-xs">No links. Admin may leave either field blank. Save changes before approving.</p>
    <button type="button" disabled={busy} className="rounded border px-3 py-2 text-sm" onClick={() => save({ action: "EDIT_TEXT", bannerId: banner.id, roomId: banner.room.roomId, name, description })}>Save reviewed text</button>
  </div>;
}
