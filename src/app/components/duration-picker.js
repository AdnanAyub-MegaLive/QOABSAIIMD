"use client";

import { useState } from "react";
import { durationCalculation } from "../utils/duration";

const defaultPresets = [
  ["4320", "3 days"],
  ["10080", "7 days"],
  ["21600", "15 days"],
  ["43200", "30 days"],
];

export default function DurationPicker({
  name = "durationMinutes",
  label = "Time period",
  defaultMinutes = 10080,
  presets = defaultPresets,
}) {
  const presetValue = presets.some(
    ([value]) => Number(value) === Number(defaultMinutes),
  )
    ? String(defaultMinutes)
    : "custom";
  const [selection, setSelection] = useState(presetValue);
  const [customMinutes, setCustomMinutes] = useState(
    presetValue === "custom" ? String(defaultMinutes || "") : "",
  );
  const minutes =
    selection === "custom" ? Number(customMinutes) : Number(selection);
  return (
    <div>
      <label className="mb-2 block text-xs font-bold">{label}</label>
      <select
        value={selection}
        onChange={(event) => setSelection(event.target.value)}
        className="h-11 w-full rounded-lg border border-[#dce6e4] bg-white px-3 text-xs outline-none focus:border-[#2ca89c]"
      >
        {presets.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
        <option value="custom">Custom time period</option>
      </select>
      {selection === "custom" && (
        <div className="mt-3">
          <label className="mb-2 block text-xs font-bold">
            Custom duration in minutes
          </label>
          <input
            value={customMinutes}
            onChange={(event) => setCustomMinutes(event.target.value)}
            required
            type="number"
            min="1"
            step="1"
            className="h-11 w-full rounded-lg border border-[#dce6e4] px-3 text-xs outline-none focus:border-[#2ca89c]"
            placeholder="For example: 120"
          />
        </div>
      )}
      <input
        type="hidden"
        name={name}
        value={
          Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : ""
        }
      />
      <p className="mt-2 rounded-lg bg-[#eef7f5] px-3 py-2 text-[11px] font-semibold text-[#176f67]">
        {durationCalculation(minutes)}
      </p>
    </div>
  );
}
