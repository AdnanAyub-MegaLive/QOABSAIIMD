export default function Loading() {
  return <div role="status" aria-live="polite" className="space-y-4 p-6">
    <span className="sr-only">Loading…</span>
    <div className="h-8 w-56 animate-pulse rounded-lg bg-slate-200" />
    {[1, 2, 3, 4, 5].map(n => <div key={n} className="h-11 animate-pulse rounded-lg bg-slate-100" />)}
  </div>;
}
