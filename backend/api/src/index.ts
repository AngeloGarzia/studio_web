import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { Server } from "socket.io";
import { createServer } from "node:http";
import { z } from "zod";

import { prisma } from "./db.js";
import { clearAuthCookie, optionalAuth, requireAdmin, requireAuth, setAuthCookie, signAuthToken, type AuthedRequest } from "./auth.js";
import { getEnv } from "./env.js";
import { deleteObject, getObjectStream, presignPutObject, putObjectBuffer } from "./s3.js";
import { logAccess } from "./accessLog.js";
import sharp from "sharp";

const env = getEnv();

const app = express();
// Important for correct req.ip behind reverse-proxies (Render, Nginx, etc.)
app.set("trust proxy", true);
app.use(
  cors({
    origin: env.APP_ORIGIN,
    credentials: true
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

const api = express.Router();
// Attach auth info if cookie exists (doesn't force login)
api.use(optionalAuth);
// Log every API call (including anonymous visitors)
api.use(logAccess);
api.get("/health", (_req, res) => res.json({ ok: true }));

/** Route param Express (`string | string[]`) → `string` pour Prisma / logique métier. */
function routeParam(req: express.Request, key: string): string {
  const v = req.params[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

/** Clé yyyy-mm-dd en UTC pour les séjours (alignée sur Booking / DayConfig). */
function bookingNightKeyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type StayPromoRulePricing = Pick<
  { id: string; active: boolean; validFrom: Date; validToInclusive: Date; minStayNights: number; promoPercent: number; label: string | null },
  "id" | "active" | "validFrom" | "validToInclusive" | "minStayNights" | "promoPercent" | "label"
>;

/** Sélectionne une règle applicable : active, fenêtre UTC, durée minimale ; en cas de conflit, % le plus élevé gagne. */
function pickStayPromoRule(nightKeys: string[], rules: StayPromoRulePricing[]): StayPromoRulePricing | null {
  let best: StayPromoRulePricing | null = null;
  for (const r of rules) {
    if (!r.active) continue;
    const from = bookingNightKeyUtc(r.validFrom);
    const to = bookingNightKeyUtc(r.validToInclusive);
    if (from > to) continue;
    if (nightKeys.length < r.minStayNights) continue;
    if (!nightKeys.every((d) => d >= from && d <= to)) continue;
    if (!best || r.promoPercent > best.promoPercent) best = r;
  }
  return best;
}

/** Prix détaillé d'un séjour [start, end) (end = jour de départ exclus, comme Booking). */
async function computeStayPricingSummary(start: Date, end: Date) {
  const startKey = start.toISOString().slice(0, 10);
  const endLast = new Date(end);
  endLast.setUTCDate(endLast.getUTCDate() - 1);
  const endLastKey = endLast.toISOString().slice(0, 10);

  const fromDate = new Date(`${startKey}T00:00:00.000Z`);
  const toDate = new Date(`${endLastKey}T00:00:00.000Z`);

  const nights: Array<{
    day: string;
    priceCents: number;
    promoPercent: number | null;
    promoLabel: string | null;
    promoCents: number;
    finalCents: number;
    missingConfig: boolean;
  }> = [];

  if (toDate >= fromDate) {
    const dayConfigs = await prisma.dayConfig.findMany({
      where: { date: { gte: fromDate, lte: toDate } },
      select: { date: true, priceCents: true, promoPercent: true, promoLabel: true }
    });
    const byDay = new Map(dayConfigs.map((d) => [d.date.toISOString().slice(0, 10), d]));

    for (let d = new Date(fromDate); d <= toDate; d.setUTCDate(d.getUTCDate() + 1)) {
      const day = d.toISOString().slice(0, 10);
      const cfg = byDay.get(day);
      const priceCents = cfg?.priceCents ?? 0;
      const promoPercent = cfg?.promoPercent ?? null;
      const promoLabel = cfg?.promoLabel ?? null;
      const promoCents = promoPercent ? Math.round((priceCents * promoPercent) / 100) : 0;
      const finalCents = Math.max(0, priceCents - promoCents);
      nights.push({ day, priceCents, promoPercent, promoLabel, promoCents, finalCents, missingConfig: !cfg });
    }
  }

  const totalBeforePromoCents = nights.reduce((s, n) => s + n.priceCents, 0);
  const totalPromoCents = nights.reduce((s, n) => s + n.promoCents, 0);
  const totalAfterDayPromosCents = nights.reduce((s, n) => s + n.finalCents, 0);

  const stayPromoRules = await prisma.stayPromoRule.findMany();
  const nightKeys = nights.map((n) => n.day);
  const matchedRule = pickStayPromoRule(nightKeys, stayPromoRules);
  const totalStayPromoCents = matchedRule ? Math.round((totalAfterDayPromosCents * matchedRule.promoPercent) / 100) : 0;
  const totalCents = Math.max(0, totalAfterDayPromosCents - totalStayPromoCents);

  return {
    nightsCount: nights.length,
    startKey,
    endKey: end.toISOString().slice(0, 10),
    nights,
    totalBeforePromoCents,
    totalPromoCents,
    totalAfterDayPromosCents,
    stayPromo: matchedRule
      ? {
          ruleId: matchedRule.id,
          label: matchedRule.label,
          promoPercent: matchedRule.promoPercent,
          promoCents: totalStayPromoCents,
          minStayNights: matchedRule.minStayNights,
          validFrom: bookingNightKeyUtc(matchedRule.validFrom),
          validToInclusive: bookingNightKeyUtc(matchedRule.validToInclusive)
        }
      : null,
    totalStayPromoCents,
    totalCents
  };
}

async function loadActiveAncillaryFeesOrdered() {
  return prisma.ancillaryFee.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, label: true, priceCents: true }
  });
}

function ancillarySnapshotFromFees(fees: { id: string; label: string; priceCents: number }[]) {
  const ancillaryTotalCents = fees.reduce((s, f) => s + f.priceCents, 0);
  const ancillarySnapshot = fees.map((f) => ({ id: f.id, label: f.label, priceCents: f.priceCents }));
  return { ancillaryTotalCents, ancillarySnapshot };
}

/** Texte publié en messagerie interne pour une demande de réservation (admin + client). */
async function buildBookingReservationChatBody(opts: {
  headline: string;
  booking: {
    id: string;
    startDate: Date;
    endDate: Date;
    status: string;
    notes?: string | null;
    equipment?: string | null;
    ancillaryTotalCents: number;
  };
  feeRows: { label: string; priceCents: number }[];
  guest?: { name?: string; email?: string; phone?: string };
  includePricingEstimate: boolean;
}): Promise<string> {
  const { headline, booking, feeRows, guest, includePricingEstimate } = opts;
  const lines: string[] = [
    headline,
    `Statut: ${booking.status}`,
    `Période (arrivée → départ): ${booking.startDate.toISOString().slice(0, 10)} → ${booking.endDate.toISOString().slice(0, 10)}`
  ];
  if (guest?.name?.trim()) lines.push(`Nom: ${guest.name.trim()}`);
  if (guest?.email?.trim()) lines.push(`Email: ${guest.email.trim()}`);
  if (guest?.phone?.trim()) lines.push(`Téléphone: ${guest.phone.trim()}`);
  if (booking.notes?.trim()) lines.push(`Message / notes: ${booking.notes.trim()}`);
  if (booking.equipment?.trim()) lines.push(`Équipement / besoins: ${booking.equipment.trim()}`);
  if (booking.ancillaryTotalCents > 0) {
    lines.push(
      `Frais annexes (${(booking.ancillaryTotalCents / 100).toFixed(2)} €): ` +
        feeRows.map((f) => `${f.label} (${(f.priceCents / 100).toFixed(2)} €)`).join(", ")
    );
  } else {
    lines.push("Frais annexes: aucun");
  }
  if (includePricingEstimate) {
    try {
      const p = await computeStayPricingSummary(booking.startDate, booking.endDate);
      lines.push("");
      lines.push("Estimation tarifaire hébergement (nuits, promos jour et promo séjour éventuelles):");
      lines.push(`  Nombre de nuits: ${p.nightsCount}`);
      lines.push(`  Total hébergement estimé: ${(p.totalCents / 100).toFixed(2)} €`);
      if (p.stayPromo) {
        lines.push(
          `  Promo séjour: ${p.stayPromo.promoPercent}%${p.stayPromo.label ? ` — ${p.stayPromo.label}` : ""}`
        );
      }
    } catch {
      /* estimation indisponible */
    }
  }
  lines.push("");
  lines.push(`Identifiant réservation: ${booking.id}`);
  return lines.join("\n");
}

// --- Auth ---
api.post("/auth/login", async (req, res) => {
  const Body = z.object({ email: z.string().email(), password: z.string().min(1) });
  const { email, password } = Body.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

  const token = signAuthToken({ sub: user.id, role: user.role, email: user.email });
  setAuthCookie(res, token);
  return res.json({ id: user.id, email: user.email, role: user.role, profileName: user.profileName });
});

api.post("/auth/logout", async (_req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true });
});

