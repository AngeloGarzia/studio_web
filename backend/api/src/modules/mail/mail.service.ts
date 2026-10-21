import { getEnv } from "../../config/env.js";
import type { MailSender } from "../../infra/mail.js";
import { eurosToLetters, formatEuro, formatYmdLong } from "../../shared/eurosFr.js";
import { renderQuittancePdf, type QuittanceSignature } from "./quittancePdf.js";
import type { SettingsRepository } from "../settings/settings.repository.js";

export type BookingMailPayload = {
  bookingId: string;
  startDate: Date;
  endDate: Date;
  status: string;
  guestName?: string | null;
  guestEmail: string;
  guestPhone?: string | null;
  notes?: string | null;
  equipment?: string | null;
  ancillaryTotalCents?: number;
};

export type QuittanceMailPayload = {
  to: string;
  guestName?: string | null;
  bailleurName: string;
  bailleurAddress: string;
  bailleurPhone: string;
  bailleurEmail: string;
  tenantName: string;
  tenantAddress?: string;
  logement: string;
  periodFrom: string;
  periodTo: string;
  rentCents: number;
  chargesCents: number;
  receivedCents: number;
  paymentDate: string;
  paymentMethod: string;
  place: string;
  issueDate: string;
  feeLines: Array<{ label: string; priceCents: number }>;
  /** Copies distinctes, une par propriétaire, en plus du locataire. */
  copies?: Array<{ email: string; name: string }>;
  /** Autres locataires de la même quittance, chacun avec le message qui lui est adressé. */
  alsoTo?: Array<{ email: string; name: string }>;
  occupants?: Array<{ name: string; email?: string; phone?: string; address?: string }>;
  signatures?: QuittanceSignature[];
  platformProof?: { platform: string; image: Buffer };
  platform?: string;
  furnishedTourism?: boolean;
  extraAttachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
};

/** Destinataires propriétaire : fiches de l’établissement, plus l’e-mail du bailleur s’il est différent. */
export function quittanceOwnerCopies(
  owners: Array<{ email: string | null; firstName: string; lastName: string }>,
  tenantEmail: string,
  bailleurEmail: string
): Array<{ email: string; name: string }> {
  const tenant = tenantEmail.trim().toLowerCase();
  const copies = new Map<string, { email: string; name: string }>();
  const add = (raw: string | null | undefined, name: string) => {
    const email = raw?.trim() ?? "";
    const key = email.toLowerCase();
    if (!key.includes("@") || key === tenant || copies.has(key)) return;
    copies.set(key, { email, name: name.trim() });
  };
  for (const owner of owners) add(owner.email, `${owner.firstName} ${owner.lastName}`.trim());
  add(bailleurEmail, "");
  return [...copies.values()];
}

export type OwnerContact = {
  studioName: string;
  ownerName: string | null;
  phone: string | null;
  publicEmail: string | null;
  address: string | null;
};

/** Palette alignée sur frontend/web/tailwind.config.ts */
const BRAND = {
  water50: "#ecfeff",
  water100: "#cffafe",
  water200: "#a5f3fc",
  water600: "#0891b2",
  water700: "#0e7490",
  water900: "#164e63",
  sun50: "#fff8e8",
  sun100: "#ffefc5",
  sun300: "#ffd166",
  slate600: "#475569",
  slate700: "#334155",
  slate800: "#1e293b",
  slate900: "#0f172a",
  white: "#ffffff",
  rose600: "#e11d48"
} as const;

const FONT_SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const FONT_SERIF = "Georgia, 'Times New Roman', Times, serif";

/** Date civile UTC → « lundi 12 janvier 2027 » (nuits stockées à minuit UTC). */
function formatFrenchLongDate(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(d);
}

