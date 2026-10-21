import { z } from "zod";

/** "" / espaces → null (champs formulaire HTML). */
function emptyToNull(v: unknown): unknown {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  return typeof v === "string" ? v.trim() : v;
}

export const DEFAULT_HERO_POINTS =
  "Réservations en direct propriétaire\nPrise de contact téléphonique\nContrat et bail envoyés par la poste\n100 % humain";

export const UpdateSettingsBodySchema = z.object({
  studioName: z.preprocess((v) => {
    const t = emptyToNull(v);
    return t === null ? undefined : t;
  }, z.string().min(1).optional()),
  heroPoints: z.preprocess((v) => {
    if (v === undefined) return undefined;
    if (typeof v !== "string") return "";
    return v
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");
  }, z.string().max(2000).optional()),
  ownerName: z.preprocess(emptyToNull, z.string().max(200).nullable().optional()),
  address: z.preprocess(emptyToNull, z.string().nullable().optional()),
  city: z.preprocess(emptyToNull, z.string().max(80).nullable().optional()),
  phone: z.preprocess(emptyToNull, z.string().nullable().optional()),
  publicEmail: z.preprocess(emptyToNull, z.union([z.string().email(), z.null()]).optional()),
  lodgingType: z.preprocess(emptyToNull, z.string().nullable().optional()),
  surfaceM2: z.preprocess((v) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }, z.number().int().min(0).nullable().optional()),
  equipments: z.array(z.string().min(1)).optional(),
  socialLinks: z.any().optional().nullable(),
  minNights: z.preprocess((v) => {
    if (v === "" || v === null || v === undefined) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  }, z.number().int().min(1).optional()),
  checkInTime: z.preprocess(emptyToNull, z.string().optional().nullable()),
  checkOutTime: z.preprocess(emptyToNull, z.string().optional().nullable()),
  bookingAutoConfirm: z.boolean().optional(),
  maintenanceMode: z.boolean().optional()
});
export type UpdateSettingsBody = z.infer<typeof UpdateSettingsBodySchema>;

export const DEFAULT_PUBLIC_SETTINGS = {
  studioName: "Studio des Grenadiers",
  heroPoints: DEFAULT_HERO_POINTS,
  ownerName: null,
  address: null,
  city: null,
  phone: null,
  publicEmail: null,
  lodgingType: null,
  surfaceM2: null,
  equipments: [] as string[],
  socialLinks: null,
  minNights: 1,
  checkInTime: null,
  checkOutTime: null,
  maintenanceMode: false
};
