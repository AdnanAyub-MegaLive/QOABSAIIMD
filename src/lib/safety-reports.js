import { createHash, randomUUID } from "node:crypto";
export const reportError = (code, message, status = 422) => Object.assign(new Error(message), { code, status });
export function reportInput(input) {
  if (!input || !["USER", "AUDIO_ROOM"].includes(input.targetType)) throw reportError("VALIDATION_ERROR", "Choose a user or audio room to report.");
  const text = (value, field, max, optional = false) => {
    if (optional && value == null) return "";
    if (typeof value !== "string" || [...value].length > max || (!optional && !value.trim())) throw reportError("VALIDATION_ERROR", `${field} must contain ${optional ? "0" : "1"}–${max} characters.`);
    return value.trim();
  };
  const result = { targetType: input.targetType, targetId: text(input.targetId, "Target ID", 100), roomId: text(input.roomId, "Room ID", 100, true) || null, reason: text(input.reason, "Reason", 120), details: text(input.details, "Details", 500, true), requestId: text(input.requestId, "Request ID", 128) };
  if (!/^[A-Za-z0-9._:-]+$/.test(result.requestId)) throw reportError("VALIDATION_ERROR", "Request ID contains unsupported characters.");
  return result;
}
export async function submitSafetyReport(db, reporterUserId, input) {
  const data = reportInput(input);
  const fingerprint = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  const where = { reporterUserId_requestId: { reporterUserId, requestId: data.requestId } };
  const replay = old => {
    if (old.fingerprint !== fingerprint) throw reportError("IDEMPOTENCY_CONFLICT", "This request ID was already used for a different report.", 409);
    return { reportId: old.publicId };
  };
  const old = await db.safetyReport.findUnique({ where }); if (old) return replay(old);
  const target = data.targetType === "USER"
    ? await db.user.findUnique({ where: { publicId: data.targetId }, select: { id: true } })
    : await db.audioRoom.findUnique({ where: { roomId: data.targetId }, select: { id: true } });
  if (!target) throw reportError("REPORT_TARGET_NOT_FOUND", "The reported user or room could not be found.", 404);
  if (data.roomId && !await db.audioRoom.findUnique({ where: { roomId: data.roomId }, select: { id: true } })) throw reportError("REPORT_TARGET_NOT_FOUND", "The referenced room could not be found.", 404);
  try {
    const report = await db.safetyReport.create({ data: { ...data, reporterUserId, fingerprint, targetInternalId: target.id, publicId: `RPT-${randomUUID()}` } });
    return { reportId: report.publicId };
  } catch (error) {
    if (error.code !== "P2002") throw error;
    const saved = await db.safetyReport.findUnique({ where }); if (!saved) throw error;
    return replay(saved);
  }
}