api.post("/auth/register", async (req, res) => {
  const Body = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    profileName: z.string().min(1).optional(),
    phone: z.string().min(3).optional()
  });
  const { email, password, profileName, phone } = Body.parse(req.body);

  const emailNorm = email.trim().toLowerCase();
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" } }
  });
  if (existing) {
    const anonId = getAnonUserId(req);
    const sameAnonGuest =
      existing.role === "CLIENT" &&
      anonId === existing.id &&
      existing.email.trim().toLowerCase() === emailNorm;
    if (!sameAnonGuest) {
      return res.status(409).json({ error: "EMAIL_TAKEN" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        ...(profileName?.trim() ? { profileName: profileName.trim() } : {}),
        ...(phone?.trim() ? { phone: phone.trim() } : {})
      }
    });
    const token = signAuthToken({ sub: user.id, role: user.role, email: user.email });
    setAuthCookie(res, token);
    return res.json({ id: user.id, email: user.email, role: user.role, profileName: user.profileName });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email: email.trim(), passwordHash, role: "CLIENT", profileName, phone }
  });

  const token = signAuthToken({ sub: user.id, role: user.role, email: user.email });
  setAuthCookie(res, token);
  return res.json({ id: user.id, email: user.email, role: user.role, profileName: user.profileName });
});

api.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.sub } });
  if (!user) return res.status(401).json({ error: "UNAUTHENTICATED" });
  return res.json({ id: user.id, email: user.email, role: user.role, profileName: user.profileName, phone: user.phone });
});

// --- Public: settings + portfolio + availability ---
api.post("/public/ping", (_req, res) => {
  // Used by frontend on first load to register anonymous visits in DB.
  return res.json({ ok: true });
});

function getAnonUserId(req: any): string | undefined {
  const raw = req.cookies?.sdg_anon;
  return typeof raw === "string" ? raw : undefined;
}

function setAnonCookie(res: any, userId: string) {
  const isProd = env.NODE_ENV === "production";
  res.cookie("sdg_anon", userId, {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    path: "/"
  });
}

