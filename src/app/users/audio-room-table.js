"use client";

import { useMemo, useState } from "react";
import { controlAudioRoom } from "../database-actions";
import DurationPicker from "../components/duration-picker";
import usePortalData from "../hooks/use-portal-data";

const roomPresets = [
  ["60", "1 hour"],
  ["360", "6 hours"],
  ["1440", "24 hours"],
  ["10080", "7 days"],
  ["43200", "30 days"],
];
const timedActions = new Set(["DISABLE_JOINING", "BLOCK", "TERMINATE"]);

export default function AudioRoomTable({ initialRooms }) {
  const [rooms, setRooms] = usePortalData(initialRooms);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const filtered = useMemo(
    () =>
      rooms.filter((room) =>
        `${room.roomId} ${room.title} ${room.ownerId} ${room.owner} ${room.status}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [rooms, query],
  );

  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const durationMinutes = timedActions.has(selected.action)
      ? Number(form.get("durationMinutes"))
      : null;
    const result = await controlAudioRoom(
      selected.room.roomId,
      selected.action,
      String(form.get("reason")),
      durationMinutes,
    );
    setRooms((current) =>
      current.map((room) =>
        room.roomId === selected.room.roomId
          ? applyAction(room, selected.action, result)
          : room,
      ),
    );
    setSelected(null);
  }

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#e5ecea] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold">Audio Room Records</h3>
            <p className="mt-1 text-xs text-[#748782]">
              Persistent rooms and their current access restrictions.
            </p>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 w-full rounded-lg border border-[#dce6e4] bg-[#fafcfc] px-3.5 text-xs outline-none focus:border-[#2ca89c] sm:max-w-xs"
            placeholder="Search room, owner or status..."
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left">
            <thead>
              <tr className="bg-[#f8fbfa] text-[10px] tracking-wider text-[#748883] uppercase">
                <th className="px-5 py-3.5">Room</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Participants</th>
                <th>Started</th>
                {/* Audio recording column is intentionally hidden until the feature is enabled again. <th>Audio recording</th> */}
                <th>Joining</th>
                <th className="px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f1]">
              {filtered.map((room) => (
                <RoomRow key={room.roomId} room={room} onAction={setSelected} />
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <div className="py-16 text-center text-sm text-[#788b87]">
              No audio room records match your search.
            </div>
          )}
        </div>
        <div className="border-t border-[#e8efed] px-5 py-4 text-[10px] text-[#849691]">
          Showing {filtered.length} of {rooms.length} rooms
        </div>
      </section>
      {selected && (
        <ActionModal
          selection={selected}
          onClose={() => setSelected(null)}
          onSubmit={submit}
        />
      )}
    </>
  );
}

function RoomRow({ room, onAction }) {
  const joiningAction = room.joiningDisabled
    ? ["ENABLE_JOINING", "Enable joining", "emerald"]
    : ["DISABLE_JOINING", "Disable joining", "amber"];
  const blockAction = room.isBlocked
    ? ["UNBLOCK", "Unblock room", "emerald"]
    : ["BLOCK", "Block room", "red"];
  const terminateAction =
    room.status === "TERMINATED"
      ? ["RESTORE", "Restore room", "emerald"]
      : ["TERMINATE", "Terminate room", "red"];
  return (
    <tr className="text-xs hover:bg-[#f9fcfb]">
      <td className="px-5 py-4">
        <p className="font-bold">{room.title}</p>
        <code className="mt-1 block text-[9px] text-[#087f74]">
          {room.roomId}
        </code>
      </td>
      <td>
        <p className="font-semibold">{room.owner}</p>
        <p className="text-[9px] text-[#849590]">{room.ownerId}</p>
      </td>
      <td>
        <Status room={room} />
      </td>
      <td>{room.participantCount}</td>
      <td className="text-[#60736f]">{room.startedAt}</td>
      {/* Audio recording UI is intentionally hidden until the feature is enabled again. <td><button type="button">Audio recording</button></td> */}
      <td>
        <span
          className={`rounded-full px-2 py-1 text-[9px] font-bold ${room.joiningDisabled ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
        >
          {room.joiningDisabled ? "Owner only" : "Everyone allowed"}
        </span>
        {room.joiningDisabledUntil && (
          <p className="mt-1 text-[9px] text-[#849590]">
            Until {new Date(room.joiningDisabledUntil).toLocaleString()}
          </p>
        )}
      </td>
      <td className="px-5 text-right">
        <div className="flex justify-end gap-1.5">
          <RoomButton config={joiningAction} room={room} onAction={onAction} />
          <RoomButton
            config={blockAction}
            room={room}
            onAction={onAction}
            disabled={room.status === "TERMINATED"}
          />
          <RoomButton
            config={terminateAction}
            room={room}
            onAction={onAction}
            disabled={room.isBlocked}
          />
          {/* Permanent deletion is intentionally hidden until the feature is enabled again. <button type="button">Delete permanently</button> */}
        </div>
      </td>
    </tr>
  );
}

function Status({ room }) {
  const restricted = room.isBlocked || room.status === "TERMINATED";
  const until = room.isBlocked
    ? room.blockedUntil
    : room.status === "TERMINATED"
      ? room.terminatedUntil
      : null;
  return (
    <div>
      <span
        className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${room.status === "LIVE" ? "bg-emerald-50 text-emerald-700" : restricted ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700"}`}
      >
        {room.status}
      </span>
      {until && (
        <p className="mt-1 text-[9px] text-[#849590]">
          Until {new Date(until).toLocaleString()}
        </p>
      )}
    </div>
  );
}
function RoomButton({ config, room, onAction, disabled }) {
  const [action, label, tone] = config;
  const colors =
    tone === "emerald"
      ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
      : tone === "amber"
        ? "border-amber-200 text-amber-700 hover:bg-amber-50"
        : "border-red-200 text-red-600 hover:bg-red-50";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onAction({ room, action, label, tone })}
      className={`rounded-lg border px-2.5 py-2 text-[9px] font-bold disabled:cursor-not-allowed disabled:opacity-35 ${colors}`}
    >
      {label}
    </button>
  );
}

function ActionModal({ selection, onClose, onSubmit }) {
  const timed = timedActions.has(selection.action);
  const isRelease = ["ENABLE_JOINING", "UNBLOCK", "RESTORE"].includes(
    selection.action,
  );
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#061c1a]/60 p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[470px] rounded-2xl bg-white shadow-2xl">
        <div className="flex justify-between border-b border-[#e5ecea] px-6 py-5">
          <div>
            <h2 className="text-lg font-bold">{selection.label}</h2>
            <p className="mt-1 text-xs text-[#748782]">
              {selection.room.title} · {selection.room.roomId}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-xl">
            ×
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-6">
          {timed && (
            <DurationPicker
              name="durationMinutes"
              label={`${selection.label} time period`}
              defaultMinutes={1440}
              presets={roomPresets}
            />
          )}
          <label
            className={`${timed ? "mt-5 " : ""}mb-2 block text-xs font-bold`}
            htmlFor="room-action-reason"
          >
            Administrative reason
          </label>
          <textarea
            id="room-action-reason"
            name="reason"
            required
            rows="3"
            className="w-full resize-none rounded-lg border border-[#dce6e4] p-3 text-xs"
            placeholder="Explain why this action is required..."
          />
          {isRelease && (
            <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">
              This immediately removes the current restriction.
            </p>
          )}
          <div className="mt-6 flex justify-end gap-2 border-t border-[#e8efed] pt-5">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg border px-4 text-xs font-bold"
            >
              Cancel
            </button>
            <button
              className={`h-10 rounded-lg px-5 text-xs font-bold text-white ${isRelease ? "bg-emerald-600" : "bg-red-600"}`}
            >
              {selection.label}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function applyAction(room, action, result) {
  if (action === "DISABLE_JOINING")
    return {
      ...room,
      joiningDisabled: true,
      joiningDisabledUntil: result.expiresAt,
    };
  if (action === "ENABLE_JOINING")
    return { ...room, joiningDisabled: false, joiningDisabledUntil: null };
  if (action === "BLOCK")
    return {
      ...room,
      isBlocked: true,
      status: "BLOCKED",
      blockedUntil: result.expiresAt,
      terminatedUntil: null,
    };
  if (action === "UNBLOCK")
    return { ...room, isBlocked: false, status: "IDLE", blockedUntil: null };
  if (action === "TERMINATE")
    return {
      ...room,
      isBlocked: false,
      status: "TERMINATED",
      terminatedUntil: result.expiresAt,
      blockedUntil: null,
    };
  if (action === "RESTORE")
    return { ...room, status: "IDLE", terminatedUntil: null };
  return room;
}
