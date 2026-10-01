"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  assignSpecialId,
  deleteUserAccount,
  resetUserPassword,
  updateUserAccount,
} from "../database-actions";
import usePortalData from "../hooks/use-portal-data";
import DurationPicker from "../components/duration-picker";

const userRoleChoices = [
  "Listener", "Sender", "Creator", "Host", "Moderator", "Official",
  "BD", "Admin", "Junior Admin", "Senior Admin", "Super Admin", "Country Head",
];

const statusStyles = {
  Active: "bg-emerald-50 text-emerald-700",
  Pending: "bg-amber-50 text-amber-700",
  Suspended: "bg-red-50 text-red-700",
  Banned: "bg-red-50 text-red-700",
};

export default function UsersTable({ initialData, specialIdCatalog }) {
  const [users, setUsers] = usePortalData(initialData);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [vipOnly, setVipOnly] = useState(false);
  const [menu, setMenu] = useState(null);
  const [modal, setModal] = useState(null);
  const filtered = useMemo(
    () =>
      users.filter(
        (user) =>
          `${user.name} ${user.phone} ${user.actualEmail ?? ""} ${user.id} ${user.specialId ?? ""}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (status === "All" || user.status === status) &&
          (!vipOnly || user.vipLevel > 0),
      ),
    [users, query, status, vipOnly],
  );
  const saveUser = (id, changes) =>
    setUsers((current) =>
      current.map((user) => (user.id === id ? { ...user, ...changes } : user)),
    );
  return (
    <section className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white">
      <div className="flex flex-col gap-3 border-b border-[#e5ecea] p-5 sm:flex-row sm:justify-between">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10 w-full rounded-lg border border-[#dce6e4] bg-[#fafcfc] px-4 text-xs outline-none sm:max-w-xs"
          placeholder="Search users, phone, email or ID..."
        />
        <div className="flex gap-2">
          <button
            onClick={() => setVipOnly(!vipOnly)}
            className={`h-10 rounded-lg border px-3 text-xs ${vipOnly ? "bg-amber-50 text-amber-700" : "text-[#536863]"}`}
          >
            VIP users
          </button>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 rounded-lg border bg-white px-3 text-xs"
          >
            <option>All</option>
            <option>Active</option>
            <option>Pending</option>
            <option>Suspended</option>
            <option>Banned</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-left">
          <thead>
            <tr className="bg-[#f8fbfa] text-[10px] tracking-wider text-[#7b8e89] uppercase">
              <th className="px-5 py-3.5">User</th>
              <th>Special ID</th>
              <th>Roles</th>
              <th>VIP</th>
              <th>Status</th>
              <th>Password</th>
              <th>Joined</th>
              <th>Streams</th>
              <th className="px-5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf2f1]">
            {filtered.map((user) => (
              <tr key={user.id} className="hover:bg-[#f9fcfb]">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/users/${encodeURIComponent(user.id)}`}
                      target="_blank"
                      className="grid h-9 w-9 place-items-center rounded-full bg-[#e6f4f1] text-[11px] font-bold text-[#087f74]"
                    >
                      {user.initials}
                    </Link>
                    <div>
                      <Link
                        href={`/users/${encodeURIComponent(user.id)}`}
                        target="_blank"
                        className="text-xs font-bold hover:text-[#087f74]"
                      >
                        {user.name}
                      </Link>
                      <p className="text-[10px] text-[#849590]">
                        {user.phone} · {user.id}
                      </p>
                    </div>
                  </div>
                </td>
                <td>
                  {user.specialId ? (
                    <div>
                      <p className="font-mono text-xs font-bold text-[#087f74]">
                        {user.specialId}
                      </p>
                      <p className="text-[9px] text-[#849590]">
                        Active display ID
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs text-[#a1afac]">—</span>
                  )}
                </td>
                <td>
                  <div className="flex min-w-40 max-w-64 flex-wrap gap-1.5">
                    {(user.roles?.length ? user.roles : [user.role]).map(
                      (role) => (
                        <span
                          key={role}
                          className="rounded-full border border-[#cfe4e0] bg-[#eef8f6] px-2 py-1 text-[9px] font-bold text-[#176e65]"
                        >
                          {role}
                        </span>
                      ),
                    )}
                  </div>
                </td>
                <td>
                  {user.vipLevel ? (
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-700">
                      VIP {user.vipLevel}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <span
                    className={`rounded-full px-2 py-1 text-[9px] font-bold ${statusStyles[user.status]}`}
                  >
                    {user.status}
                  </span>
                </td>
                <td>
                  <span className="text-xs">
                    {user.passwordSet ? "••••••••" : "Not set"}
                  </span>
                </td>
                <td className="text-xs">{user.joined}</td>
                <td className="text-xs">{user.streams}</td>
                <td className="relative px-5 text-right">
                  <button
                    onClick={() => setMenu(menu === user.id ? null : user.id)}
                    className="rounded-lg p-2"
                  >
                    •••
                  </button>
                  {menu === user.id && (
                    <div className="absolute top-12 right-5 z-20 w-52 rounded-xl border bg-white py-1.5 text-left shadow-xl">
                      <Menu
                        text="Adjust role"
                        icon="R"
                        onClick={() => {
                          setModal({ type: "role", user });
                          setMenu(null);
                        }}
                      />
                      <Menu
                        text="Manage VIP"
                        icon="★"
                        onClick={() => {
                          setModal({ type: "vip", user });
                          setMenu(null);
                        }}
                      />
                      <Menu
                        text="Assign Special ID"
                        icon="ID"
                        onClick={() => {
                          setModal({ type: "special", user });
                          setMenu(null);
                        }}
                      />
                      <Menu
                        text="Reset password"
                        icon="K"
                        onClick={() => {
                          setModal({ type: "password", user });
                          setMenu(null);
                        }}
                      />
                      <div className="my-1 border-t" />
                      <Menu
                        text="Delete account"
                        icon="×"
                        danger
                        onClick={() => {
                          setModal({ type: "delete", user });
                          setMenu(null);
                        }}
                      />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="py-14 text-center text-sm text-[#788b87]">
            No users match your search.
          </p>
        )}
      </div>
      <div className="border-t px-5 py-4 text-[11px] text-[#788b87]">
        Showing {filtered.length} of {users.length} users
      </div>
      {modal?.type === "role" && (
        <RoleModal
          title="Adjust user role"
          user={modal.user}
          onClose={() => setModal(null)}
          onSave={async (roles, reason) => {
            await updateUserAccount(modal.user.id, {
              roles,
              auditReason: reason,
            });
            saveUser(modal.user.id, {
              roles,
              role: roles.join(", "),
              isOfficial: roles.includes("Official"),
            });
            setModal(null);
          }}
        />
      )}
      {modal?.type === "vip" && (
        <ChoiceModal
          title="Manage VIP level"
          user={modal.user}
          choices={[0, 1, 2, 3, 4, 5]}
          initial={modal.user.vipLevel}
          reasonLabel="Reason for VIP change"
          format={(v) => (v ? `VIP ${v}` : "Remove VIP")}
          onClose={() => setModal(null)}
          onSave={async (value, reason) => {
            await updateUserAccount(modal.user.id, {
              vipLevel: Number(value),
              auditReason: reason,
            });
            saveUser(modal.user.id, {
              vipLevel: Number(value),
              vip: Number(value) > 0,
            });
            setModal(null);
          }}
        />
      )}
      {modal?.type === "special" && (
        <SpecialIdModal
          user={modal.user}
          catalog={specialIdCatalog}
          onClose={() => setModal(null)}
          onAssigned={(result) => {
            saveUser(modal.user.id, {
              specialId: result.specialId,
              effectiveId: result.specialId,
              specialIdExpiresAt: result.expiresAt,
            });
            setModal(null);
          }}
        />
      )}
      {modal?.type === "password" && (
        <PasswordModal
          user={modal.user}
          onClose={() => setModal(null)}
          onReset={() => saveUser(modal.user.id, { passwordSet: true })}
        />
      )}
      {modal?.type === "delete" && (
        <DeleteModal
          user={modal.user}
          onClose={() => setModal(null)}
          onDeleted={() => {
            setUsers((current) =>
              current.filter((user) => user.id !== modal.user.id),
            );
            setModal(null);
          }}
        />
      )}
    </section>
  );
}

function Menu({ text, icon, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[11px] font-semibold hover:bg-[#f2f7f6] ${danger ? "text-red-600" : "text-[#405853]"}`}
    >
      <span className="grid h-6 w-6 place-items-center rounded-md bg-[#eaf5f3] text-[9px]">
        {icon}
      </span>
      {text}
    </button>
  );
}
function ChoiceModal({
  title,
  user,
  choices,
  initial,
  format = (v) => v,
  reasonLabel,
  onClose,
  onSave,
}) {
  const [value, setValue] = useState(initial);
  return (
    <Modal
      title={title}
      subtitle={`${user.name} · ${user.id}`}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(value, String(new FormData(e.currentTarget).get("reason")));
        }}
      >
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={input}
        >
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {format(choice)}
            </option>
          ))}
        </select>
        <Reason label={reasonLabel} />
        <Actions onClose={onClose} confirm="Save changes" />
      </form>
    </Modal>
  );
}

