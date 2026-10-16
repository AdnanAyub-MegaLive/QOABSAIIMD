"use client";
import { useState } from "react";
import RoomAppearanceManager from "./room-appearance-manager";
import RoomBannerManager from "./room-banner-manager";
export default function AppearanceTabs() {
  const [tab, setTab] = useState("backgrounds");
  return <div className="space-y-6"><nav className="flex gap-2 border-b pb-3" aria-label="Room appearance">{[["backgrounds", "Custom backgrounds"], ["banners", "Paid room banners"]].map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === key ? "bg-[#183f3b] text-white" : "bg-white text-[#71847f]"}`}>{label}</button>)}</nav>{tab === "banners" ? <RoomBannerManager/> : <RoomAppearanceManager/>}</div>;
}
