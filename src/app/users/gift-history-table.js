"use client";

import { useMemo, useState } from "react";
import { adjustUserCoins } from "../database-actions";
import usePortalData from "../hooks/use-portal-data";

const number = new Intl.NumberFormat("en-US");

export default function GiftHistoryTable({ initialData }) {
  const [users, setUsers] = usePortalData(
    initialData.map((user) => ({
      ...user,
      vipLabel: user.vipLevel ? `VIP ${user.vipLevel}` : "Standard",
      lastGift: user.lastGift ?? "No gifts yet",
    })),
  );
  const [query, setQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const filteredUsers = useMemo(
    () =>
      users.filter((user) =>
        `${user.id} ${user.name}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [users, query],
  );
  const totals = useMemo(
    () => ({
      spent: users.reduce((sum, user) => sum + user.totalSpent, 0),
      balance: users.reduce((sum, user) => sum + user.balance, 0),
      gifts: users.reduce((sum, user) => sum + user.gifts, 0),
    }),
    [users],
  );

  async function adjustCoins(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const operation = formData.get("operation");
    const amount = Number(formData.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0) return;

    const balance = await adjustUserCoins(
      selectedUser.id,
      operation,
      amount,
      String(formData.get("reason")),
    );
    setUsers((current) =>
      current.map((user) =>
        user.id !== selectedUser.id ? user : { ...user, balance },
      ),
    );
    setSelectedUser(null);
  }

  return (
    <>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Total sender spending"
          value={`${number.format(totals.spent)} coins`}
          note="Across user accounts"
        />
        <SummaryCard
          label="Current coin balance"
          value={`${number.format(totals.balance)} coins`}
          note="Available user balances"
        />
        <SummaryCard
          label="Gifts sent"
          value={number.format(totals.gifts)}
          note="Completed gift transactions"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white shadow-[0_8px_30px_rgba(15,65,60,.04)]">
        <div className="flex flex-col gap-3 border-b border-[#e5ecea] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold">Gift Sending History</h3>
            <p className="mt-1 text-xs text-[#7a8d88]">
              Total spending and available coin balance for each sender.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <svg
              className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 fill-none stroke-[#80938f] stroke-2"
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 w-full rounded-lg border border-[#dce6e4] bg-[#fafcfc] pr-3 pl-9 text-xs outline-none focus:border-[#2ca89c] focus:ring-3 focus:ring-[#2ca89c]/10"
              placeholder="Search user name or ID..."
              aria-label="Search gift history users"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-left">
            <thead>
              <tr className="bg-[#f8fbfa] text-[10px] font-bold tracking-wider text-[#748883] uppercase">
                <th className="px-5 py-3.5">User ID</th>
                <th>User Name</th>
                <th>User Level</th>
                <th>Total Spending</th>
                <th>Current Balance</th>
                <th>Gifts Sent</th>
                <th>Last Gift</th>
                <th className="px-5 text-right">Coin Management</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f1]">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="text-xs hover:bg-[#f9fcfb]">
                  <td className="px-5 py-4 font-bold text-[#087f74]">
                    {user.id}
                  </td>
                  <td className="py-4 font-semibold text-[#29423d]">
                    {user.name}
                  </td>
                  <td>
                    <span
                      className={`rounded-full px-2 py-1 text-[9px] font-bold ${user.vipLevel > 0 ? "bg-[#fff5d9] text-[#9b6800]" : "bg-[#eef3f2] text-[#667975]"}`}
                    >
                      {user.vipLabel}
                    </span>
                  </td>
                  <td className="font-semibold text-[#445d57]">
                    {number.format(user.totalSpent)}{" "}
                    <span className="text-[9px] font-normal text-[#899995]">
                      coins
                    </span>
                  </td>
                  <td>
                    <strong className="text-[#087f74]">
                      {number.format(user.balance)}
                    </strong>{" "}
                    <span className="text-[9px] text-[#899995]">coins</span>
                  </td>
                  <td className="text-[#566d67]">
                    {number.format(user.gifts)}
                  </td>
                  <td className="text-[#6e817c]">{user.lastGift}</td>
                  <td className="px-5 text-right">
                    <button
                      onClick={() => setSelectedUser(user)}
                      className="rounded-lg border border-[#bcded9] bg-[#edf8f6] px-3 py-2 text-[10px] font-bold text-[#087f74] hover:bg-[#dff3ef]"
                    >
                      Add / Remove Coins
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredUsers.length && (
            <div className="py-16 text-center text-sm text-[#788b87]">
              No sender records match your search.
            </div>
          )}
        </div>
        <div className="border-t border-[#e8efed] px-5 py-4 text-[10px] text-[#849691]">
          Showing {filteredUsers.length} of {users.length} sender records
        </div>
      </div>
      {selectedUser && (
        <CoinAdjustmentModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onSubmit={adjustCoins}
        />
      )}
    </>
  );
}

function SummaryCard({ label, value, note }) {
  return (
    <div className="rounded-xl border border-[#dfe9e7] bg-white p-5">
      <p className="text-[11px] font-semibold text-[#768984]">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="mt-2 text-[10px] text-[#429387]">{note}</p>
    </div>
  );
}

function CoinAdjustmentModal({ user, onClose, onSubmit }) {
  const [operation, setOperation] = useState("add");
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#061c1a]/60 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coin-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[480px] rounded-2xl bg-white shadow-[0_24px_80px_rgba(0,0,0,.25)]">
        <div className="flex items-start justify-between border-b border-[#e5ecea] px-6 py-5">
          <div>
            <span className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-[#e7f5f2] text-lg text-[#087f74]">
              ◈
            </span>
            <h2 id="coin-modal-title" className="text-lg font-bold">
              Manage user coins
            </h2>
            <p className="mt-1 text-xs text-[#748782]">
              {user.name} · {user.id}
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="grid h-8 w-8 place-items-center rounded-lg text-xl text-[#7c8f8a] hover:bg-[#f0f5f4]"
            aria-label="Close coin modal"
          >
            ×
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-6">
          <div className="mb-5 rounded-xl bg-[#f3f8f7] p-4">
            <p className="text-[10px] font-bold tracking-wider text-[#7e918c] uppercase">
              Current balance
            </p>
            <p className="mt-1 text-2xl font-bold text-[#087f74]">
              {number.format(user.balance)}{" "}
              <span className="text-xs font-medium text-[#6f837e]">coins</span>
            </p>
          </div>
          <label className="mb-2 block text-xs font-bold text-[#29423d]">
            Adjustment type
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setOperation("add")}
              type="button"
              className={`h-11 rounded-lg border text-xs font-bold ${operation === "add" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-[#dce6e4] text-[#697d78]"}`}
            >
              + Add coins
            </button>
            <button
              onClick={() => setOperation("remove")}
              type="button"
              className={`h-11 rounded-lg border text-xs font-bold ${operation === "remove" ? "border-red-400 bg-red-50 text-red-700" : "border-[#dce6e4] text-[#697d78]"}`}
            >
              − Remove coins
            </button>
          </div>
          <input type="hidden" name="operation" value={operation} />
          <label
            className="mt-5 mb-2 block text-xs font-bold text-[#29423d]"
            htmlFor="coin-amount"
          >
            Coin amount
          </label>
          <input
            id="coin-amount"
            name="amount"
            type="number"
            required
            min="1"
            step="1"
            placeholder="Enter number of coins"
            className="h-11 w-full rounded-lg border border-[#dce6e4] px-3.5 text-xs outline-none focus:border-[#2ca89c] focus:ring-3 focus:ring-[#2ca89c]/10"
          />
          <label
            className="mt-5 mb-2 block text-xs font-bold text-[#29423d]"
            htmlFor="coin-reason"
          >
            Reason
          </label>
          <textarea
            id="coin-reason"
            name="reason"
            required
            rows="3"
            placeholder="Explain why the balance is being adjusted..."
            className="w-full resize-none rounded-lg border border-[#dce6e4] px-3.5 py-3 text-xs outline-none focus:border-[#2ca89c] focus:ring-3 focus:ring-[#2ca89c]/10"
          />
          <label
            className="mt-5 mb-2 block text-xs font-bold text-[#29423d]"
            htmlFor="coin-admin"
          >
            Adjusted by
          </label>
          <input
            id="coin-admin"
            name="adminName"
            required
            placeholder="Enter your admin name"
            className="h-11 w-full rounded-lg border border-[#dce6e4] px-3.5 text-xs outline-none focus:border-[#2ca89c] focus:ring-3 focus:ring-[#2ca89c]/10"
          />
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
              className={`h-10 rounded-lg px-5 text-xs font-bold text-white ${operation === "add" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
            >
              {operation === "add" ? "Add coins" : "Remove coins"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
