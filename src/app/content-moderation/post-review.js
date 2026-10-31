"use client";
/* eslint-disable @next/next/no-img-element -- authenticated moderation previews use the private endpoint */
import { useState } from "react";
import PagedRecords from "../components/paged-records";
export default function PostReview() {
  const [revision, setRevision] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function review(post, action) {
    const reason = action === "REJECT" ? prompt("Reason for rejecting this post:") : "";
    if (action === "REJECT" && !reason?.trim()) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/posts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: post.publicId, revision: post.reviewRevision, action, reason }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Unable to review this post.");
      setRevision(value => value + 1);
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  return <section className="rounded-2xl border bg-white p-5"><h3 className="font-bold">Discover post review</h3><p className="text-sm text-slate-500">New and edited posts require approval before publication.</p>{error && <p role="alert" className="text-red-600">{error}</p>}<PagedRecords endpoint="/api/admin/posts" revision={revision} filters={[{ name: "status", label: "Status", options: ["PENDING", "APPROVED", "REJECTED", "ALL"] }]}>{items => <div className="divide-y">{items.map(post => <article key={post.publicId} className="py-4"><b>{post.author.name}</b><p className="text-xs">{post.author.publicId} · {post.publicId} · {post.status}</p><p className="whitespace-pre-wrap break-words">{post.description}</p>{post.imageUrl && <img alt="Submitted post" src={`/api/admin/posts?image=${encodeURIComponent(post.publicId)}&v=${post.reviewRevision}`} className="my-2 max-h-56 object-contain"/>}{post.reviewReason && <p>{post.reviewReason}</p>}{post.status === "PENDING" && <div className="mt-2 flex gap-2">{["APPROVE", "REJECT"].map(action => <button key={action} disabled={busy} onClick={() => review(post, action)} className="rounded border px-3 py-2 disabled:opacity-40">{action}</button>)}</div>}</article>)}{!items.length && <p className="py-4">No posts to review.</p>}</div>}</PagedRecords></section>;
}
