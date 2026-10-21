import { z } from "zod";

export const AccessLogQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(500).optional()
});
export type AccessLogQuery = z.infer<typeof AccessLogQuerySchema>;