api.post("/public/booking-request", async (req, res) => {
  const Body = z.object({
    startDate: z.string(),
    endDate: z.string(),
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(6),
    notes: z.string().optional(),
    equipment: z.string().optional()
  });
  const { startDate, endDate, name, email, phone, notes, equipment } = Body.parse(req.body);
  const emailClean = email.trim();
  const phoneClean = phone.trim();

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime())) return res.status(400).json({ error: "INVALID_START" });
  if (isNaN(end.getTime())) return res.status(400).json({ error: "INVALID_END" });
  if (end <= start) return res.status(400).json({ error: "INVALID_RANGE" });

  // Enforce day rules (if configured): arrivée = 1er jour du séjour, départ = jour de départ (end exclusif côté nuitées).
  const startKey = start.toISOString().slice(0, 10);
  const checkoutKey = end.toISOString().slice(0, 10);
  const startCfg = await prisma.dayConfig.findUnique({ where: { date: new Date(`${startKey}T00:00:00.000Z`) } }).catch(() => null);
  if (startCfg && !startCfg.arrivalAllowed) return res.status(409).json({ error: "ARRIVAL_NOT_ALLOWED" });
  const checkoutCfg = await prisma.dayConfig.findUnique({ where: { date: new Date(`${checkoutKey}T00:00:00.000Z`) } }).catch(() => null);
  if (checkoutCfg && !checkoutCfg.departureAllowed) return res.status(409).json({ error: "DEPARTURE_NOT_ALLOWED" });

  // availability checks
  const overlap = await prisma.booking.findFirst({
    where: {
      status: { in: ["PENDING", "CONFIRMED"] },
      startDate: { lt: end },
      endDate: { gt: start }
    },
    select: { id: true }
  });
  if (overlap) return res.status(409).json({ error: "DATES_UNAVAILABLE" });
  const blockOverlap = await prisma.calendarBlock.findFirst({
    where: { startDate: { lt: end }, endDate: { gt: start } },
    select: { id: true }
  });
  if (blockOverlap) return res.status(409).json({ error: "DATES_UNAVAILABLE" });

  // Create or reuse a "client fiche" by email/phone (no duplicates)
  let client =
    (await prisma.user.findFirst({
      where: { email: { equals: emailClean, mode: "insensitive" } }
    }).catch(() => null)) ?? (await prisma.user.findFirst({ where: { phone: phoneClean } }).catch(() => null));

  if (!client) {
    const passwordHash = await bcrypt.hash(Math.random().toString(36).slice(2) + Date.now().toString(36), 10);
    client = await prisma.user.create({
      data: {
        email: emailClean,
        passwordHash,
        role: "CLIENT",
        profileName: name,
        phone: phoneClean
      }
    });
  } else {
    // keep the fiche up-to-date
    const shouldUpdateEmail =
      client.email.endsWith("@anon.local") || client.email.startsWith("anon_");
    const data: any = {
      profileName: name || client.profileName,
      phone: phoneClean || client.phone
    };
    if (shouldUpdateEmail && emailClean) data.email = emailClean;
    await prisma.user.update({ where: { id: client.id }, data }).catch(() => {});
  }
  setAnonCookie(res, client.id);

  const settings = await prisma.siteSettings.findFirst();
  const autoConfirm = settings?.bookingAutoConfirm ?? false;
  const feeRows = await loadActiveAncillaryFeesOrdered();
  const { ancillaryTotalCents, ancillarySnapshot } = ancillarySnapshotFromFees(feeRows);

  const booking = await prisma.booking.create({
    data: {
      userId: client.id,
      startDate: start,
      endDate: end,
      notes,
      equipment,
      status: autoConfirm ? "CONFIRMED" : "PENDING",
      ancillaryTotalCents,
      ancillarySnapshot
    }
  });

  const conv =
    (await prisma.conversation.findUnique({ where: { clientId: client.id } })) ??
    (await prisma.conversation.create({ data: { clientId: client.id } }));

  const bodyText = await buildBookingReservationChatBody({
    headline: "Nouvelle demande de réservation (sans compte)",
    booking: {
      id: booking.id,
      startDate: start,
      endDate: end,
      status: booking.status,
      notes,
      equipment,
      ancillaryTotalCents
    },
    feeRows,
    guest: { name, email: emailClean, phone: phoneClean },
    includePricingEstimate: true
  });

  const chatMessage = await prisma.message.create({
    data: { conversationId: conv.id, senderId: client.id, body: bodyText }
  });

  await prisma.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });
  io.to(`conv:${conv.id}`).emit("chat:new_message", { conversationId: conv.id, message: chatMessage });

  return res.json({ ok: true, bookingId: booking.id, conversationId: conv.id });
});
api.get("/public/settings", async (_req, res) => {
  const settings = await prisma.siteSettings.findFirst();
  if (!settings) {
    return res.json({
      studioName: "Studio des Grenadiers",
      ownerName: null,
      address: null,
      phone: null,
      publicEmail: null,
      lodgingType: null,
      surfaceM2: null,
      equipments: [],
      socialLinks: null,
      minNights: 1,
      checkInTime: null,
      checkOutTime: null,
      bookingAutoConfirm: false,
      maintenanceMode: false
    });
  }
  return res.json(settings);
});

/** Frais annexes actifs (lecture publique pour la page infos pratiques). */
api.get("/public/ancillary-fees", async (_req, res) => {
  const rows = await prisma.ancillaryFee.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, label: true, priceCents: true }
  });
  return res.json(rows);
});

api.get("/public/portfolio", async (_req, res) => {
  const media = await prisma.portfolioMedia.findMany({ where: { isPublished: true }, orderBy: [{ order: "asc" }, { createdAt: "desc" }] });
  return res.json(
    media.map((m) => ({
      ...m,
      thumbUrl: m.thumbS3Key ? `/api/public/media/${m.id}?variant=thumb` : null,
      url: `/api/public/media/${m.id}`
    }))
  );
});

/** Promotions séjour publiées (actives uniquement ; période dont la dernière nuit peut encore être dans le futur). */
api.get("/public/stay-promo-rules", async (_req, res) => {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const rows = await prisma.stayPromoRule.findMany({
    where: { active: true, validToInclusive: { gte: todayStart } },
    orderBy: [{ validFrom: "asc" }, { minStayNights: "desc" }],
    select: {
      id: true,
      validFrom: true,
      validToInclusive: true,
      minStayNights: true,
      promoPercent: true,
      label: true
    }
  });
  return res.json(rows);
});

