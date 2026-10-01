"use client";

import { useMemo, useState } from "react";
import {
  createBan,
  forceLogoutUser,
  unbanDevice,
  unbanUser,
} from "../database-actions";
import {
  BanUserModal,
  SecurityActionModal,
} from "../components/device-information-table";
import usePortalData from "../hooks/use-portal-data";

export default function BlockedUsersTable({ initialUsers, initialDevices }) {
  const [users, setUsers] = usePortalData(initialUsers);
  const [devices, setDevices] = usePortalData(
    initialDevices.filter((device) => device.isDeviceBanned),
  );
  const [query, setQuery] = useState("");
  const [banTarget, setBanTarget] = useState(null);
  const [unbanTarget, setUnbanTarget] = useState(null);
  const [logoutTarget, setLogoutTarget] = useState(null);
  const [deviceTarget, setDeviceTarget] = useState(null);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredUsers = useMemo(
    () =>
      users.filter((user) =>
        `${user.id} ${user.name} ${user.phone} ${user.actualEmail ?? ""} ${user.status}`
          .toLowerCase()
          .includes(normalizedQuery),
      ),
    [users, normalizedQuery],
  );
  const filteredDevices = useMemo(
    () =>
      devices.filter((device) =>
        `${device.userId} ${device.userName} ${device.mac}`
          .toLowerCase()
          .includes(normalizedQuery),
      ),
    [devices, normalizedQuery],
  );

  async function banUser(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const duration = form.get("duration");
    await createBan({
      publicId: banTarget.id,
      target: "USER",
      reason: String(form.get("reason")),
      durationMinutes:
        duration === "custom"
          ? Number(form.get("customMinutes"))
          : Number(duration),
      permanent: duration === "permanent",
      proofImage: form.get("proof")?.name,
    });
    setUsers((current) =>
      current.map((user) =>
        user.id === banTarget.id ? { ...user, status: "Banned" } : user,
      ),
    );
    setBanTarget(null);
  }

  async function unbanAccount(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await unbanUser(unbanTarget.id, String(form.get("reason")));
    setUsers((current) =>
      current.map((user) =>
        user.id === unbanTarget.id ? { ...user, status: "Active" } : user,
      ),
    );
    setUnbanTarget(null);
  }

  async function logoutUser(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await forceLogoutUser(logoutTarget.id, String(form.get("reason")));
    setLogoutTarget(null);
  }

  async function restoreDevice(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await unbanDevice(
      deviceTarget.userId,
      deviceTarget.mac,
      String(form.get("reason")),
    );
    setDevices((current) =>
      current.filter((device) => device.mac !== deviceTarget.mac),
    );
    setDeviceTarget(null);
  }

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-[#dce8e5] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold">Blocked and Banned User</h3>
          <p className="mt-1 text-xs text-[#748782]">
            Control account access, application sessions, and banned devices.
          </p>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-10 w-full rounded-lg border border-[#dce6e4] bg-[#fafcfc] px-3.5 text-xs outline-none focus:border-[#2ca89c] sm:max-w-xs"
          placeholder="Search user ID, phone or name..."
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white">
        <div className="border-b border-[#e5ecea] px-5 py-4">
          <h4 className="text-sm font-bold">User account access</h4>
          <p className="mt-1 text-[10px] text-[#80918d]">
            Ban, unban, or invalidate every active application session.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-212.5 text-left">
            <thead>
              <tr className="bg-[#f8fbfa] text-[10px] tracking-wider text-[#748883] uppercase">
                <th className="px-5 py-3.5">User</th>
                <th>Phone</th>
                <th>Status</th>
                <th className="px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f1]">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="text-xs hover:bg-[#f9fcfb]">
                  <td className="px-5 py-4">
                    <p className="font-bold">{user.name}</p>
                    <p className="mt-1 font-mono text-[9px] text-[#087f74]">
                      {user.id}
                    </p>
                  </td>
                  <td className="text-[#5d716c]">{user.phone}</td>
                  <td>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${user.status === "Banned" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td className="px-5 text-right">
                    <div className="flex justify-end gap-2">
                      {user.status === "Banned" ? (
                        <button
                          onClick={() => setUnbanTarget(user)}
                          className="rounded-lg border border-emerald-200 px-3 py-2 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50"
                        >
                          Unban user
                        </button>
                      ) : (
                        <button
                          onClick={() => setBanTarget(user)}
                          className="rounded-lg border border-amber-200 px-3 py-2 text-[10px] font-bold text-amber-700 hover:bg-amber-50"
                        >
                          Ban user
                        </button>
                      )}
                      <button
                        onClick={() => setLogoutTarget(user)}
                        className="rounded-lg border border-sky-200 px-3 py-2 text-[10px] font-bold text-sky-700 hover:bg-sky-50"
                      >
                        Force logout
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredUsers.length && (
            <p className="py-12 text-center text-sm text-[#788b87]">
              No users match your search.
            </p>
          )}
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-[#dce8e5] bg-white">
        <div className="border-b border-[#e5ecea] px-5 py-4">
          <h4 className="text-sm font-bold">Banned devices</h4>
          <p className="mt-1 text-[10px] text-[#80918d]">
            Devices marked as banned in Device Information can only be restored
            here.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-190 text-left">
            <thead>
              <tr className="bg-[#f8fbfa] text-[10px] tracking-wider text-[#748883] uppercase">
                <th className="px-5 py-3.5">User</th>
                <th>MAC address</th>
                <th>Location</th>
                <th className="px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f1]">
              {filteredDevices.map((device) => (
                <tr
                  key={`${device.userId}-${device.mac}`}
                  className="text-xs hover:bg-[#f9fcfb]"
                >
                  <td className="px-5 py-4">
                    <p className="font-bold">{device.userName}</p>
                    <p className="mt-1 font-mono text-[9px] text-[#087f74]">
                      {device.userId}
                    </p>
                  </td>
                  <td>
                    <code className="rounded bg-[#f0f5f4] px-2 py-1 text-[10px]">
                      {device.mac}
                    </code>
                  </td>
                  <td className="text-[#60736f]">{device.location}</td>
                  <td className="px-5 text-right">
                    <button
                      onClick={() => setDeviceTarget(device)}
                      className="rounded-lg border border-emerald-200 px-3 py-2 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50"
                    >
                      Unban device
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredDevices.length && (
            <p className="py-12 text-center text-sm text-[#788b87]">
              No banned devices match your search.
            </p>
          )}
        </div>
      </section>

      {banTarget && (
        <BanUserModal
          user={{ userId: banTarget.id, userName: banTarget.name }}
          onClose={() => setBanTarget(null)}
          onBan={banUser}
        />
      )}
      {unbanTarget && (
        <SecurityActionModal
          title="Unban user?"
          description={`Restore application login access for ${unbanTarget.name} · ${unbanTarget.id}.`}
          confirm="Unban user"
          tone="emerald"
          onClose={() => setUnbanTarget(null)}
          onSubmit={unbanAccount}
        />
      )}
      {logoutTarget && (
        <SecurityActionModal
          title="Force user logout?"
          description={`Invalidate all application sessions for ${logoutTarget.name} · ${logoutTarget.id}.`}
          confirm="Force logout"
          tone="sky"
          onClose={() => setLogoutTarget(null)}
          onSubmit={logoutUser}
        />
      )}
      {deviceTarget && (
        <SecurityActionModal
          title="Unban device?"
          description={`Restore device ${deviceTarget.mac} for ${deviceTarget.userId}.`}
          confirm="Unban device"
          tone="emerald"
          onClose={() => setDeviceTarget(null)}
          onSubmit={restoreDevice}
        />
      )}
    </>
  );
}
