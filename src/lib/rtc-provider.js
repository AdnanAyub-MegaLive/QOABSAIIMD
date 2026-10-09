export function rtcProvider() {
  const provider = String(process.env.RTC_PROVIDER || "LIVEKIT").trim().toUpperCase();
  if (!["LIVEKIT", "TRTC"].includes(provider)) throw new Error("RTC_PROVIDER_INVALID");
  return provider;
}

export function rtcFields(access) {
  return { rtcProvider: rtcProvider(), liveKit: access?.provider === "TRTC" ? null : access, trtc: access?.provider === "TRTC" ? access : null };
}