function RoleModal({ title, user, onClose, onSave }) {
  const [roles, setRoles] = useState(
    user.roles?.length ? user.roles : [user.role || "Listener"],
  );
  const toggle = (role) =>
    setRoles((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role],
    );
  return (
    <Modal title={title} subtitle={`${user.name} · ${user.id}`} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!roles.length) return;
          onSave(roles, String(new FormData(event.currentTarget).get("reason")));
        }}
      >
        <p className="mb-3 text-[11px] text-[#68807b]">
          Select every role this user holds. Permissions will be connected to these roles later.
        </p>
        <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
          {userRoleChoices.map((role) => (
            <label key={role} className="flex items-center gap-2 rounded-lg border border-[#dce8e5] px-3 py-2.5 text-xs font-semibold">
              <input type="checkbox" checked={roles.includes(role)} onChange={() => toggle(role)} className="accent-[#087f74]" />
              {role}
            </label>
          ))}
        </div>
        {!roles.length && <p className="mt-2 text-[10px] font-semibold text-red-600">Select at least one role.</p>}
        <Reason label="Reason for role change" />
        <Actions onClose={onClose} confirm="Save roles" />
      </form>
    </Modal>
  );
}
function SpecialIdModal({ user, catalog, onClose, onAssigned }) {
  const available = catalog.filter((item) => item.active && !item.assignedTo);
  const [definitionId, setDefinitionId] = useState(available[0]?.id ?? "");
  const [error, setError] = useState("");
  const selected = available.find((item) => item.id === definitionId);
  return (
    <Modal
      title="Assign Special ID"
      subtitle={`${user.name} · normal ID ${user.id}`}
      onClose={onClose}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setError("");
          try {
            onAssigned(
              await assignSpecialId(
                user.id,
                definitionId,
                Number(form.get("durationMinutes")),
                String(form.get("reason")),
              ),
            );
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <label className="mb-2 block text-xs font-bold">
          Available Special ID
        </label>
        <select
          required
          value={definitionId}
          onChange={(event) => setDefinitionId(event.target.value)}
          className={input}
        >
          <option value="" disabled>
            Select an ID
          </option>
          {available.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} · {item.category}
            </option>
          ))}
        </select>
        <div className="mt-5">
          <DurationPicker
            key={definitionId}
            name="durationMinutes"
            label="Special ID time period"
            defaultMinutes={selected?.defaultDurationMinutes ?? 10080}
          />
        </div>
        <p className="mt-2 text-[10px] text-[#82938f]">
          When this period expires, the user automatically returns to normal ID{" "}
          {user.id}.
        </p>
        <Reason label="Assignment reason" />
        {!available.length && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
            Create an available ID in VIP &amp; SVIP IDs first.
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
            {error}
          </p>
        )}
        <Actions onClose={onClose} confirm="Assign Special ID" />
      </form>
    </Modal>
  );
}
function PasswordModal({ user, onClose, onReset }) {
  const [password, setPassword] = useState("");
  return (
    <Modal
      title="Reset user password"
      subtitle={`${user.name} · ${user.id}`}
      onClose={onClose}
    >
      {password ? (
        <div>
          <div className="rounded-xl bg-amber-50 p-5 text-center font-mono text-2xl font-bold">
            {password}
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(password)}
            className="mt-3 h-10 w-full rounded-lg border text-xs font-bold"
          >
            Copy password
          </button>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await resetUserPassword(
              user.id,
              String(new FormData(e.currentTarget).get("reason")),
            );
            setPassword(result.temporaryPassword);
            onReset();
          }}
        >
          <Reason label="Reset reason" />
          <Actions onClose={onClose} confirm="Generate password" />
        </form>
      )}
    </Modal>
  );
}
function DeleteModal({ user, onClose, onDeleted }) {
  return (
    <Modal
      title="Delete user account"
      subtitle={`${user.name} · ${user.id}`}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await deleteUserAccount(
            user.id,
            String(new FormData(e.currentTarget).get("reason")),
          );
          onDeleted();
        }}
      >
        <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">
          This permanently disables and anonymizes the account.
        </p>
        <Reason label="Deletion reason" />
        <Actions onClose={onClose} confirm="Delete account" />
      </form>
    </Modal>
  );
}
function Reason({ label }) {
  return (
    <>
      <label className="mt-5 mb-2 block text-xs font-bold">{label}</label>
      <textarea
        name="reason"
        required
        rows="3"
        className="w-full rounded-lg border border-[#dce6e4] p-3 text-xs"
      />
    </>
  );
}
function Modal({ title, subtitle, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#061c1a]/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-[470px] rounded-2xl bg-white shadow-2xl">
        <div className="flex justify-between border-b px-6 py-5">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="mt-1 text-xs text-[#748782]">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
function Actions({ onClose, confirm }) {
  return (
    <div className="mt-6 flex justify-end gap-2 border-t pt-5">
      <button
        type="button"
        onClick={onClose}
        className="h-10 rounded-lg border px-4 text-xs font-bold"
      >
        Cancel
      </button>
      <button className="h-10 rounded-lg bg-[#087f74] px-5 text-xs font-bold text-white">
        {confirm}
      </button>
    </div>
  );
}
const input =
  "h-11 w-full rounded-lg border border-[#dce6e4] bg-white px-3 text-xs";
