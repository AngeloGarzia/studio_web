import { z } from "zod";

export const CreateAncillaryFeeBodySchema = z.object({
  label: z.string().min(1).max(200),
  priceCents: z.coerce.number().int().min(0).max(10_000_000),
  active: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().optional().default(0)
});
export type CreateAncillaryFeeBody = z.infer<typeof CreateAncillaryFeeBodySchema>;

export const UpdateAncillaryFeeBodySchema = z.object({
  label: z.string().min(1).max(200).optional(),
  priceCents: z.coerce.number().int().min(0).max(10_000_000).optional(),
  active: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional()
});
export type UpdateAncillaryFeeBody = z.infer<typeof UpdateAncillaryFeeBodySchema>;
