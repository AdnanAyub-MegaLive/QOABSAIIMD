"use client";
import { useState } from "react";
import { countryOptions, normalizeSignupCountry } from "../../lib/geo-country";

export default function CountrySelect({ value }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(normalizeSignupCountry(value) ?? "");
  const query = search.trim().toLowerCase();
  const options = countryOptions.filter(item => item.code === selected || `${item.name} ${item.code}`.toLowerCase().includes(query));
  return <div className="grid gap-2 text-xs">
    <label className="font-bold" htmlFor="profile-country-search">Country</label>
    <input id="profile-country-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search country name or code…" className="h-10 w-full rounded-lg border border-[#dce6e4] px-3" />
    <select aria-label="Country" name="country" value={selected} onChange={event => setSelected(event.target.value)} className="h-11 w-full rounded-lg border border-[#dce6e4] bg-white px-3">
      <option value="">Not specified</option>
      {options.map(item => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}
    </select>
  </div>;
}
