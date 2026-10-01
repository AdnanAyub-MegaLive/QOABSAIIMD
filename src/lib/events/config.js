import { z } from "zod";
import { createHash } from "node:crypto";

const schema = z.object({
  jwtSecret: z.string().min(32),
  storageRoot: z.string().min(1),
  accessMinutes: z.coerce.number().int().min(5).max(60),
  refreshDays: z.coerce.number().int().min(1).max(90),
  maxUploadBytes: z.coerce.number().int().min(1024 * 1024),
  maxExtractedBytes: z.coerce.number().int().min(1024 * 1024),
  maxFiles: z.coerce.number().int().min(1).max(20000),
});

let cached;

export function getEventConfig() {
  if (cached) return cached;
  const developmentFallback =
    process.env.NODE_ENV !== "production" && process.env.AUTH_SECRET
      ? createHash("sha256")
          .update(`streamline-events:${process.env.AUTH_SECRET}`)
          .digest("hex")
      : undefined;
  const secret = process.env.EVENTS_JWT_SECRET || developmentFallback;
  const result = schema.safeParse({
    jwtSecret: secret,
    storageRoot: process.env.EVENTS_STORAGE_ROOT || "storage/events",
    accessMinutes: process.env.EVENTS_ACCESS_MINUTES || 15,
    refreshDays: process.env.EVENTS_REFRESH_DAYS || 30,
    maxUploadBytes: process.env.EVENTS_MAX_UPLOAD_BYTES || 104857600,
    maxExtractedBytes:
      process.env.EVENTS_MAX_EXTRACTED_BYTES || 262144000,
    maxFiles: process.env.EVENTS_MAX_FILES || 5000,
  });
  if (!result.success)
    throw new Error(
      `Events environment configuration is invalid: ${result.error.issues
        .map((issue) => issue.path.join("."))
        .join(", ")}`,
    );
  cached = result.data;
  return cached;
}
