"use client";

import { useMemo, useState } from "react";

export default function RecordTable({
  title,
  description,
  columns,
  rows,
  empty = "No records available.",
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        Object.values(row)
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [rows, query],
  );
  return (
    <div className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white shadow-[0_8px_30px_rgba(15,65,60,.04)]">
      <div className="flex flex-col gap-3 border-b border-[#e5ecea] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-[#142c2a]">{title}</h3>
          <p className="mt-1 text-xs text-[#7a8d88]">{description}</p>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-10 w-full rounded-lg border border-[#dce6e4] bg-[#fafcfc] px-3.5 text-xs outline-none focus:border-[#2ca89c] sm:max-w-xs"
          placeholder="Search records..."
          aria-label={`Search ${title}`}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="bg-[#f8fbfa] text-[10px] tracking-wider text-[#748883] uppercase">
              {columns.map((column) => (
                <th key={column.key} className="px-5 py-3.5">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf2f1]">
            {filtered.map((row, index) => (
              <tr key={row.id ?? index} className="text-xs hover:bg-[#f9fcfb]">
                {columns.map((column) => (
                  <td key={column.key} className="px-5 py-4 text-[#526963]">
                    {column.badge ? (
                      <span
                        className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${badgeStyle(row[column.key])}`}
                      >
                        {row[column.key]}
                      </span>
                    ) : column.mono ? (
                      <code className="rounded bg-[#f0f5f4] px-2 py-1 text-[10px]">
                        {row[column.key]}
                      </code>
                    ) : (
                      (row[column.key] ?? "—")
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="py-16 text-center text-sm text-[#788b87]">
            {empty}
          </div>
        )}
      </div>
      <div className="border-t border-[#e8efed] px-5 py-4 text-[10px] text-[#849691]">
        Showing {filtered.length} of {rows.length} records
      </div>
    </div>
  );
}

function badgeStyle(value) {
  const text = String(value).toLowerCase();
  if (
    [
      "active",
      "approved",
      "verified",
      "paid",
      "win",
      "completed",
      "resolved",
    ].some((item) => text.includes(item))
  )
    return "bg-emerald-50 text-emerald-700";
  if (
    ["pending", "review", "open", "medium"].some((item) => text.includes(item))
  )
    return "bg-amber-50 text-amber-700";
  if (
    ["rejected", "loss", "banned", "high"].some((item) => text.includes(item))
  )
    return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-700";
}