/** Ex. « du lundi 12 janvier au dimanche 2 février 2027 » (arrivée → départ). */
function formatStayPeriodFr(start: Date, end: Date): string {
  const from = formatFrenchLongDate(start);
  const to = formatFrenchLongDate(end);
  const yFrom = start.getUTCFullYear();
  const yTo = end.getUTCFullYear();
  if (yFrom === yTo) {
    const fromSansAnnee = new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC"
    }).format(start);
    return `du ${fromSansAnnee} au ${to}`;
  }
  return `du ${from} au ${to}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusLabelFr(status: string): string {
  switch (status) {
    case "CONFIRMED":
      return "confirmée";
    case "CANCELLED":
      return "annulée";
    case "PENDING":
    default:
      return "en attente";
  }
}

function statusBadgeColors(status: string): { bg: string; fg: string } {
  switch (status) {
    case "CONFIRMED":
      return { bg: BRAND.rose600, fg: BRAND.white };
    case "CANCELLED":
      return { bg: "#e2e8f0", fg: BRAND.slate800 };
    case "PENDING":
    default:
      return { bg: BRAND.sun300, fg: BRAND.slate900 };
  }
}

type EmailBlock =
  | { type: "p"; text: string; muted?: boolean }
  | { type: "lead"; text: string }
  | { type: "period"; text: string }
  | { type: "status"; status: string; label: string }
  | { type: "kv"; rows: Array<{ label: string; value: string }> }
  | { type: "cta"; href: string; label: string }
  | { type: "ownerNotice"; owner: OwnerContact };

const DIRECT_CONTACT_NOTICE =
  "Important : ce site / cette application ne loue pas directement le logement. Pour organiser ou finaliser votre séjour, vous devez contacter directement le propriétaire.";

const NO_REPLY_NOTICE = "Ne pas répondre via ce mail — utilisez les coordonnées du propriétaire ci-dessus.";

function ownerContactLines(owner: OwnerContact): string[] {
  const lines = [DIRECT_CONTACT_NOTICE, "", "Coordonnées du propriétaire :"];
  if (owner.ownerName) lines.push(`Nom : ${owner.ownerName}`);
  if (owner.phone) lines.push(`Téléphone : ${owner.phone}`);
  if (owner.publicEmail) lines.push(`E-mail : ${owner.publicEmail}`);
  if (owner.address) lines.push(`Adresse du logement : ${owner.address}`);
  if (!owner.ownerName && !owner.phone && !owner.publicEmail && !owner.address) {
    lines.push("(Coordonnées non renseignées dans les paramètres du site.)");
  }
  lines.push("", NO_REPLY_NOTICE);
  return lines;
}

function ownerNoticeBlocks(owner: OwnerContact): EmailBlock[] {
  return [{ type: "ownerNotice", owner }];
}

/** HTML e-mail aux couleurs / typo de l’appli (inline, compatible clients mail). */
function renderBrandedEmail(opts: {
  preheader?: string;
  title: string;
  brandName?: string;
  blocks: EmailBlock[];
  footerNote?: string;
}): string {
  const brandName = opts.brandName?.trim() || "Studio des Grenadiers";
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(opts.preheader)}</div>`
    : "";

  const bodyHtml = opts.blocks
    .map((b) => {
      if (b.type === "p") {
        return `<p style="margin:0 0 14px;font-family:${FONT_SANS};font-size:15px;line-height:1.55;font-weight:${
          b.muted ? "500" : "600"
        };color:${b.muted ? BRAND.slate600 : BRAND.slate800}">${escapeHtml(b.text)}</p>`;
      }
      if (b.type === "lead") {
        return `<p style="margin:0 0 18px;font-family:${FONT_SANS};font-size:16px;line-height:1.55;font-weight:600;color:${BRAND.water900}">${escapeHtml(
          b.text
        )}</p>`;
      }
      if (b.type === "period") {
        return `<div style="margin:0 0 18px;padding:14px 16px;border-radius:16px;border:1px solid ${BRAND.water200};background:linear-gradient(135deg,${BRAND.water50} 0%,${BRAND.sun50} 100%);">
          <div style="font-family:${FONT_SANS};font-size:11px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:${BRAND.water700};margin:0 0 6px">Séjour</div>
          <div style="font-family:${FONT_SERIF};font-size:17px;line-height:1.4;font-weight:700;color:${BRAND.slate800}">${escapeHtml(
            b.text
          )}</div>
        </div>`;
      }
      if (b.type === "status") {
        const c = statusBadgeColors(b.status);
        return `<p style="margin:0 0 18px;font-family:${FONT_SANS};font-size:14px;font-weight:600;color:${BRAND.slate700}">
          Statut&nbsp;:
          <span style="display:inline-block;margin-left:6px;padding:4px 12px;border-radius:999px;background:${c.bg};color:${c.fg};font-size:12px;font-weight:800;letter-spacing:0.02em">${escapeHtml(
            b.label
          )}</span>
        </p>`;
      }
      if (b.type === "kv") {
        const rows = b.rows
          .map(
            (r) => `<tr>
              <td style="padding:8px 0;font-family:${FONT_SANS};font-size:13px;font-weight:700;color:${BRAND.slate600};width:34%;vertical-align:top">${escapeHtml(
                r.label
              )}</td>
              <td style="padding:8px 0;font-family:${FONT_SANS};font-size:14px;font-weight:600;color:${BRAND.slate900};vertical-align:top">${escapeHtml(
                r.value
              )}</td>
            </tr>`
          )
          .join("");
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-collapse:collapse">${rows}</table>`;
      }
      if (b.type === "ownerNotice") {
        const o = b.owner;
        const rows: string[] = [];
        if (o.ownerName) {
          rows.push(
            `<tr><td style="padding:6px 0;font-family:${FONT_SANS};font-size:13px;font-weight:700;color:${BRAND.slate600};width:34%">Nom</td><td style="padding:6px 0;font-family:${FONT_SANS};font-size:14px;font-weight:700;color:${BRAND.slate900}">${escapeHtml(
              o.ownerName
            )}</td></tr>`
          );
        }
        if (o.phone) {
          const tel = o.phone.replace(/\s/g, "");
          rows.push(
            `<tr><td style="padding:6px 0;font-family:${FONT_SANS};font-size:13px;font-weight:700;color:${BRAND.slate600}">Téléphone</td><td style="padding:6px 0;font-family:${FONT_SANS};font-size:14px;font-weight:700"><a href="tel:${escapeHtml(
              tel
            )}" style="color:${BRAND.water700};text-decoration:underline">${escapeHtml(o.phone)}</a></td></tr>`
          );
        }
        if (o.publicEmail) {
          rows.push(
            `<tr><td style="padding:6px 0;font-family:${FONT_SANS};font-size:13px;font-weight:700;color:${BRAND.slate600}">E-mail</td><td style="padding:6px 0;font-family:${FONT_SANS};font-size:14px;font-weight:700"><a href="mailto:${escapeHtml(
              o.publicEmail
            )}" style="color:${BRAND.water700};text-decoration:underline">${escapeHtml(o.publicEmail)}</a></td></tr>`
          );
        }
        if (o.address) {
          rows.push(
            `<tr><td style="padding:6px 0;font-family:${FONT_SANS};font-size:13px;font-weight:700;color:${BRAND.slate600};vertical-align:top">Adresse</td><td style="padding:6px 0;font-family:${FONT_SANS};font-size:14px;font-weight:600;color:${BRAND.slate900};white-space:pre-wrap">${escapeHtml(
              o.address
            )}</td></tr>`
          );
        }
        if (rows.length === 0) {
          rows.push(
            `<tr><td colspan="2" style="padding:6px 0;font-family:${FONT_SANS};font-size:13px;font-weight:600;color:${BRAND.slate600}">Coordonnées non renseignées — répondez à cet e-mail pour joindre le propriétaire.</td></tr>`
          );
        }
        return `<div style="margin:0 0 18px;padding:16px 16px 14px;border-radius:16px;border:1px solid ${BRAND.sun300};background:${BRAND.sun50};">
          <div style="font-family:${FONT_SANS};font-size:11px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:${BRAND.water700};margin:0 0 8px">Location &amp; contact</div>
          <p style="margin:0 0 12px;font-family:${FONT_SANS};font-size:14px;line-height:1.55;font-weight:600;color:${BRAND.slate800}">${escapeHtml(
            DIRECT_CONTACT_NOTICE
          )}</p>
          <div style="font-family:${FONT_SANS};font-size:13px;font-weight:800;color:${BRAND.slate700};margin:0 0 6px">Coordonnées du propriétaire</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows.join(
            ""
          )}</table>
          <p style="margin:12px 0 0;font-family:${FONT_SANS};font-size:13px;line-height:1.45;font-weight:700;color:${BRAND.rose600}">${escapeHtml(
            NO_REPLY_NOTICE
          )}</p>
        </div>`;
      }
      // cta
      return `<p style="margin:8px 0 0;text-align:center">
        <a href="${escapeHtml(b.href)}" style="display:inline-block;padding:12px 22px;border-radius:12px;background:${BRAND.water600};color:${BRAND.white};font-family:${FONT_SANS};font-size:14px;font-weight:700;text-decoration:none">${escapeHtml(
          b.label
        )}</a>
      </p>`;
    })
    .join("");

  const footer = opts.footerNote
    ? `<p style="margin:22px 0 0;font-family:${FONT_SANS};font-size:12px;line-height:1.45;font-weight:500;color:${BRAND.slate600}">${escapeHtml(
        opts.footerNote
      )}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:${BRAND.water50};">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,${BRAND.water50} 0%,${BRAND.sun50} 55%,#e0fbff 100%);padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-collapse:separate;">
          <tr>
            <td style="padding:0 0 16px;text-align:center">
              <div style="font-family:${FONT_SERIF};font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:${BRAND.slate800}">${escapeHtml(
                brandName
              )}</div>
              <div style="margin-top:6px;font-family:${FONT_SANS};font-size:13px;font-weight:600;color:${BRAND.water700}">Balaruc · soleil &amp; eau</div>
            </td>
          </tr>
          <tr>
            <td style="background:${BRAND.white};border:1px solid rgba(255,255,255,0.7);border-radius:20px;box-shadow:0 12px 40px rgba(22,78,99,0.12);padding:28px 24px;">
              <div style="height:4px;border-radius:999px;background:linear-gradient(90deg,${BRAND.sun300} 0%,${BRAND.water600} 100%);margin:0 0 20px"></div>
              <h1 style="margin:0 0 16px;font-family:${FONT_SERIF};font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.02em;color:${BRAND.slate800}">${escapeHtml(
                opts.title
              )}</h1>
              ${bodyHtml}
              ${footer}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 8px 0;text-align:center;font-family:${FONT_SANS};font-size:11px;font-weight:600;color:${BRAND.slate600};line-height:1.45">
              ${escapeHtml(brandName)} · Cet e-mail est envoyé automatiquement.<br/>
              <span style="color:${BRAND.rose600};font-weight:700">Ne pas répondre via ce mail.</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export class MailService {
  constructor(
    private readonly mail: MailSender,
    private readonly settings: SettingsRepository
  ) {}

  get enabled() {
    return this.mail.enabled;
  }

  private adminTo() {
    const env = getEnv();
    return (env.MAIL_ADMIN_TO?.trim() || env.ADMIN_EMAIL).toLowerCase();
  }

  private async loadOwnerContact(): Promise<OwnerContact> {
    const row = await this.settings.findFirst();
    return {
      studioName: row?.studioName?.trim() || "Studio des Grenadiers",
      ownerName: row?.ownerName?.trim() || null,
      phone: row?.phone?.trim() || null,
      publicEmail: row?.publicEmail?.trim() || null,
      address: row?.address?.trim() || null
    };
  }

  /** Fire-and-forget : ne fait jamais échouer le flux métier. */
  private dispatch(label: string, fn: () => Promise<void>) {
    if (!this.mail.enabled) return;
    void fn().catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`[mail] ${label}`, err);
    });
  }

  notifyBookingCreated(payload: BookingMailPayload) {
    this.dispatch("booking-created-admin", () => this.sendAdminNewBooking(payload));
    this.dispatch("booking-created-guest", () => this.sendGuestBookingAck(payload));
  }

  notifyBookingStatusChanged(payload: BookingMailPayload) {
    this.dispatch("booking-status-guest", () => this.sendGuestStatusUpdate(payload));
  }

  /** Contre-proposition admin : dates proposées + message, sans changer la demande. */
  async sendCounterProposal(
    payload: BookingMailPayload & { proposedStart: Date; proposedEnd: Date; message: string }
  ): Promise<void> {
    if (!this.mail.enabled) {
      const err = new Error("MAIL_DISABLED");
      err.name = "MAIL_DISABLED";
      throw err;
    }
    const owner = await this.loadOwnerContact();
    const requested = formatStayPeriodFr(payload.startDate, payload.endDate);
    const proposed = formatStayPeriodFr(payload.proposedStart, payload.proposedEnd);
    const subject = `Contre-proposition pour votre demande (${proposed})`;
    const text = [
      `Bonjour${payload.guestName ? ` ${payload.guestName}` : ""},`,
      "",
      "Le propriétaire vous adresse une contre-proposition pour votre demande de réservation.",
      `Votre demande : ${requested}.`,
      `Proposition : ${proposed}.`,
      "",
      payload.message.trim(),
      "",
      "Votre demande d’origine reste en attente tant qu’elle n’est pas confirmée.",
      "",
      ...ownerContactLines(owner),
      "",
      owner.studioName
    ].join("\n");
    const html = renderBrandedEmail({
      preheader: `Contre-proposition — ${proposed}`,
      title: "Contre-proposition",
      brandName: owner.studioName,
      blocks: [
        {
          type: "lead",
          text: `Bonjour${payload.guestName ? ` ${payload.guestName}` : ""}, le propriétaire vous propose une autre période pour votre demande.`
        },
        {
          type: "kv",
          rows: [
            { label: "Votre demande", value: requested },
            { label: "Proposition", value: proposed },
            { label: "Message", value: payload.message.trim() }
          ]
        },
        {
          type: "p",
          text: "Votre demande d’origine reste en attente tant qu’elle n’est pas confirmée.",
          muted: true
        },
        ...ownerNoticeBlocks(owner)
      ],
      footerNote: owner.studioName
    });
    await this.mail.send({
      to: [{ email: payload.guestEmail, name: payload.guestName ?? undefined }],
      subject,
      text,
      html
    });
  }

  /** Confirme le compte : mot de passe temporaire et lien pour le changer tout de suite. */
  async sendAccountConfirmation(payload: {
    to: string;
    name: string;
    password: string | null;
    setupUrl: string | null;
  }): Promise<void> {
    if (!this.mail.enabled) {
      const err = new Error("MAIL_DISABLED");
      err.name = "MAIL_DISABLED";
      throw err;
    }
    const owner = await this.loadOwnerContact();
    const loginUrl = `${getEnv().APP_ORIGIN.replace(/\/$/, "")}/connexion`;
    const greeting = payload.name.trim() ? `Bonjour ${payload.name.trim()},` : "Bonjour,";
    const rows = [{ label: "Identifiant", value: payload.to }];
    if (payload.password) rows.push({ label: "Mot de passe temporaire", value: payload.password });
    const access = payload.password
      ? "Connectez-vous avec ce mot de passe temporaire, ou choisissez tout de suite le vôtre."
      : "Choisissez tout de suite votre mot de passe, ou connectez-vous avec celui déjà en place.";
    const text = [
      greeting,
      "",
      "Un compte a été créé pour vous sur l’application.",
      `Identifiant : ${payload.to}`,
      payload.password ? `Mot de passe temporaire : ${payload.password}` : "Le mot de passe déjà choisi reste valable.",
      "",
      access,
      ...(payload.setupUrl ? [`Choisir mon mot de passe : ${payload.setupUrl}`] : []),
      `Connexion : ${loginUrl}`,
      "",
      owner.studioName
    ].join("\n");
    const html = renderBrandedEmail({
      preheader: "Votre compte est créé",
      title: "Votre compte est créé",
      brandName: owner.studioName,
      blocks: [
        { type: "lead", text: `${greeting} un compte a été créé pour vous.` },
        { type: "kv", rows },
        { type: "p", text: access },
        ...(payload.setupUrl ? [{ type: "cta" as const, href: payload.setupUrl, label: "Choisir mon mot de passe" }] : []),
        { type: "p", text: `Sinon, connectez-vous ici : ${loginUrl}`, muted: true },
        { type: "cta", href: loginUrl, label: "Se connecter" }
      ],
      footerNote: owner.studioName
    });
    await this.mail.send({
      to: [{ email: payload.to, name: payload.name.trim() || undefined }],
      subject: "Votre compte est créé",
      text,
      html
    });
  }

  /** Quittance ou reçu, tel qu’établi par l’admin, envoyé au locataire. */
  async sendQuittance(payload: QuittanceMailPayload): Promise<void> {
    if (!this.mail.enabled) {
      const err = new Error("MAIL_DISABLED");
      err.name = "MAIL_DISABLED";
      throw err;
    }
    const owner = await this.loadOwnerContact();
    const dueCents = payload.rentCents + payload.chargesCents;
    const fullPayment = payload.receivedCents >= dueCents;
    const title = fullPayment ? "Quittance de loyer" : "Reçu de loyer";
    const period = `Du ${formatYmdLong(payload.periodFrom)} au ${formatYmdLong(payload.periodTo)}`;
    const feesSum = payload.feeLines.reduce((sum, fee) => sum + fee.priceCents, 0);
    const showFees = payload.feeLines.length > 0 && feesSum === payload.chargesCents;
    const withProof = Boolean(payload.platformProof?.image && payload.platformProof.image.byteLength > 8);
    const rows: Array<{ label: string; value: string }> = [
      { label: "Bailleur", value: [payload.bailleurName, payload.bailleurAddress, payload.bailleurPhone, payload.bailleurEmail].filter(Boolean).join(" · ") },
      { label: "Locataire", value: payload.occupants?.length
        ? payload.occupants.map((person) => [person.name, person.address?.trim()].filter(Boolean).join(" — ")).join(" · ")
        : [payload.tenantName, payload.tenantAddress?.trim()].filter(Boolean).join(" — ") },
      { label: "Logement loué", value: payload.logement },
      { label: "Période", value: period }
    ];
    if (!withProof) {
      rows.push(
        { label: "Loyer hors charges", value: `${formatEuro(payload.rentCents)} €` },
        { label: "Provisions pour charges", value: `${formatEuro(payload.chargesCents)} €` }
      );
      if (showFees) {
        for (const fee of payload.feeLines) {
          rows.push({ label: `dont ${fee.label}`, value: `${formatEuro(fee.priceCents)} €` });
        }
      }
      rows.push(
        { label: "Total dû", value: `${formatEuro(dueCents)} €` },
        { label: "Somme reçue", value: `${formatEuro(payload.receivedCents)} €` }
      );
      if (!fullPayment) {
        rows.push({ label: "Solde restant dû", value: `${formatEuro(dueCents - payload.receivedCents)} €` });
      }
    }

    const platform = payload.platform?.trim() || payload.platformProof?.platform?.trim() || "";
    const declaration = platform
      ? `Je soussigné(e) ${payload.bailleurName}, bailleur du logement désigné ci-dessus, déclare avoir loué le logement ci-dessus dans la période mentionnée ci-dessus, selon les modalités de la plateforme ${platform}.`
      : fullPayment
        ? `Je soussigné(e) ${payload.bailleurName}, bailleur du logement désigné ci-dessus, déclare avoir reçu de ${payload.tenantName} la somme de ${eurosToLetters(payload.receivedCents)} (${formatEuro(payload.receivedCents)} €) au titre du loyer et des charges pour la période indiquée, et lui en donne quittance, sous réserve de tous mes droits.`
        : `Je soussigné(e) ${payload.bailleurName}, bailleur du logement désigné ci-dessus, déclare avoir reçu de ${payload.tenantName} la somme de ${eurosToLetters(payload.receivedCents)} (${formatEuro(payload.receivedCents)} €) à valoir sur le loyer et les charges de la période indiquée.`;
    const reserve = fullPayment
      ? "Cette quittance ne présume pas du paiement des termes antérieurs et ne vaut pas titre définitif."
      : "Le présent document est un reçu, et non une quittance : le loyer et les charges de la période ne sont pas intégralement payés.";
    const payment = platform
      ? `Paiement reçu selon les modalités de la plateforme ${platform}.`
      : `Paiement reçu le ${formatYmdLong(payload.paymentDate)} par ${payload.paymentMethod.toLocaleLowerCase("fr-FR")}.`;
    const doneAt = `Fait à ${payload.place}, le ${formatYmdLong(payload.issueDate)}.`;
    const subject = `${title} — ${period}`;
    const pdf = await renderQuittancePdf(payload);
    const filename = `${fullPayment ? "quittance" : "recu"}-loyer.pdf`;
    const helloForTenant = (name: string) =>
      `Bonjour${name ? ` ${name}` : ""}, le propriétaire vous adresse votre ${fullPayment ? "quittance" : "reçu"} de loyer.`;
    const recipients = [
      {
        email: payload.to,
        name: payload.guestName || payload.tenantName,
        hello: helloForTenant(payload.guestName || "")
      },
      ...(payload.alsoTo ?? [])
        .filter((person) => person.email.trim().toLowerCase() !== payload.to.trim().toLowerCase())
        .map((person) => ({
          email: person.email,
          name: person.name,
          hello: helloForTenant(person.name)
        })),
      ...(payload.copies ?? []).map((copy) => ({
        email: copy.email,
        name: copy.name,
        hello: `Bonjour${copy.name ? ` ${copy.name}` : ""}, voici la copie de la ${fullPayment ? "quittance" : "du reçu"} de loyer adressée à ${payload.tenantName}.`
      }))
    ].filter((recipient, index, all) => {
      const key = recipient.email.trim().toLowerCase();
      return key.includes("@") && all.findIndex((item) => item.email.trim().toLowerCase() === key) === index;
    });
    for (const recipient of recipients) {
      const text = [
        recipient.hello,
        "",
        title.toUpperCase(),
        ...rows.map((row) => `${row.label} : ${row.value}`),
        "",
        declaration,
        reserve,
        payment,
        doneAt,
        "",
        "La quittance est jointe à ce message en PDF.",
        ...(payload.extraAttachments?.length ? ["D'autres pièces jointes accompagnent ce message."] : []),
        ...(payload.furnishedTourism ? [] : ["Document établi conformément à l’article 21 de la loi n° 89-462 du 6 juillet 1989."]),
        "",
        ...ownerContactLines(owner),
        "",
        owner.studioName
      ].join("\n");
      const html = renderBrandedEmail({
        preheader: `${title} — ${period}`,
        title,
        brandName: owner.studioName,
        blocks: [
          { type: "lead", text: recipient.hello },
          { type: "kv", rows },
          { type: "p", text: declaration },
          { type: "p", text: reserve },
          { type: "p", text: payment },
          { type: "p", text: doneAt },
          {
            type: "p",
            text: payload.extraAttachments?.length
              ? "La quittance et les autres pièces jointes accompagnent ce message."
              : "La quittance est jointe à ce message en PDF.",
            muted: true
          },
          ...ownerNoticeBlocks(owner)
        ],
        footerNote: owner.studioName
      });
      await this.mail.send({
        to: [{ email: recipient.email, name: recipient.name || undefined }],
        subject,
        text,
        html,
        attachments: [
          { filename, content: pdf, contentType: "application/pdf" },
          ...(payload.extraAttachments ?? [])
        ]
      });
    }
  }

  /** Envoi synchrone (action admin) — lève si SMTP off ou envoi échoue. */
  async sendBookingEmailToGuest(payload: BookingMailPayload): Promise<void> {
    if (!this.mail.enabled) {
      const err = new Error("MAIL_DISABLED");
      err.name = "MAIL_DISABLED";
      throw err;
    }
    await this.sendGuestBookingNotice(payload);
  }

  private async sendAdminNewBooking(p: BookingMailPayload) {
    const period = formatStayPeriodFr(p.startDate, p.endDate);
    const subject = `[Réservation] Nouvelle demande ${period}`;
    const adminUrl = `${getEnv().APP_ORIGIN}/admin/calendrier`;
    const text = [
      "Nouvelle demande de réservation",
      `Statut: ${p.status}`,
      `Période: ${period}`,
      `Nom: ${p.guestName ?? "-"}`,
      `Email: ${p.guestEmail}`,
      `Téléphone: ${p.guestPhone ?? "-"}`,
      `Notes: ${p.notes?.trim() || "-"}`,
      `Équipement: ${p.equipment?.trim() || "-"}`,
      `Frais annexes: ${((p.ancillaryTotalCents ?? 0) / 100).toFixed(2)} €`,
      `Id: ${p.bookingId}`,
      "",
      `Admin: ${adminUrl}`,
      "",
      "Ne pas répondre via ce mail."
    ].join("\n");
    const html = renderBrandedEmail({
      preheader: `Nouvelle demande ${period}`,
      title: "Nouvelle demande de réservation",
      blocks: [
        { type: "period", text: period },
        { type: "status", status: p.status, label: statusLabelFr(p.status) },
        {
          type: "kv",
          rows: [
            { label: "Nom", value: p.guestName?.trim() || "-" },
            { label: "Email", value: p.guestEmail },
            { label: "Téléphone", value: p.guestPhone?.trim() || "-" },
            { label: "Notes", value: p.notes?.trim() || "-" },
            { label: "Équipement", value: p.equipment?.trim() || "-" },
            { label: "Frais annexes", value: `${((p.ancillaryTotalCents ?? 0) / 100).toFixed(2)} €` },
            { label: "Réf.", value: p.bookingId }
          ]
        },
        { type: "cta", href: adminUrl, label: "Ouvrir le calendrier admin" },
        { type: "p", text: "Ne pas répondre via ce mail.", muted: true }
      ]
    });
    await this.mail.send({
      to: [{ email: this.adminTo() }],
      subject,
      text,
      html
    });
  }

  private async sendGuestBookingAck(p: BookingMailPayload) {
    const owner = await this.loadOwnerContact();
    const period = formatStayPeriodFr(p.startDate, p.endDate);
    const subject = `Demande de réservation reçue (${period})`;
    const text = [
      `Bonjour${p.guestName ? ` ${p.guestName}` : ""},`,
      "",
      "Nous avons bien reçu votre demande de réservation.",
      `Séjour ${period}.`,
      `Statut : ${statusLabelFr(p.status)}`,
      "",
      ...ownerContactLines(owner),
      "",
      owner.studioName
    ].join("\n");
    const html = renderBrandedEmail({
      preheader: `Demande reçue — ${period}`,
      title: "Demande bien reçue",
      brandName: owner.studioName,
      blocks: [
        {
          type: "lead",
          text: `Bonjour${p.guestName ? ` ${p.guestName}` : ""}, nous avons bien reçu votre demande de réservation.`
        },
        { type: "period", text: period },
        { type: "status", status: p.status, label: statusLabelFr(p.status) },
        ...ownerNoticeBlocks(owner)
      ],
      footerNote: owner.studioName
    });
    await this.mail.send({
      to: [{ email: p.guestEmail, name: p.guestName ?? undefined }],
      subject,
      text,
      html
    });
  }

  private async sendGuestStatusUpdate(p: BookingMailPayload) {
    const owner = await this.loadOwnerContact();
    const period = formatStayPeriodFr(p.startDate, p.endDate);
    const label = statusLabelFr(p.status);
    const subject = `Réservation ${label} (${period})`;
    const text = [
      `Bonjour${p.guestName ? ` ${p.guestName}` : ""},`,
      "",
      `Votre réservation ${period} est désormais ${label}.`,
      "",
      ...ownerContactLines(owner),
      "",
      owner.studioName
    ].join("\n");
    const html = renderBrandedEmail({
      preheader: `Réservation ${label}`,
      title: `Réservation ${label}`,
      brandName: owner.studioName,
      blocks: [
        {
          type: "lead",
          text: `Bonjour${p.guestName ? ` ${p.guestName}` : ""}, votre réservation est désormais ${label}.`
        },
        { type: "period", text: period },
        { type: "status", status: p.status, label },
        ...ownerNoticeBlocks(owner)
      ],
      footerNote: owner.studioName
    });
    await this.mail.send({
      to: [{ email: p.guestEmail, name: p.guestName ?? undefined }],
      subject,
      text,
      html
    });
  }

  /** Mail récapitulatif (déclenché manuellement depuis l’admin). */
  private async sendGuestBookingNotice(p: BookingMailPayload) {
    const owner = await this.loadOwnerContact();
    const period = formatStayPeriodFr(p.startDate, p.endDate);
    const label = statusLabelFr(p.status);
    const subject = `Votre réservation — ${label} (${period})`;
    const text = [
      `Bonjour${p.guestName ? ` ${p.guestName}` : ""},`,
      "",
      `Voici les informations concernant votre réservation au ${owner.studioName}.`,
      "",
      `Séjour ${period}.`,
      `Statut : ${label}`,
      p.notes?.trim() ? `Message : ${p.notes.trim()}` : null,
      p.equipment?.trim() ? `Équipement : ${p.equipment.trim()}` : null,
      "",
      ...ownerContactLines(owner),
      "",
      owner.studioName
    ]
      .filter((l) => l !== null)
      .join("\n");

    const kvRows: Array<{ label: string; value: string }> = [];
    if (p.notes?.trim()) kvRows.push({ label: "Message", value: p.notes.trim() });
    if (p.equipment?.trim()) kvRows.push({ label: "Équipement", value: p.equipment.trim() });

    const html = renderBrandedEmail({
      preheader: `Votre réservation — ${period}`,
      title: "Votre réservation",
      brandName: owner.studioName,
      blocks: [
        {
          type: "lead",
          text: `Bonjour${p.guestName ? ` ${p.guestName}` : ""}, voici les informations concernant votre séjour.`
        },
        { type: "period", text: period },
        { type: "status", status: p.status, label },
        ...(kvRows.length ? [{ type: "kv" as const, rows: kvRows }] : []),
        ...ownerNoticeBlocks(owner)
      ],
      footerNote: owner.studioName
    });
    await this.mail.send({
      to: [{ email: p.guestEmail, name: p.guestName ?? undefined }],
      subject,
      text,
      html
    });
  }
}
