"use client";
import { useState } from "react";
import { PermissionButton } from "../components/portal-access";

export function RoomAdminAssignment({ room, onSaved }) {
  const [publicId, setPublicId] = useState("");
  const id = publicId.trim();
  return <div className="mt-4 rounded-xl border p-3">
    <label className="block text-sm font-semibold">Assign by user ID<input aria-label="Room admin user ID" value={publicId} maxLength={100} onChange={e => setPublicId(e.target.value)} placeholder="USR-… or TLN-…" className="mt-2 block w-full rounded border p-2 font-normal" /></label>
    {id && <MemberControls key={`${room.roomId}:${id}`} room={room} user={{ publicId: id, name: id }} roleOnly onSaved={onSaved} />}
  </div>;
}

export default function MemberControls({ room, user, seat, roleOnly = false, onSaved }) {
  const [action, setAction] = useState("");
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("60");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (user.publicId === room.owner.publicId) return <p className="mt-2 text-xs text-slate-500">Room owner · protected</p>;
  const labels = { FORCE_MUTE: "Force mute", ALLOW_MIC: "Allow microphone", SEAT_KICK: "Remove from seat", KICK: "Kick from room", BAN: "Ban from room", GRANT_ADMIN: "Make room admin", REVOKE_ADMIN: "Remove room admin" };
  const isAdmin = room.roles.some(r => r.user.publicId === user.publicId);
  const actions = roleOnly ? [isAdmin ? "REVOKE_ADMIN" : "GRANT_ADMIN"] : [...(seat ? [seat.isForceMuted ? "ALLOW_MIC" : "FORCE_MUTE", "SEAT_KICK"] : []), "KICK", "BAN"];
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/room-management/controls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId: room.roomId, publicId: user.publicId, seatId: seat?.seatId, action, reason, durationMinutes: Number(duration) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to update member.");
      setAction(""); setReason("");
      setMessage(body.data.warnings?.join(" ") || "Saved.");
      await onSaved();
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  return <div className="mt-2 space-y-2">
    <div className="flex flex-wrap gap-2">{actions.map(value => <PermissionButton key={value} permission="rooms.manage" disabled={busy} onClick={() => { setAction(value); setMessage(""); }} className="rounded-lg border px-2 py-1 text-xs">{labels[value]}</PermissionButton>)}</div>
    {action && <form onSubmit={submit} className="space-y-2 rounded-lg border bg-white p-3 text-xs">
      <p className="font-semibold">{labels[action]}: {user.name} ({user.publicId})?</p>
      {action === "ALLOW_MIC" && <p>The user stays muted until they choose to turn their microphone on.</p>}
      <label className="block">Reason<input required maxLength={300} value={reason} onChange={e => setReason(e.target.value)} className="mt-1 block w-full rounded border p-2" /></label>
      {action === "BAN" && <label className="block">Ban duration<select className="ml-2 rounded border p-1" value={duration} onChange={e => setDuration(e.target.value)}><option value="60">1 hour</option><option value="1440">24 hours</option><option value="10080">7 days</option><option value="0">Permanent</option></select></label>}
      <PermissionButton permission="rooms.manage" type="submit" disabled={busy || !reason.trim()} className="rounded bg-[#183f3b] px-3 py-2 text-white">{busy ? "Saving…" : "Confirm"}</PermissionButton>
      <button type="button" disabled={busy} onClick={() => setAction("")} className="ml-2 p-2">Cancel</button>
    </form>}
    {message && <p role="status" className="text-xs text-amber-800">{message}</p>}
  </div>;
}
