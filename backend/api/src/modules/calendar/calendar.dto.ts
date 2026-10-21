import { z } from "zod";

export const PublicCalendarQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional()
});
export type PublicCalendarQuery = z.infer<typeof PublicCalendarQuerySchema>;

export const CreateBlockBodySchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().optional()
});
export type CreateBlockBody = z.infer<typeof CreateBlockBodySchema>;

export const ClearBlocksBodySchema = z.object({
  startDate: z.string(),
  endDate: z.string()
});
export type ClearBlocksBody = z.infer<typeof ClearBlocksBodySchema>;

export const UnblockDayBodySchema = z.object({
  day: z.string()
});
export type UnblockDayBody = z.infer<typeof UnblockDayBodySchema>;

export const UpsertDayConfigBodySchema = z.object({
  from: z.string(),
  to: z.string(),
  priceCents: z.coerce.number().int().min(0),
  arrivalAllowed: z.boolean().optional(),
  departureAllowed: z.boolean().optional(),
  promoPercent: z.coerce.number().int().min(0).max(100).optional().nullable(),
  promoLabel: z.string().optional().nullable()
});
export type UpsertDayConfigBody = z.infer<typeof UpsertDayConfigBodySchema>;
