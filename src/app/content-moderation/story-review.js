"use client";
import { useEffect, useState } from "react";
export default function StoryReview() {
  const [status, setStatus] = useState("PENDING"),
    [page, setPage] = useState(0),
    [data, setData] = useState(null),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`/api/admin/stories?status=${status}&page=${page}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw Error(j.error?.message);
        if (active) setData(j.data);
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [status, page, revision]);
  function refresh(){setData(null);setError("");setRevision(x=>x+1);}
  function changePage(value){setData(null);setError("");setPage(value);}
  async function review(row, status) {
    const reason =
      status === "APPROVED" ? "" : prompt("Reason for this decision:");
    if (reason === null) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/stories", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: row.publicId,
            revision: row.reviewRevision,
            status,
            reason,
          }),
        }),
        j = await r.json();
      if (!r.ok) throw Error(j.error?.message);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-2xl border bg-white p-5">
      <h3 className="font-bold">Stories & reports</h3>
      <p className="text-sm text-slate-500">
        Stories expire 24 hours after posting. New stories require approval.
      </p>
      <select
        aria-label="Story status"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          changePage(0);
        }}
        className="my-3 rounded-lg border p-2"
      >
        {["PENDING", "APPROVED", "REJECTED", "REPORTED"].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      {error && <p role="alert">{error}</p>}
      {!data ? (
        error ? <button onClick={refresh}>Retry loading stories</button> : <p>Loading stories…</p>
      ) : (
        <>
          {data.items.map((row) => (
            <article key={row.publicId} className="border-t py-4">
              <b>{row.author.name}</b>
              <p>
                {row.author.publicId} · {row.audience} · {row.status}
              </p>
              <p>Expires {new Date(row.expiresAt).toLocaleString()}</p>
              <p className="whitespace-pre-wrap">{row.caption}</p>
              {row.hasMedia &&
                new Date(row.expiresAt) > new Date() &&
                (row.type === "VIDEO" ? (
                  <video
                    controls
                    preload="metadata"
                    className="max-h-64"
                    src={`/api/admin/stories?media=${row.publicId}`}
                  />
                ) : (
                  <img
                    alt="Story preview"
                    className="max-h-64"
                    src={`/api/admin/stories?media=${row.publicId}`}
                  />
                ))}
              {row.reports.map((r, i) => (
                <p key={i}>
                  Report: {r.reason} ({r.status})
                </p>
              ))}
              <div className="flex gap-2">
                {(row.status === "PENDING"
                  ? ["APPROVED", "REJECTED", "REMOVED"]
                  : ["REMOVED"]
                ).map((s) => (
                  <button
                    key={s}
                    disabled={busy}
                    className="rounded-lg border px-3 py-2 text-purple-700"
                    onClick={() => review(row, s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </article>
          ))}
          {!data.items.length && <p>No stories in this queue.</p>}
          <button disabled={page === 0} onClick={() => changePage(page - 1)}>
            Previous
          </button>
          <span className="px-4">Page {page + 1}</span>
          <button
            disabled={!data.hasMore}
            onClick={() => changePage(page + 1)}
          >
            Next
          </button>
        </>
      )}
    </section>
  );
}
