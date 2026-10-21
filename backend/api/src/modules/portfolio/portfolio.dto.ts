import { z } from "zod";

export const UploadPortfolioBodySchema = z.object({
  title: z.string().optional(),
  type: z.enum(["image", "video"]),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  isPublished: z.boolean().optional()
});
export type UploadPortfolioBody = z.infer<typeof UploadPortfolioBodySchema>;

export const UpdatePortfolioBodySchema = z.object({
  title: z.string().optional(),
  publicUrl: z.string().url().nullable().optional(),
  order: z.coerce.number().optional(),
  isPublished: z.boolean().optional()
});
export type UpdatePortfolioBody = z.infer<typeof UpdatePortfolioBodySchema>;

export const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime"
]);
