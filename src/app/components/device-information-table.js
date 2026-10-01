"use client";

import { useState } from "react";
import { createBan } from "../database-actions";
import usePortalData from "../hooks/use-portal-data";
import { formatDurationMinutes as formatMinutes } from "../utils/duration";

export default function DeviceInformationTable({
  title = "Device Information",
  records = [],
}) {
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [bannedDevices, setBannedDevices] = usePortalData(
    records
      .filter((record) => record.isDeviceBanned)
      .map((record) => record.mac),
  );
  const [userIdQuery, setUserIdQuery] = useState("");
  const filteredRecords = records.filter((record) =>
    record.userId.toLowerCase().includes(userIdQuery.trim().toLowerCase()),
  );

  async function handleBan(event) {
    event.preventDefault();
    if (!selectedDevice) return;
    const form = new FormData(event.currentTarget);
    const duration = form.get("duration");
    await createBan({
      publicId: selectedDevice.userId,
      target: "DEVICE",
      macAddress: selectedDevice.mac,
      reason: String(form.get("reason")),
      durationMinutes:
        duration === "custom"
          ? Number(form.get("customMinutes"))
          : Number(duration),
      permanent: duration === "permanent",
      proofImage: form.get("proof")?.name,
    });
    setBannedDevices((current) => [...current, selectedDevice.mac]);
    setSelectedDevice(null);
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white shadow-[0_8px_30px_rgba(15,65,60,.04)]">
        <div className="flex flex-col gap-4 border-b border-[#e5ecea] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#142c2a]">{title}</h3>
            <p className="mt-1 text-xs text-[#7a8d88]">
              Latest device and login information received from the application.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <svg
                className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 fill-none stroke-[#80938f] stroke-2"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
              <input
                value={userIdQuery}
                onChange={(event) => setUserIdQuery(event.target.value)}
                className="h-10 w-full rounded-lg border border-[#dce6e4] bg-[#fafcfc] pr-3 pl-9 text-xs outline-none placeholder:text-[#9aa9a6] focus:border-[#2ca89c] focus:ring-3 focus:ring-[#2ca89c]/10 sm:w-56"
                placeholder="Search by User ID..."
                aria-label="Search device records by user ID"
              />
            </div>
            <span className="w-fit rounded-full bg-[#e7f5f2] px-2.5 py-1 text-[9px] font-bold tracking-wider text-[#087f74] uppercase">
              JSON data preview
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-330 border-collapse text-left">
            <thead>
              <tr className="bg-[#f8fbfa] text-[10px] font-bold tracking-[.07em] text-[#748883] uppercase">
                <th className="px-5 py-3.5">User ID</th>
                <th className="py-3.5">User Name</th>
                <th className="py-3.5">Last Login IP</th>
                <th className="py-3.5">Last Login MAC Address</th>
                <th className="py-3.5">Last Login Location</th>
                <th className="py-3.5">Last Login Time</th>
                <th className="py-3.5">Device Status</th>
                <th className="px-5 py-3.5 text-right">Ban Device</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f1]">
              {filteredRecords.map((record) => (
                <tr
                  key={`${record.userId}-${record.mac}`}
                  className="transition hover:bg-[#f9fcfb]"
                >
                  <td className="px-5 py-4 text-xs font-bold text-[#087f74]">
                    {record.userId}
                  </td>
                  <td className="py-4 text-xs font-semibold text-[#263e3a]">
                    {record.userName}
                  </td>
                  <td className="py-4">
                    <code className="rounded-md bg-[#f0f5f4] px-2 py-1 text-[11px] text-[#526a65]">
                      {record.ip}
                    </code>
                  </td>
                  <td className="py-4">
                    <code className="rounded-md bg-[#f0f5f4] px-2 py-1 text-[11px] text-[#526a65]">
                      {record.mac}
                    </code>
                  </td>
                  <td className="py-4">
                    <span className="flex items-center gap-2 text-xs text-[#5c716c]">
                      <svg
                        className="h-4 w-4 shrink-0 fill-none stroke-[#2d948a] stroke-[1.8]"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
                        <circle cx="12" cy="10" r="2.5" />
                      </svg>
                      {record.location}
                    </span>
                  </td>
                  <td className="py-4">
                    <div className="flex items-center gap-2 text-xs text-[#526a65]">
                      <svg
                        className="h-4 w-4 shrink-0 fill-none stroke-[#2d948a] stroke-[1.8]"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="8" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                      <span>{record.loginTime ?? "Never"}</span>
                    </div>
                  </td>
                  <td className="py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${bannedDevices.includes(record.mac) ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
                    >
                      {bannedDevices.includes(record.mac) ? "Banned" : "Active"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => setSelectedDevice(record)}
                      disabled={bannedDevices.includes(record.mac)}
                      className="rounded-lg border border-red-200 bg-white px-3 py-2 text-[10px] font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-[#dce6e4] disabled:bg-[#f3f6f5] disabled:text-[#8fa09c]"
                    >
                      {bannedDevices.includes(record.mac)
                        ? "Manage in Blocked tab"
                        : "Ban device"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredRecords.length && (
            <div className="py-16 text-center text-sm text-[#788b87]">
              No device records match this User ID.
            </div>
          )}
        </div>
        <div className="border-t border-[#e8efed] px-5 py-4 text-[10px] text-[#849691]">
          Showing {filteredRecords.length} of {records.length} device records
        </div>
      </div>
      {selectedDevice && (
        <BanDeviceModal
          device={selectedDevice}
          onClose={() => setSelectedDevice(null)}
          onBan={handleBan}
        />
      )}
    </>
  );
}

export function BanUserModal({ user, onClose, onBan }) {
  const [duration, setDuration] = useState("");
  const [customMinutes, setCustomMinutes] = useState("");
  const minutes =
    duration === "custom" ? Number(customMinutes) : Number(duration);
  const durationLabel =
    duration === "permanent" ? "Permanent ban" : formatMinutes(minutes);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#061c1a]/60 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ban-user-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="my-auto w-full max-w-125 rounded-2xl bg-white shadow-[0_24px_80px_rgba(0,0,0,.25)]">
        <div className="flex items-start justify-between border-b border-[#e5ecea] px-6 py-5">
          <div>
            <div className="mb-2 grid h-9 w-9 place-items-center rounded-full bg-amber-50 text-amber-700">
              <svg
                className="h-5 w-5 fill-none stroke-current stroke-[1.8]"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c.8-5 3.4-7 8-7s7.2 2 8 7M5 5l14 14" />
              </svg>
            </div>
            <h2
              id="ban-user-title"
              className="text-lg font-bold text-[#172f2b]"
            >
              Ban user login?
            </h2>
            <p className="mt-1 text-xs text-[#748782]">
              {user.userName} · {user.userId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-xl text-[#7c8f8a] hover:bg-[#f0f5f4]"
            aria-label="Close ban user modal"
          >
            ×
          </button>
        </div>
        <form onSubmit={onBan} className="p-6">
          <label
            className="mb-2 block text-xs font-bold text-[#29423d]"
            htmlFor="user-ban-reason"
          >
            Reason to ban
          </label>
          <textarea
            id="user-ban-reason"
            name="reason"
            required
            rows="3"
            placeholder="Explain why this user should be blocked from logging in..."
            className="w-full resize-none rounded-lg border border-[#dce6e4] px-3.5 py-3 text-xs outline-none placeholder:text-[#9ba9a6] focus:border-amber-400 focus:ring-3 focus:ring-amber-100"
          />
          <label
            className="mt-5 mb-2 block text-xs font-bold text-[#29423d]"
            htmlFor="user-ban-duration"
          >
            Ban period
          </label>
          <select
            id="user-ban-duration"
            name="duration"
            required
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            className="h-11 w-full rounded-lg border border-[#dce6e4] bg-white px-3.5 text-xs text-[#526863] outline-none focus:border-amber-400 focus:ring-3 focus:ring-amber-100"
          >
            <option value="" disabled>
              Select ban period
            </option>
            <option value="60">1 hour</option>
            <option value="1440">24 hours</option>
            <option value="10080">7 days</option>
            <option value="43200">30 days</option>
            <option value="129600">90 days</option>
            <option value="custom">Custom time in minutes</option>
            <option value="permanent">Permanent</option>
          </select>
          {duration === "custom" && (
            <div className="mt-3">
              <label
                className="mb-2 block text-xs font-bold text-[#29423d]"
                htmlFor="custom-ban-minutes"
              >
                Custom duration in minutes
              </label>
              <input
                id="custom-ban-minutes"
                name="customMinutes"
                type="number"
                min="1"
                step="1"
                required
                value={customMinutes}
                onChange={(event) => setCustomMinutes(event.target.value)}
                placeholder="For example: 120"
                className="h-11 w-full rounded-lg border border-[#dce6e4] px-3.5 text-xs outline-none focus:border-amber-400 focus:ring-3 focus:ring-amber-100"
              />
            </div>
          )}
          {duration && (duration === "permanent" || minutes > 0) && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-800">
              <strong>Calculated period:</strong> {durationLabel}
              {duration !== "permanent" && (
                <span className="ml-1 text-amber-700">
                  ({minutes.toLocaleString()} minutes)
                </span>
              )}
            </div>
          )}
          <label
            className="mt-5 mb-2 block text-xs font-bold text-[#29423d]"
            htmlFor="user-banned-by"
          >
            Ban by
          </label>
          <input
            id="user-banned-by"
            name="bannedBy"
            required
            placeholder="Enter your admin name"
            className="h-11 w-full rounded-lg border border-[#dce6e4] px-3.5 text-xs outline-none placeholder:text-[#9ba9a6] focus:border-amber-400 focus:ring-3 focus:ring-amber-100"
          />
          <label
            className="mt-5 mb-2 block text-xs font-bold text-[#29423d]"
            htmlFor="user-ban-proof"
          >
            Proof of ban{" "}
            <span className="font-normal text-[#879894]">(optional)</span>
          </label>
          <label
            htmlFor="user-ban-proof"
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[#cbdad7] bg-[#f9fbfb] px-4 py-3.5 hover:border-[#8eb9b3]"
          >
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#e6f3f1] text-[#28877e]">
              ↑
            </span>
            <span>
              <strong className="block text-xs text-[#3f5752]">
                Attach proof image
              </strong>
              <span className="text-[10px] text-[#879894]">
                PNG, JPG or WEBP
              </span>
            </span>
            <input
              id="user-ban-proof"
              name="proof"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
            />
          </label>
          <div className="mt-6 flex justify-end gap-2 border-t border-[#e8efed] pt-5">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg border border-[#d7e3e0] px-4 text-xs font-bold text-[#5d716c] hover:bg-[#f5f8f7]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-10 rounded-lg bg-amber-600 px-5 text-xs font-bold text-white hover:bg-amber-700"
            >
              Ban user
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function SecurityActionModal({
  title,
  description,
  confirm,
  tone,
  onClose,
  onSubmit,
}) {
  const buttonClass =
    tone === "emerald"
      ? "bg-emerald-600 hover:bg-emerald-700"
      : "bg-sky-600 hover:bg-sky-700";
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#061c1a]/60 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-115 rounded-2xl bg-white shadow-[0_24px_80px_rgba(0,0,0,.25)]">
        <div className="flex items-start justify-between border-b border-[#e5ecea] px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-[#172f2b]">{title}</h2>
            <p className="mt-1 text-xs text-[#748782]">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-xl text-[#7c8f8a] hover:bg-[#f0f5f4]"
            aria-label="Close modal"
          >
            ×
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-6">
          <label
            className="mb-2 block text-xs font-bold text-[#29423d]"
            htmlFor={`${tone}-action-reason`}
          >
            Reason
          </label>
          <textarea
            id={`${tone}-action-reason`}
            name="reason"
            required
            rows="3"
            placeholder="Explain why this action is required..."
            className="w-full resize-none rounded-lg border border-[#dce6e4] px-3.5 py-3 text-xs outline-none focus:border-[#2ca89c]"
          />
          <div className="mt-6 flex justify-end gap-2 border-t border-[#e8efed] pt-5">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg border border-[#d7e3e0] px-4 text-xs font-bold text-[#5d716c]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`h-10 rounded-lg px-5 text-xs font-bold text-white ${buttonClass}`}
            >
              {confirm}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BanDeviceModal({ device, onClose, onBan }) {
  const [duration, setDuration] = useState("");
  const [customMinutes, setCustomMinutes] = useState("");
  const minutes =
    duration === "custom" ? Number(customMinutes) : Number(duration);
  const durationLabel =
    duration === "permanent" ? "Permanent ban" : formatMinutes(minutes);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#061c1a]/60 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ban-device-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-120 rounded-2xl bg-white shadow-[0_24px_80px_rgba(0,0,0,.25)]">
        <div className="flex items-start justify-between border-b border-[#e5ecea] px-6 py-5">
          <div>
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-600">
              <svg
                className="h-5 w-5 fill-none stroke-current stroke-[1.8]"
                viewBox="0 0 24 24"
              >
                <path d="M12 3 5 6v5c0 4.6 2.9 8.3 7 10 4.1-1.7 7-5.4 7-10V6l-7-3Z" />
                <path d="m9 9 6 6m0-6-6 6" />
              </svg>
            </div>
            <h2
              id="ban-device-title"
              className="text-lg font-bold text-[#172f2b]"
            >
              Ban this device?
            </h2>
            <p className="mt-1 text-xs text-[#748782]">
              {device.userName} · {device.mac}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-xl text-[#7c8f8a] hover:bg-[#f0f5f4]"
            aria-label="Close ban device modal"
          >
            ×
          </button>
        </div>
        <form onSubmit={onBan} className="p-6">
          <label
            className="mb-2 block text-xs font-bold text-[#29423d]"
            htmlFor="ban-reason"
          >
            Reason to ban
          </label>
          <textarea
            id="ban-reason"
            name="reason"
            required
            rows="3"
            placeholder="Describe why this device should be banned..."
            className="w-full resize-none rounded-lg border border-[#dce6e4] px-3.5 py-3 text-xs outline-none placeholder:text-[#9ba9a6] focus:border-red-400 focus:ring-3 focus:ring-red-100"
          />
          <label
            className="mt-5 mb-2 block text-xs font-bold text-[#29423d]"
            htmlFor="ban-duration"
          >
            Duration to ban
          </label>
          <select
            id="ban-duration"
            name="duration"
            required
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            className="h-11 w-full rounded-lg border border-[#dce6e4] bg-white px-3.5 text-xs text-[#526863] outline-none focus:border-red-400 focus:ring-3 focus:ring-red-100"
          >
            <option value="" disabled>
              Select ban duration
            </option>
            <option value="60">1 hour</option>
            <option value="1440">24 hours</option>
            <option value="10080">7 days</option>
            <option value="43200">30 days</option>
            <option value="129600">90 days</option>
            <option value="custom">Custom time in minutes</option>
            <option value="permanent">Permanent</option>
          </select>
          {duration === "custom" && (
            <div className="mt-3">
              <label
                className="mb-2 block text-xs font-bold text-[#29423d]"
                htmlFor="custom-device-ban-minutes"
              >
                Custom duration in minutes
              </label>
              <input
                id="custom-device-ban-minutes"
                name="customMinutes"
                type="number"
                min="1"
                step="1"
                required
                value={customMinutes}
                onChange={(event) => setCustomMinutes(event.target.value)}
                placeholder="For example: 120"
                className="h-11 w-full rounded-lg border border-[#dce6e4] px-3.5 text-xs outline-none focus:border-red-400 focus:ring-3 focus:ring-red-100"
              />
            </div>
          )}
          {duration && (duration === "permanent" || minutes > 0) && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-800">
              <strong>Calculated period:</strong> {durationLabel}
              {duration !== "permanent" && (
                <span className="ml-1 text-red-700">
                  ({minutes.toLocaleString()} minutes)
                </span>
              )}
            </div>
          )}
          <label
            className="mt-5 mb-2 block text-xs font-bold text-[#29423d]"
            htmlFor="banned-by"
          >
            Ban by
          </label>
          <input
            id="banned-by"
            name="bannedBy"
            required
            type="text"
            placeholder="Enter your admin name"
            className="h-11 w-full rounded-lg border border-[#dce6e4] px-3.5 text-xs outline-none placeholder:text-[#9ba9a6] focus:border-red-400 focus:ring-3 focus:ring-red-100"
          />
          <label
            className="mt-5 mb-2 block text-xs font-bold text-[#29423d]"
            htmlFor="ban-proof"
          >
            Proof of ban{" "}
            <span className="font-normal text-[#879894]">(optional)</span>
          </label>
          <label
            htmlFor="ban-proof"
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[#cbdad7] bg-[#f9fbfb] px-4 py-3.5 transition hover:border-[#8eb9b3] hover:bg-[#f4f9f8]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#e6f3f1] text-[#28877e]">
              <svg
                className="h-5 w-5 fill-none stroke-current stroke-[1.7]"
                viewBox="0 0 24 24"
              >
                <path d="M12 16V4m-4 4 4-4 4 4M5 14v5h14v-5" />
              </svg>
            </span>
            <span>
              <strong className="block text-xs text-[#3f5752]">
                Attach proof image
              </strong>
              <span className="mt-0.5 block text-[10px] text-[#879894]">
                PNG, JPG or WEBP image
              </span>
            </span>
            <input
              id="ban-proof"
              name="proof"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
            />
          </label>
          <div className="mt-6 flex justify-end gap-2 border-t border-[#e8efed] pt-5">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg border border-[#d7e3e0] px-4 text-xs font-bold text-[#5d716c] hover:bg-[#f5f8f7]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-10 rounded-lg bg-red-600 px-5 text-xs font-bold text-white shadow-[0_6px_16px_rgba(220,38,38,.2)] hover:bg-red-700"
            >
              Ban device
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
