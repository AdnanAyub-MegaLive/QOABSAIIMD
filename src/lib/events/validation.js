import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(128),
});

export const eventUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(128),
  role: z.enum(["SUPER_ADMIN", "JUNIOR_ADMIN"]).default("JUNIOR_ADMIN"),
});

export const eventUserUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    password: z.string().min(8).max(128).optional(),
    active: z.boolean().optional(),
    role: z.enum(["SUPER_ADMIN", "JUNIOR_ADMIN"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export const eventMetadataSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
      message: "Slug must contain lowercase letters, numbers, and hyphens.",
    }),
});

export const eventUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export function parseWith(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const error = new Error("Validation failed.");
    error.validation = result.error.flatten();
    throw error;
  }
  return result.data;
}