/** Estimation tarifaire pour une période (même logique que la fiche admin), sans réservation. */
api.post("/public/booking-pricing-preview", async (req, res) => {
  const Body = z.object({ startDate: z.string(), endDate: z.string() });
  const { startDate, endDate } = Body.parse(req.body);
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime())) return res.status(400).json({ error: "INVALID_START" });
  if (isNaN(end.getTime())) return res.status(400).json({ error: "INVALID_END" });
  if (end <= start) return res.status(400).json({ error: "INVALID_RANGE" });
  const pricing = await computeStayPricingSummary(start, end);
  const feeRows = await loadActiveAncillaryFeesOrdered();
  const { ancillaryTotalCents, ancillarySnapshot } = ancillarySnapshotFromFees(feeRows);
  return res.json({
    ...pricing,
    ancillaryFees: feeRows,
    ancillaryTotalCents,
    grandTotalCents: pricing.totalCents + ancillaryTotalCents
  });
});

api.get("/public/media/:id", async (req, res) => {
  const media = await prisma.portfolioMedia.findUnique({ where: { id: routeParam(req, "id") } });
  if (!media || !media.isPublished) return res.status(404).end();

  try {
    const variant = typeof req.query.variant === "string" ? req.query.variant : undefined;
    const key = variant === "thumb" && media.thumbS3Key ? media.thumbS3Key : media.s3Key;
    const obj = await getObjectStream(key);
    if (obj.ContentType) res.setHeader("Content-Type", obj.ContentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    // @ts-expect-error Body is a stream in Node
    return obj.Body.pipe(res);
  } catch {
    return res.status(404).end();
  }
});

api.get("/public/calendar", async (req, res) => {
  const Query = z.object({
    from: z.string().optional(), // ISO date
    to: z.string().optional()
  });
  const { from, to } = Query.parse(req.query);
  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1);
  // Fenêtre large par défaut : séjours longs et périodes à cheval sur plusieurs mois sans refetch manuel.
  const toDate = to
    ? new Date(to)
    : (() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 24);
        return d;
      })();

  const [bookings, blocks, dayConfigs] = await Promise.all([
    prisma.booking.findMany({
      where: {
        status: { in: ["PENDING", "CONFIRMED"] },
        startDate: { lt: toDate },
        endDate: { gt: fromDate }
      },
      select: { id: true, startDate: true, endDate: true, status: true }
    }),
    prisma.calendarBlock.findMany({
      where: { startDate: { lt: toDate }, endDate: { gt: fromDate } },
      select: { id: true, startDate: true, endDate: true, reason: true }
    }),
    prisma.dayConfig.findMany({
      where: { date: { gte: fromDate, lte: toDate } },
      select: { id: true, date: true, priceCents: true, arrivalAllowed: true, departureAllowed: true, promoPercent: true, promoLabel: true }
    })
  ]);

  return res.json({ bookings, blocks, dayConfigs });
});

// --- Client: request booking + see own bookings ---
api.post("/bookings", requireAuth, async (req: AuthedRequest, res) => {
  const Body = z.object({
    startDate: z.string(),
    endDate: z.string(),
    notes: z.string().optional(),
    equipment: z.string().optional()
  });
  const { startDate, endDate, notes, equipment } = Body.parse(req.body);

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (!(start instanceof Date) || isNaN(start.getTime())) return res.status(400).json({ error: "INVALID_START" });
  if (!(end instanceof Date) || isNaN(end.getTime())) return res.status(400).json({ error: "INVALID_END" });
  if (end <= start) return res.status(400).json({ error: "INVALID_RANGE" });

  // Enforce day rules (if configured): arrivée = 1er jour, départ = jour de checkout (end exclusif côté nuitées).
  const startKey = start.toISOString().slice(0, 10);
  const checkoutKey = end.toISOString().slice(0, 10);
  const startCfg = await prisma.dayConfig.findUnique({ where: { date: new Date(`${startKey}T00:00:00.000Z`) } }).catch(() => null);
  if (startCfg && !startCfg.arrivalAllowed) return res.status(409).json({ error: "ARRIVAL_NOT_ALLOWED" });
  const checkoutCfg = await prisma.dayConfig.findUnique({ where: { date: new Date(`${checkoutKey}T00:00:00.000Z`) } }).catch(() => null);
  if (checkoutCfg && !checkoutCfg.departureAllowed) return res.status(409).json({ error: "DEPARTURE_NOT_ALLOWED" });

  // Prevent overlap with blocks or confirmed/pending bookings
  const overlap = await prisma.booking.findFirst({
    where: {
      status: { in: ["PENDING", "CONFIRMED"] },
      startDate: { lt: end },
      endDate: { gt: start }
    },
    select: { id: true }
  });
  if (overlap) return res.status(409).json({ error: "DATES_UNAVAILABLE" });

  const blockOverlap = await prisma.calendarBlock.findFirst({
    where: { startDate: { lt: end }, endDate: { gt: start } },
    select: { id: true }
  });
  if (blockOverlap) return res.status(409).json({ error: "DATES_UNAVAILABLE" });

  const settings = await prisma.siteSettings.findFirst();
  const autoConfirm = settings?.bookingAutoConfirm ?? false;

  const feeRows = await loadActiveAncillaryFeesOrdered();
  const { ancillaryTotalCents, ancillarySnapshot } = ancillarySnapshotFromFees(feeRows);

  const booking = await prisma.booking.create({
    data: {
      userId: req.auth!.sub,
      startDate: start,
      endDate: end,
      notes,
      equipment,
      status: autoConfirm ? "CONFIRMED" : "PENDING",
      ancillaryTotalCents,
      ancillarySnapshot
    }
  });

  if (req.auth!.role === "CLIENT") {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.sub } });
    if (user) {
      const conv =
        (await prisma.conversation.findUnique({ where: { clientId: user.id } })) ??
        (await prisma.conversation.create({ data: { clientId: user.id } }));

      const bodyText = await buildBookingReservationChatBody({
        headline: "Nouvelle demande de réservation (compte client)",
        booking: {
          id: booking.id,
          startDate: start,
          endDate: end,
          status: booking.status,
          notes,
          equipment,
          ancillaryTotalCents
        },
        feeRows,
        guest: {
          name: user.profileName ?? undefined,
          email: user.email,
          phone: user.phone ?? undefined
        },
        includePricingEstimate: true
      });

      const chatMessage = await prisma.message.create({
        data: { conversationId: conv.id, senderId: user.id, body: bodyText }
      });
      await prisma.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });
      io.to(`conv:${conv.id}`).emit("chat:new_message", { conversationId: conv.id, message: chatMessage });
    }
  }

  return res.json(booking);
});

