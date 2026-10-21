import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().default(4000),
  APP_ORIGIN: z.string().default("http://localhost:5173"),

  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),

  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(8),

  /** SMTP Brevo (ou autre). Si MAIL_HOST/USER/PASSWORD absents, les mails sont désactivés. */
  MAIL_HOST: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().optional()),
  MAIL_PORT: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number().int().positive().optional()
  ),
  MAIL_USERNAME: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().optional()),
  MAIL_PASSWORD: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().optional()),
  /**
   * Expéditeur enregistré / vérifié dans Brevo (Senders & IPs).
   * Doit être un email valide (ex. contact@domaine.fr), pas un nom d’affichage.
   */
  MAIL_SENDER: z.preprocess((v) => {
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    if (!t) return undefined;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) {
      // eslint-disable-next-line no-console
      console.warn(`[env] MAIL_SENDER ignoré (pas un email valide): "${t}"`);
      return undefined;
    }
    return t;
  }, z.string().email().optional()),
  /** Alias optionnel de MAIL_SENDER (rétrocompat). */
  MAIL_FROM_EMAIL: z.preprocess((v) => {
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    if (!t || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return undefined;
    return t;
  }, z.string().email().optional()),
  MAIL_FROM_NAME: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().optional()),
  /** Destinataire des alertes admin (défaut = ADMIN_EMAIL). */
  MAIL_ADMIN_TO: z.preprocess((v) => {
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    if (!t || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return undefined;
    return t;
  }, z.string().email().optional()),

  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().optional()
});

export type Env = z.infer<typeof EnvSchema>;

export function getEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
}
