// Speaking is presentation state, never an instruction to activate a microphone.
export function nextSeatStatus(seat, { muted, speaking }) {
  if ((muted !== undefined && typeof muted !== "boolean") || (speaking !== undefined && typeof speaking !== "boolean")) throw new Error("VALIDATION_ERROR");
  const nextMuted = muted ?? seat.isMuted;
  if (seat.isForceMuted && !nextMuted) throw new Error("SEAT_FORCE_MUTED");
  const nextSpeaking = !nextMuted && !seat.isForceMuted && (speaking ?? seat.isSpeaking);
  return { isMuted: nextMuted, isSpeaking: nextSpeaking,
    permissionChanged: nextMuted !== seat.isMuted,
    changed: nextMuted !== seat.isMuted || nextSpeaking !== seat.isSpeaking };
}
