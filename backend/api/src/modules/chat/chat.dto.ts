import { z } from "zod";

export const SendMessageBodySchema = z.object({
  body: z.string().min(1).max(4000)
});
export type SendMessageBody = z.infer<typeof SendMessageBodySchema>;
