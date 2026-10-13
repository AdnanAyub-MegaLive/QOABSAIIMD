"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
export default function DashboardRefresh() {
  const router = useRouter(), [pending, start] = useTransition();
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") start(() => router.refresh()); }, 60000);
    return () => clearInterval(timer);
  }, [router]);
  return <button disabled={pending} onClick={() => start(() => router.refresh())} className="rounded-lg border border-[#d7e4e1] bg-white px-4 py-2 text-xs font-semibold disabled:opacity-50">{pending ? "Refreshing…" : "Refresh data"}</button>;
}