api.get("/bookings/me", requireAuth, async (req: AuthedRequest, res) => {
  const bookings = await prisma.booking.findMany({ where: { userId: req.auth!.sub }, orderBy: { createdAt: "desc" } });
  return res.json(bookings);
});

// --- Admin: manage bookings + blocks + portfolio + settings ---
api.get("/admin/bookings", requireAdmin, async (_req, res) => {
  const bookings = await prisma.booking.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true, profileName: true, phone: true } } }
  });
  return res.json(bookings);
});

api.post("/admin/bookings/:id/status", requireAdmin, async (req, res) => {
  const Body = z.object({ status: z.enum(["PENDING", "CONFIRMED", "CANCELLED"]) });
  const { status } = Body.parse(req.body);
  const booking = await prisma.booking.update({ where: { id: routeParam(req, "id") }, data: { status } });
  return res.json(booking);
});

api.get("/admin/bookings/:id", requireAdmin, async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: routeParam(req, "id") },
    include: { user: { select: { id: true, email: true, profileName: true, phone: true } } }
  });
  if (!booking) return res.status(404).json({ error: "NOT_FOUND" });

  const pricing = await computeStayPricingSummary(new Date(booking.startDate), new Date(booking.endDate));
  const snap = booking.ancillarySnapshot as Array<{ id?: string; label: string; priceCents: number }> | null;
  const ancillaryFees = Array.isArray(snap) ? snap : [];
  const ancillaryTotalCents = booking.ancillaryTotalCents ?? ancillaryFees.reduce((s, x) => s + (x.priceCents ?? 0), 0);
  const grandTotalCents = pricing.totalCents + ancillaryTotalCents;

  return res.json({
    booking,
    pricing: {
      ...pricing,
      ancillaryFees,
      ancillaryTotalCents,
      grandTotalCents
    }
  });
});

api.get("/admin/stay-promo-rules", requireAdmin, async (_req, res) => {
  const rows = await prisma.stayPromoRule.findMany({
    orderBy: [{ validFrom: "asc" }, { minStayNights: "desc" }, { promoPercent: "desc" }]
  });
  return res.json(rows);
});

api.post("/admin/stay-promo-rules", requireAdmin, async (req, res) => {
  const Body = z.object({
    validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    validToInclusive: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    minStayNights: z.coerce.number().int().min(1).max(366),
    promoPercent: z.coerce.number().int().min(1).max(100),
    label: z.string().max(200).optional().nullable(),
    active: z.boolean().optional().default(true)
  });
  const data = Body.parse(req.body);

  const vf = new Date(`${data.validFrom}T00:00:00.000Z`);
  const vt = new Date(`${data.validToInclusive}T00:00:00.000Z`);
  if (isNaN(vf.getTime()) || isNaN(vt.getTime())) return res.status(400).json({ error: "INVALID_DATE" });
  if (vt < vf) return res.status(400).json({ error: "INVALID_RANGE" });

  const row = await prisma.stayPromoRule.create({
    data: {
      validFrom: vf,
      validToInclusive: vt,
      minStayNights: data.minStayNights,
      promoPercent: data.promoPercent,
      label: data.label ?? null,
      active: data.active ?? true
    }
  });
  return res.json(row);
});

api.patch("/admin/stay-promo-rules/:id", requireAdmin, async (req, res) => {
  const Body = z.object({
    validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    validToInclusive: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    minStayNights: z.coerce.number().int().min(1).max(366).optional(),
    promoPercent: z.coerce.number().int().min(1).max(100).optional(),
    label: z.string().max(200).optional().nullable(),
    active: z.boolean().optional()
  });
  const data = Body.parse(req.body);

  const existing = await prisma.stayPromoRule.findUnique({ where: { id: routeParam(req, "id") } });
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });

  const nextFrom = data.validFrom != null ? new Date(`${data.validFrom}T00:00:00.000Z`) : existing.validFrom;
  const nextTo = data.validToInclusive != null ? new Date(`${data.validToInclusive}T00:00:00.000Z`) : existing.validToInclusive;
  if (isNaN(nextFrom.getTime()) || isNaN(nextTo.getTime())) return res.status(400).json({ error: "INVALID_DATE" });
  if (nextTo < nextFrom) return res.status(400).json({ error: "INVALID_RANGE" });

  const updated = await prisma.stayPromoRule.update({
    where: { id: routeParam(req, "id") },
    data: {
      ...(data.validFrom != null ? { validFrom: nextFrom } : {}),
      ...(data.validToInclusive != null ? { validToInclusive: nextTo } : {}),
      ...(data.minStayNights !== undefined ? { minStayNights: data.minStayNights } : {}),
      ...(data.promoPercent !== undefined ? { promoPercent: data.promoPercent } : {}),
      ...(data.label !== undefined ? { label: data.label } : {}),
      ...(data.active !== undefined ? { active: data.active } : {})
    }
  });
  return res.json(updated);
});

api.delete("/admin/stay-promo-rules/:id", requireAdmin, async (req, res) => {
  try {
    await prisma.stayPromoRule.delete({ where: { id: routeParam(req, "id") } });
  } catch {
    return res.status(404).json({ error: "NOT_FOUND" });
  }
  return res.json({ ok: true });
});

api.post("/admin/blocks", requireAdmin, async (req, res) => {
  const Body = z.object({ startDate: z.string(), endDate: z.string(), reason: z.string().optional() });
  const { startDate, endDate, reason } = Body.parse(req.body);
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (end <= start) return res.status(400).json({ error: "INVALID_RANGE" });
  const block = await prisma.calendarBlock.create({ data: { startDate: start, endDate: end, reason } });
  return res.json(block);
});

