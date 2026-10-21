import { z } from "zod";

export const CreateStayPromoBodySchema = z.object({
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validToInclusive: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minStayNights: z.coerce.number().int().min(1).max(366),
  promoPercent: z.coerce.number().int().min(1).max(100),
  label: z.string().max(200).optional().nullable(),
  active: z.boolean().optional().default(true)
});
export type CreateStayPromoBody = z.infer<typeof CreateStayPromoBodySchema>;

export const UpdateStayPromoBodySchema = z.object({
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  validToInclusive: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  minStayNights: z.coerce.number().int().min(1).max(366).optional(),
  promoPercent: z.coerce.number().int().min(1).max(100).optional(),
  label: z.string().max(200).optional().nullable(),
  active: z.boolean().optional()
});
export type UpdateStayPromoBody = z.infer<typeof UpdateStayPromoBodySchema>;
