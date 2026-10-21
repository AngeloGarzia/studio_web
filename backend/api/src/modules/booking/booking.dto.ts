import { z } from "zod";

export const PublicBookingRequestBodySchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(6),
  notes: z.string().optional(),
  equipment: z.string().optional()
});
export type PublicBookingRequestBody = z.infer<typeof PublicBookingRequestBodySchema>;

export const CreateBookingBodySchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  notes: z.string().optional(),
  equipment: z.string().optional()
});
export type CreateBookingBody = z.infer<typeof CreateBookingBodySchema>;

const AdminBookingClientSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(6).max(40)
});

/** Sites de location externes. Les principales d’abord, puis les autres. */
export const BOOKING_PLATFORMS = [
  "Airbnb",
  "Booking.com",
  "Abritel",
  "Vrbo",
  "Expedia",
  "Tripadvisor",
  "Gîtes de France",
  "Leboncoin",
  "Agoda",
  "Amivac",
  "Belvilla",
  "Casamundo",
  "Clévacances",
  "Cozycozy",
  "Cybevasion",
  "eDreams",
  "FlipKey",
  "Google Voyages",
  "Holidu",
  "HomeToGo",
  "Hotels.com",
  "HousingAnywhere",
  "Interhome",
  "Kayak",
  "Lastminute.com",
  "Le Collectionist",
  "Locasun",
  "Marriott Homes & Villas",
  "Misterb&b",
  "Niumba",
  "Opodo",
  "PAP Vacances",
  "Pierre & Vacances",
  "Plum Guide",
  "Promovacances",
  "Rentalia",
  "Spotahome",
  "Trip.com",
  "TUI",
  "Vacasa",
  "Weekendesk"
] as const;

/** Réservation posée par l’admin sur le logement ouvert : client existant, ou nouveau client enregistré. */
export const AdminCreateBookingBodySchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().trim().max(2000).optional(),
    platform: z.enum(BOOKING_PLATFORMS).optional(),
    residenceAddress: z.string().trim().max(400).optional(),
    firstName: z.string().trim().max(80).optional(),
    lastName: z.string().trim().max(80).optional(),
    clientId: z.string().trim().min(1).optional(),
    client: AdminBookingClientSchema.optional()
  })
  .refine((body) => body.endDate > body.startDate, {
    message: "La date de départ doit être après l’arrivée.",
    path: ["endDate"]
  })
  .refine((body) => Boolean(body.clientId) !== Boolean(body.client), {
    message: "Choisis un client existant ou saisis un nouveau client.",
    path: ["clientId"]
  });
export type AdminCreateBookingBody = z.infer<typeof AdminCreateBookingBodySchema>;

export const AdminUpdateBookingBodySchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().trim().max(2000).optional(),
    platform: z.enum(BOOKING_PLATFORMS).nullable().optional(),
    residenceAddress: z.string().trim().max(400).optional(),
    firstName: z.string().trim().max(80).optional(),
    lastName: z.string().trim().max(80).optional(),
    phone: z.string().trim().max(40).optional()
  })
  .refine((body) => body.endDate > body.startDate, {
    message: "La date de départ doit être après l’arrivée.",
    path: ["endDate"]
  });
export type AdminUpdateBookingBody = z.infer<typeof AdminUpdateBookingBodySchema>;

export const SetBookingStatusBodySchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED"])
});
export type SetBookingStatusBody = z.infer<typeof SetBookingStatusBodySchema>;

export const ProposeBookingBodySchema = z
  .object({
    proposedStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    proposedEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    message: z.string().trim().min(1).max(2000)
  })
  .refine((body) => body.proposedEnd > body.proposedStart, {
    message: "La date de départ doit être après l’arrivée.",
    path: ["proposedEnd"]
  });
export type ProposeBookingBody = z.infer<typeof ProposeBookingBodySchema>;

export const SendQuittanceBodySchema = z
  .object({
    bailleurName: z.string().trim().min(1).max(200),
    bailleurAddress: z.string().trim().max(300),
    bailleurPhone: z.string().trim().max(40),
    bailleurEmail: z.string().trim().max(200),
    tenantName: z.string().trim().min(1).max(800),
    logement: z.string().trim().min(1).max(300),
    periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    rentCents: z.number().int().nonnegative().max(100_000_000),
    chargesCents: z.number().int().nonnegative().max(100_000_000),
    receivedCents: z.number().int().nonnegative().max(100_000_000),
    paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    paymentMethod: z.string().trim().min(1).max(40),
    place: z.string().trim().min(1).max(120),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    feeLines: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(160),
          priceCents: z.number().int().nonnegative().max(100_000_000)
        })
      )
      .max(30)
  })
  .refine((body) => body.periodTo > body.periodFrom, {
    message: "La fin de période doit être après le début.",
    path: ["periodTo"]
  });
export type SendQuittanceBody = z.infer<typeof SendQuittanceBodySchema>;