api.delete("/admin/blocks/:id", requireAdmin, async (req, res) => {
  await prisma.calendarBlock.delete({ where: { id: routeParam(req, "id") } });
  return res.json({ ok: true });
});

api.post("/admin/blocks/clear", requireAdmin, async (req, res) => {
  const Body = z.object({ startDate: z.string(), endDate: z.string() });
  const { startDate, endDate } = Body.parse(req.body);
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return res.status(400).json({ error: "INVALID_RANGE" });
  if (end <= start) return res.status(400).json({ error: "INVALID_RANGE" });

  const result = await prisma.calendarBlock.deleteMany({
    where: { startDate: { lt: end }, endDate: { gt: start } }
  });
  return res.json({ ok: true, deleted: result.count });
});

api.post("/admin/blocks/unblock-day", requireAdmin, async (req, res) => {
  const Body = z.object({ day: z.string() }); // YYYY-MM-DD
  const { day } = Body.parse(req.body);
  const dayStart = new Date(`${day}T00:00:00.000Z`);
  if (isNaN(dayStart.getTime())) return res.status(400).json({ error: "INVALID_DAY" });
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const overlapping = await prisma.calendarBlock.findMany({
    where: { startDate: { lt: dayEnd }, endDate: { gt: dayStart } },
    select: { id: true, startDate: true, endDate: true, reason: true }
  });

  if (overlapping.length === 0) return res.json({ ok: true, updated: 0 });

  const ops: any[] = [];
  for (const blk of overlapping) {
    // remove original block
    ops.push(prisma.calendarBlock.delete({ where: { id: blk.id } }));
    // left part
    if (blk.startDate < dayStart) {
      ops.push(
        prisma.calendarBlock.create({
          data: { startDate: blk.startDate, endDate: dayStart, reason: blk.reason ?? undefined }
        })
      );
    }
    // right part
    if (blk.endDate > dayEnd) {
      ops.push(
        prisma.calendarBlock.create({
          data: { startDate: dayEnd, endDate: blk.endDate, reason: blk.reason ?? undefined }
        })
      );
    }
  }

  await prisma.$transaction(ops);
  return res.json({ ok: true, updated: overlapping.length });
});

/** Jours YYYY-MM-DD de `fromYmd` à `toYmd` inclus (UTC, pas d’entrée si range invalide). */
function inclusiveUtcNightKeys(fromYmd: string, toYmd: string): string[] {
  const keys: string[] = [];
  let anchor = Date.parse(`${fromYmd}T12:00:00.000Z`);
  const endAnchor = Date.parse(`${toYmd}T12:00:00.000Z`);
  if (!Number.isFinite(anchor) || !Number.isFinite(endAnchor) || endAnchor < anchor) return keys;
  for (; anchor <= endAnchor; anchor += 86400000) {
    keys.push(new Date(anchor).toISOString().slice(0, 10));
  }
  return keys;
}

api.put("/admin/day-config", requireAdmin, async (req, res) => {
  const Body = z.object({
    from: z.string(), // YYYY-MM-DD
    to: z.string(), // YYYY-MM-DD
    priceCents: z.coerce.number().int().min(0),
    arrivalAllowed: z.boolean().optional(),
    departureAllowed: z.boolean().optional(),
    promoPercent: z.coerce.number().int().min(0).max(100).optional().nullable(),
    promoLabel: z.string().optional().nullable()
  });
  const data = Body.parse(req.body);

  const fromDate = new Date(`${data.from}T00:00:00.000Z`);
  const toDate = new Date(`${data.to}T00:00:00.000Z`);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return res.status(400).json({ error: "INVALID_RANGE" });
  if (toDate < fromDate) return res.status(400).json({ error: "INVALID_RANGE" });

  const nightKeys = inclusiveUtcNightKeys(data.from, data.to);
  if (nightKeys.length === 0) return res.status(400).json({ error: "INVALID_RANGE" });

  const results = await prisma.$transaction(
    nightKeys.map((ymd) =>
      prisma.dayConfig.upsert({
        where: { date: new Date(`${ymd}T00:00:00.000Z`) },
        create: {
          date: new Date(`${ymd}T00:00:00.000Z`),
          priceCents: data.priceCents,
          arrivalAllowed: data.arrivalAllowed ?? true,
          departureAllowed: data.departureAllowed ?? true,
          promoPercent: data.promoPercent ?? null,
          promoLabel: data.promoLabel ?? null
        },
        update: {
          priceCents: data.priceCents,
          arrivalAllowed: data.arrivalAllowed ?? true,
          departureAllowed: data.departureAllowed ?? true,
          promoPercent: data.promoPercent ?? null,
          promoLabel: data.promoLabel ?? null
        }
      })
    )
  );

  return res.json({ ok: true, count: results.length });
});

api.get("/admin/portfolio", requireAdmin, async (_req, res) => {
  const media = await prisma.portfolioMedia.findMany({ orderBy: [{ order: "asc" }, { createdAt: "desc" }] });
  return res.json(
    media.map((m) => ({
      ...m,
      thumbUrl: m.thumbS3Key ? `/api/public/media/${m.id}?variant=thumb` : null,
      url: `/api/public/media/${m.id}`
    }))
  );
});

api.post("/admin/portfolio/upload", requireAdmin, async (req, res) => {
  const Body = z.object({
    title: z.string().optional(),
    type: z.enum(["image", "video"]),
    filename: z.string().min(1),
    contentType: z.string().min(1),
    isPublished: z.boolean().optional()
  });
  const { title, type, filename, contentType, isPublished } = Body.parse(req.body);

  // basic whitelist
  const allowed = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
    "video/quicktime"
  ]);
  if (!allowed.has(contentType)) return res.status(400).json({ error: "UNSUPPORTED_MEDIA_TYPE" });

  const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  const s3Key = `portfolio/${Date.now()}_${safeName}`;

  const created = await prisma.portfolioMedia.create({
    data: {
      title,
      type,
      s3Key,
      publicUrl: null,
      isPublished: isPublished ?? true
    }
  });

  try {
    const { uploadUrl } = await presignPutObject(s3Key, contentType);
    return res.json({ media: { ...created, url: `/api/public/media/${created.id}` }, uploadUrl });
  } catch (e: any) {
    // rollback DB row if S3 not configured
    await prisma.portfolioMedia.delete({ where: { id: created.id } }).catch(() => {});
    return res.status(400).json({ error: String(e?.message ?? "S3_ERROR") });
  }
});

