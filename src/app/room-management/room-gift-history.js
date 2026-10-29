"use client";
import { useEffect, useState } from "react";

export default function RoomGiftHistory({ roomId }) {
  const [page, setPage] = useState(1), [query, setQuery] = useState("");
  const [data, setData] = useState(null), [error, setError] = useState(""), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/room-management/gifts?roomId=${encodeURIComponent(roomId)}&page=${page}&q=${encodeURIComponent(query)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || "Unable to load gifts."); return body.data; })
      .then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [roomId, page, query, refresh]);
  return <div className="rounded-2xl border bg-white p-5 lg:col-span-2">
    <h4 className="font-bold">Gift history</h4>
    <div className="my-3 flex gap-3"><input aria-label="Search room gift history" placeholder="Gift, sender or recipient name / ID" value={query} onChange={e => { setData(null); setError(""); setQuery(e.target.value); setPage(1); }} className="w-full rounded border p-2 text-sm" /><button onClick={() => { setData(null); setError(""); setRefresh(v => v + 1); }}>Refresh</button></div>
    {error ? <p role="alert">{error}</p> : !data ? <p>Loading gifts…</p> : <>
      <div className="max-h-[600px] overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{["Time", "Sender", "Recipient", "Gift", "Quantity", "Coins", "Status"].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{data.items.map(row => <tr key={row.id} className="border-t"><td className="p-2">{new Date(row.createdAt).toLocaleString()}</td><td>{row.sender.name}<br />{row.sender.publicId}</td><td>{row.recipient?.name ?? "Unavailable"}<br />{row.recipient?.publicId}</td><td>{row.giftName}</td><td>{row.quantity}</td><td>{BigInt(row.coinValue).toLocaleString()}</td><td>{row.reversedAt ? "Reversed" : "Committed"}</td></tr>)}</tbody></table></div>
      {!data.items.length && <p className="py-4">No matching gifts.</p>}
      <nav aria-label="Gift history pages" className="mt-3 flex gap-4"><button disabled={page === 1} onClick={() => { setData(null); setError(""); setPage(v => v - 1); }}>Previous</button><span>Page {page} · {data.total} records</span><button disabled={page * data.pageSize >= data.total} onClick={() => { setData(null); setError(""); setPage(v => v + 1); }}>Next</button></nav>
    </>}
  </div>;
}
