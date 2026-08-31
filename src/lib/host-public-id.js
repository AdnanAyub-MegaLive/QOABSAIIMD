export function talentPublicIdForApprovedHost(publicId) {
  const normalized = String(publicId ?? "").trim().toUpperCase();
  if (/^TLN-[A-Z0-9]+$/.test(normalized)) return normalized;
  const match = /^USR-([A-Z0-9]+)$/.exec(normalized);
  if (!match) throw new Error("HOST_PUBLIC_ID_REQUIRES_USR_PREFIX");
  return `TLN-${match[1]}`;
}

export function shouldAssignTalentPublicId({ hostEnabled, isVerified, status }) {
  return Boolean(hostEnabled) && Boolean(isVerified) && String(status).toUpperCase() === "ACTIVE";
}