async function streamToBuffer(body: any): Promise<Buffer> {
  if (!body) return Buffer.from([]);
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

api.post("/admin/portfolio/:id/thumbnail", requireAdmin, async (req, res) => {
  const media = await prisma.portfolioMedia.findUnique({ where: { id: routeParam(req, "id") } });
  if (!media) return res.status(404).json({ error: "NOT_FOUND" });
  if (media.type !== "image") return res.status(400).json({ error: "NOT_AN_IMAGE" });

  try {
    const obj = await getObjectStream(media.s3Key);
    const buf = await streamToBuffer((obj as any).Body);
    const thumb = await sharp(buf)
      .rotate()
      .resize(360, 240, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 78 })
      .toBuffer();

    const thumbKey = `portfolio/thumbs/${media.id}.jpg`;
    await putObjectBuffer(thumbKey, thumb, "image/jpeg");

    const updated = await prisma.portfolioMedia.update({ where: { id: media.id }, data: { thumbS3Key: thumbKey } });
    return res.json({ ok: true, media: { ...updated, thumbUrl: `/api/public/media/${media.id}?variant=thumb`, url: `/api/public/media/${media.id}` } });
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message ?? "THUMBNAIL_FAILED") });
  }
});

api.post("/admin/portfolio/thumbnails/backfill", requireAdmin, async (_req, res) => {
  const targets = await prisma.portfolioMedia.findMany({
    where: { type: "image", thumbS3Key: null },
    select: { id: true, s3Key: true }
  });

  let ok = 0;
  let failed = 0;

  for (const t of targets) {
    try {
      const obj = await getObjectStream(t.s3Key);
      const buf = await streamToBuffer((obj as any).Body);
      const thumb = await sharp(buf)
        .rotate()
        .resize(360, 240, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 78 })
        .toBuffer();

      const thumbKey = `portfolio/thumbs/${t.id}.jpg`;
      await putObjectBuffer(thumbKey, thumb, "image/jpeg");
      await prisma.portfolioMedia.update({ where: { id: t.id }, data: { thumbS3Key: thumbKey } });
      ok++;
    } catch {
      failed++;
    }
  }

  return res.json({ ok: true, total: targets.length, generated: ok, failed });
});

api.patch("/admin/portfolio/:id", requireAdmin, async (req, res) => {
  const Body = z.object({
    title: z.string().optional(),
    publicUrl: z.string().url().nullable().optional(),
    order: z.coerce.number().optional(),
    isPublished: z.boolean().optional()
  });
  const data = Body.parse(req.body);
  const updated = await prisma.portfolioMedia.update({ where: { id: routeParam(req, "id") }, data });
  return res.json(updated);
});

api.delete("/admin/portfolio/:id", requireAdmin, async (req, res) => {
  const media = await prisma.portfolioMedia.findUnique({ where: { id: routeParam(req, "id") } });
  if (media) {
    await prisma.portfolioMedia.delete({ where: { id: routeParam(req, "id") } });
    await deleteObject(media.s3Key).catch(() => {});
    if (media.thumbS3Key) await deleteObject(media.thumbS3Key).catch(() => {});
  }
  return res.json({ ok: true });
});

api.get("/admin/ancillary-fees", requireAdmin, async (_req, res) => {
  const rows = await prisma.ancillaryFee.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });
  return res.json(rows);
});

api.post("/admin/ancillary-fees", requireAdmin, async (req, res) => {
  const Body = z.object({
    label: z.string().min(1).max(200),
    priceCents: z.coerce.number().int().min(0).max(10_000_000),
    active: z.boolean().optional().default(true),
    sortOrder: z.coerce.number().int().optional().default(0)
  });
  const data = Body.parse(req.body);
  const row = await prisma.ancillaryFee.create({
    data: {
      label: data.label.trim(),
      priceCents: data.priceCents,
      active: data.active ?? true,
      sortOrder: data.sortOrder ?? 0
    }
  });
  return res.json(row);
});

api.patch("/admin/ancillary-fees/:id", requireAdmin, async (req, res) => {
  const Body = z.object({
    label: z.string().min(1).max(200).optional(),
    priceCents: z.coerce.number().int().min(0).max(10_000_000).optional(),
    active: z.boolean().optional(),
    sortOrder: z.coerce.number().int().optional()
  });
  const data = Body.parse(req.body);
  const id = routeParam(req, "id");
  const existing = await prisma.ancillaryFee.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
  const row = await prisma.ancillaryFee.update({
    where: { id },
    data: {
      ...(data.label != null ? { label: data.label.trim() } : {}),
      ...(data.priceCents != null ? { priceCents: data.priceCents } : {}),
      ...(data.active != null ? { active: data.active } : {}),
      ...(data.sortOrder != null ? { sortOrder: data.sortOrder } : {})
    }
  });
  return res.json(row);
});

api.delete("/admin/ancillary-fees/:id", requireAdmin, async (req, res) => {
  const id = routeParam(req, "id");
  const ex = await prisma.ancillaryFee.findUnique({ where: { id } });
  if (!ex) return res.status(404).json({ error: "NOT_FOUND" });
  await prisma.ancillaryFee.delete({ where: { id } });
  return res.json({ ok: true });
});

api.get("/admin/settings", requireAdmin, async (_req, res) => {
  const settings = await prisma.siteSettings.findFirst();
  if (!settings) return res.json(null);
  return res.json(settings);
});

