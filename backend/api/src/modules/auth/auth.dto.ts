import { z } from "zod";
import { PasswordSchema } from "../../shared/password.js";

export const LoginBodySchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128)
});
export type LoginBody = z.infer<typeof LoginBodySchema>;

export const RegisterBodySchema = z.object({
  email: z.string().email().max(320),
  password: PasswordSchema,
  profileName: z.string().min(1).max(120).optional(),
  phone: z.string().min(3).max(40).optional()
});
export type RegisterBody = z.infer<typeof RegisterBodySchema>;

export const SetupPasswordBodySchema = z.object({
  token: z.string().trim().min(32).max(128),
  password: PasswordSchema
});
export type SetupPasswordBody = z.infer<typeof SetupPasswordBodySchema>;