api.put("/admin/settings", requireAdmin, async (req, res) => {
  const Body = z.object({
    studioName: z.string().min(1).optional(),
    ownerName: z.string().max(200).optional().nullable(),
    address: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    publicEmail: z.string().email().optional().nullable(),
    lodgingType: z.string().optional().nullable(),
    surfaceM2: z.coerce.number().int().min(0).optional().nullable(),
    equipments: z.array(z.string().min(1)).optional(),
    socialLinks: z.any().optional().nullable(),
    minNights: z.coerce.number().int().min(1).optional(),
    checkInTime: z.string().optional().nullable(),
    checkOutTime: z.string().optional().nullable(),
    bookingAutoConfirm: z.boolean().optional(),
    maintenanceMode: z.boolean().optional()
  });
  const b = Body.parse(req.body);

  const data: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => {
    if (v !== undefined) data[k] = v;
  };
  set("studioName", b.studioName);
  set("ownerName", b.ownerName);
  set("address", b.address);
  set("phone", b.phone);
  set("publicEmail", b.publicEmail);
  set("lodgingType", b.lodgingType);
  set("surfaceM2", b.surfaceM2);
  set("equipments", b.equipments);
  set("socialLinks", b.socialLinks);
  set("minNights", b.minNights);
  set("checkInTime", b.checkInTime);
  set("checkOutTime", b.checkOutTime);
  set("bookingAutoConfirm", b.bookingAutoConfirm);
  set("maintenanceMode", b.maintenanceMode);

  const existing = await prisma.siteSettings.findFirst();
  const settings = existing
    ? await prisma.siteSettings.update({ where: { id: existing.id }, data: data as any })
    : await prisma.siteSettings.create({
        data: { studioName: b.studioName ?? "Studio des Grenadiers", ...(data as any) }
      });
  return res.json(settings);
});

api.get("/admin/access-logs", requireAdmin, async (req, res) => {
  const Query = z.object({
    take: z.coerce.number().int().min(1).max(500).optional()
  });
  const { take } = Query.parse(req.query);
  const logs = await prisma.accessLog.findMany({ orderBy: { createdAt: "desc" }, take: take ?? 200 });
  return res.json(logs);
});

// --- Messagerie interne (REST + Socket.IO) ---
api.get("/chat/conversation", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.auth!.sub;
  const role = req.auth!.role;

  if (role === "CLIENT") {
    const conv =
      (await prisma.conversation.findUnique({ where: { clientId: userId } })) ??
      (await prisma.conversation.create({ data: { clientId: userId } }));
    return res.json(conv);
  }

  // admin: liste des conversations (+ non lus côté admin : messages clients pas encore ouverts)
  const convs = await prisma.conversation.findMany({
    orderBy: { updatedAt: "desc" },
    include: { client: { select: { email: true, profileName: true } } }
  });
  const unreadRows = await prisma.message.groupBy({
    by: ["conversationId"],
    where: { readByAdminAt: null, sender: { role: "CLIENT" } },
    _count: { _all: true }
  });
  const unreadByConv = new Map(unreadRows.map((r) => [r.conversationId, r._count._all]));
  return res.json(convs.map((c) => ({ ...c, unreadForAdmin: unreadByConv.get(c.id) ?? 0 })));
});

api.get("/chat/admin-unread", requireAdmin, async (_req, res) => {
  const count = await prisma.message.count({
    where: { readByAdminAt: null, sender: { role: "CLIENT" } }
  });
  return res.json({ count });
});

api.get("/chat/messages/:conversationId", requireAuth, async (req: AuthedRequest, res) => {
  const conversationId = routeParam(req, "conversationId");
  const role = req.auth!.role;

  if (role === "CLIENT") {
    const conv = await prisma.conversation.findUnique({ where: { clientId: req.auth!.sub } });
    if (!conv || conv.id !== conversationId) return res.status(403).json({ error: "FORBIDDEN" });
  }

  const includeSender = { sender: { select: { role: true, profileName: true, email: true } } } as const;

  if (role === "ADMIN") {
    await prisma.message.updateMany({
      where: {
        conversationId,
        readByAdminAt: null,
        sender: { role: "CLIENT" }
      },
      data: { readByAdminAt: new Date() }
    });
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    include: includeSender
  });
  return res.json(messages);
});

api.post("/chat/messages/:conversationId", requireAuth, async (req: AuthedRequest, res) => {
  const Body = z.object({ body: z.string().min(1).max(4000) });
  const { body } = Body.parse(req.body);
  const conversationId = routeParam(req, "conversationId");
  const role = req.auth!.role;

  if (role === "CLIENT") {
    const conv = await prisma.conversation.findUnique({ where: { clientId: req.auth!.sub } });
    if (!conv || conv.id !== conversationId) return res.status(403).json({ error: "FORBIDDEN" });
  }

  const msg = await prisma.message.create({
    data: { conversationId, senderId: req.auth!.sub, body }
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

  io.to(`conv:${conversationId}`).emit("chat:new_message", { conversationId, message: msg });
  return res.json(msg);
});

// --- Bootstrap admin account + default settings ---
async function ensureAdmin() {
  const existingAdmin = await prisma.user.findUnique({ where: { email: env.ADMIN_EMAIL } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 10);
    await prisma.user.create({ data: { email: env.ADMIN_EMAIL, passwordHash, role: "ADMIN", profileName: "Admin" } });
  }
  const settings = await prisma.siteSettings.findFirst();
  if (!settings) {
    await prisma.siteSettings.create({ data: { studioName: "Studio des Grenadiers" } });
  }
}

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: env.APP_ORIGIN,
    credentials: true
  }
});

io.on("connection", (socket) => {
  socket.on("join", (room: string) => {
    socket.join(room);
  });
});

app.use("/api", api);

// Error handler (after routes)
app.use((err: any, _req: any, res: any, _next: any) => {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: "VALIDATION_ERROR", issues: err.issues });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
});

await ensureAdmin();
server.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API running on http://localhost:${env.PORT}`);
});

