import type { ChatEmitter } from "../../infra/socket.js";
import { AppError } from "../../shared/http.js";
import { hashRandomGuestPassword, normalizeEmail } from "../../shared/password.js";
import { ancillarySnapshotFromFees, type AncillaryFeeService } from "../ancillaryFee/ancillaryFee.service.js";
import { signatureOfOwner } from "../mail/quittancePdf.js";
import { quittanceOwnerCopies, type MailService } from "../mail/mail.service.js";
import type { PricingService } from "../pricing/pricing.service.js";
import type { AdminCreateBookingBody, AdminUpdateBookingBody, CreateBookingBody, ProposeBookingBody, PublicBookingRequestBody, SendQuittanceBody, SetBookingStatusBody } from "./booking.dto.js";
import type { BookingRepository } from "./booking.repository.js";
import type { AppRole } from "../../shared/roles.js";

export class BookingService {
  constructor(
    private readonly bookings: BookingRepository,
    private readonly pricing: PricingService,
    private readonly ancillaryFees: AncillaryFeeService,
    private readonly chatEmitter: ChatEmitter,
    private readonly mail: MailService
  ) {}

  private async buildBookingReservationChatBody(opts: {
    headline: string;
    booking: {
      id: string;
      startDate: Date;
      endDate: Date;
      status: string;
      notes?: string | null;
      equipment?: string | null;
      platform?: string | null;
      ancillaryTotalCents: number;
    };
    feeRows: { label: string; priceCents: number }[];
    guest?: {
      name?: string;
      firstName?: string | null;
      lastName?: string | null;
      email?: string;
      phone?: string;
      residenceAddress?: string | null;
    };
    includePricingEstimate: boolean;
  }): Promise<string> {
    const { headline, booking, feeRows, guest, includePricingEstimate } = opts;
    const lines: string[] = [
      headline,
      `Statut: ${booking.status}`,
      `Période (arrivée → départ): ${booking.startDate.toISOString().slice(0, 10)} → ${booking.endDate.toISOString().slice(0, 10)}`
    ];
    if (guest?.firstName?.trim() || guest?.lastName?.trim()) {
      if (guest.firstName?.trim()) lines.push(`Prénom: ${guest.firstName.trim()}`);
      if (guest.lastName?.trim()) lines.push(`Nom: ${guest.lastName.trim()}`);
    } else if (guest?.name?.trim()) {
      lines.push(`Nom: ${guest.name.trim()}`);
    }
    if (guest?.email?.trim()) lines.push(`Email: ${guest.email.trim()}`);
    if (guest?.phone?.trim()) lines.push(`Téléphone: ${guest.phone.trim()}`);
    if (guest?.residenceAddress?.trim()) lines.push(`Résidence principale: ${guest.residenceAddress.trim()}`);
    if (booking.platform?.trim()) lines.push(`Plateforme: ${booking.platform.trim()}`);
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
        const p = await this.pricing.computeStayPricingSummary(booking.startDate, booking.endDate);
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

  private async assertRangeAndAvailability(start: Date, end: Date, excludeBookingId?: string) {
    if (isNaN(start.getTime())) throw new AppError("INVALID_START", 400);
    if (isNaN(end.getTime())) throw new AppError("INVALID_END", 400);
    if (end <= start) throw new AppError("INVALID_RANGE", 400);

    const startKey = start.toISOString().slice(0, 10);
    const checkoutKey = end.toISOString().slice(0, 10);
    const startCfg = await this.bookings.findDayConfigByDate(new Date(`${startKey}T00:00:00.000Z`));
    if (startCfg && !startCfg.arrivalAllowed) throw new AppError("ARRIVAL_NOT_ALLOWED", 409);
    const checkoutCfg = await this.bookings.findDayConfigByDate(new Date(`${checkoutKey}T00:00:00.000Z`));
    if (checkoutCfg && !checkoutCfg.departureAllowed) throw new AppError("DEPARTURE_NOT_ALLOWED", 409);

    const overlap = await this.bookings.findOverlappingBooking(start, end, excludeBookingId);
    if (overlap) throw new AppError("DATES_UNAVAILABLE", 409);
    const blockOverlap = await this.bookings.findOverlappingBlock(start, end);
    if (blockOverlap) throw new AppError("DATES_UNAVAILABLE", 409);
  }

  async createPublicRequest(body: PublicBookingRequestBody) {
    const emailClean = normalizeEmail(body.email);
    const phoneClean = body.phone.trim();
    const start = new Date(body.startDate);
    const end = new Date(body.endDate);
    await this.assertRangeAndAvailability(start, end);

    // Ne jamais rattacher une demande anonyme à un compte réel (anti-takeover).
    // Match email uniquement ; pas de match téléphone → compte existant.
    const existingByEmail = await this.bookings.findUserByEmailInsensitive(emailClean);
    let client = existingByEmail;

    if (client && !client.isGuest) {
      throw new AppError("ACCOUNT_EXISTS_LOGIN_REQUIRED", 409);
    }

    if (!client) {
      const passwordHash = await hashRandomGuestPassword();
      client = await this.bookings.createUser({
        email: emailClean,
        passwordHash,
        profileName: body.name.trim(),
        phone: phoneClean,
        isGuest: true
      });
    } else {
      await this.bookings
        .updateUser(client.id, {
          profileName: body.name.trim() || client.profileName,
          phone: phoneClean || client.phone
        })
        .catch(() => client!);
    }

    const settings = await this.bookings.findSettings();
    const autoConfirm = settings?.bookingAutoConfirm ?? false;
    const feeRows = await this.ancillaryFees.loadActiveOrdered();
    const { ancillaryTotalCents, ancillarySnapshot } = ancillarySnapshotFromFees(feeRows);

    const booking = await this.bookings.createBooking({
      userId: client.id,
      startDate: start,
      endDate: end,
      notes: body.notes,
      equipment: body.equipment,
      status: autoConfirm ? "CONFIRMED" : "PENDING",
      ancillaryTotalCents,
      ancillarySnapshot
    });

    const conv = await this.bookings.findOrCreateConversation(client.id);
    const bodyText = await this.buildBookingReservationChatBody({
      headline: "Nouvelle demande de réservation (sans compte)",
      booking: {
        id: booking.id,
        startDate: start,
        endDate: end,
        status: booking.status,
        notes: body.notes,
        equipment: body.equipment,
        ancillaryTotalCents
      },
      feeRows,
      guest: { name: body.name, email: emailClean, phone: phoneClean },
      includePricingEstimate: true
    });

    const chatMessage = await this.bookings.createMessage({
      conversationId: conv.id,
      senderId: client.id,
      body: bodyText,
      bookingId: booking.id
    });
    await this.bookings.touchConversation(conv.id);
    this.chatEmitter.emitNewMessage(conv.id, chatMessage);

    this.mail.notifyBookingCreated({
      bookingId: booking.id,
      startDate: start,
      endDate: end,
      status: booking.status,
      guestName: body.name,
      guestEmail: emailClean,
      guestPhone: phoneClean,
      notes: body.notes,
      equipment: body.equipment,
      ancillaryTotalCents
    });

    return { ok: true as const, bookingId: booking.id, conversationId: conv.id, clientId: client.id };
  }

  async createAuthenticated(
    userId: string,
    role: AppRole,
    body: CreateBookingBody
  ) {
    const start = new Date(body.startDate);
    const end = new Date(body.endDate);
    await this.assertRangeAndAvailability(start, end);

    const settings = await this.bookings.findSettings();
    const autoConfirm = settings?.bookingAutoConfirm ?? false;
    const feeRows = await this.ancillaryFees.loadActiveOrdered();
    const { ancillaryTotalCents, ancillarySnapshot } = ancillarySnapshotFromFees(feeRows);

    const booking = await this.bookings.createBooking({
      userId,
      startDate: start,
      endDate: end,
      notes: body.notes,
      equipment: body.equipment,
      status: autoConfirm ? "CONFIRMED" : "PENDING",
      ancillaryTotalCents,
      ancillarySnapshot
    });

    if (role === "CLIENT") {
      const user = await this.bookings.findUserById(userId);
      if (user) {
        const conv = await this.bookings.findOrCreateConversation(user.id);
        const bodyText = await this.buildBookingReservationChatBody({
          headline: "Nouvelle demande de réservation (compte client)",
          booking: {
            id: booking.id,
            startDate: start,
            endDate: end,
            status: booking.status,
            notes: body.notes,
            equipment: body.equipment,
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
        const chatMessage = await this.bookings.createMessage({
          conversationId: conv.id,
          senderId: user.id,
          body: bodyText,
          bookingId: booking.id
        });
        await this.bookings.touchConversation(conv.id);
        this.chatEmitter.emitNewMessage(conv.id, chatMessage);

        this.mail.notifyBookingCreated({
          bookingId: booking.id,
          startDate: start,
          endDate: end,
          status: booking.status,
          guestName: user.profileName,
          guestEmail: user.email,
          guestPhone: user.phone,
          notes: body.notes,
          equipment: body.equipment,
          ancillaryTotalCents
        });
      }
    }

    return booking;
  }

  listClients() {
    return this.bookings.listClients();
  }

  /** Réservation confirmée posée sur le logement ouvert, pour un client existant ou un nouveau client. */
  async createForClient(body: AdminCreateBookingBody) {
    const start = new Date(`${body.startDate}T00:00:00.000Z`);
    const end = new Date(`${body.endDate}T00:00:00.000Z`);
    await this.assertRangeAndAvailability(start, end);

    const residenceProvided = body.residenceAddress !== undefined;
    const residenceAddress = body.residenceAddress?.trim() || null;
    const resolved = body.clientId
      ? await this.applyClientProfile(body.clientId, {
          residenceAddress: residenceProvided ? residenceAddress : undefined,
          firstName: body.firstName,
          lastName: body.lastName
        })
      : await this.findOrCreateClient({ ...body.client!, residenceAddress });

    const feeRows = await this.ancillaryFees.loadActiveOrdered();
    const { ancillaryTotalCents, ancillarySnapshot } = ancillarySnapshotFromFees(feeRows);
    const booking = await this.bookings.createBooking({
      userId: resolved.user.id,
      startDate: start,
      endDate: end,
      notes: body.notes,
      platform: body.platform ?? null,
      status: "CONFIRMED",
      ancillaryTotalCents,
      ancillarySnapshot
    });

    const conv = await this.bookings.findOrCreateConversation(resolved.user.id);
    const bodyText = await this.buildBookingReservationChatBody({
      headline: "Réservation ajoutée par le propriétaire",
      booking: {
        id: booking.id,
        startDate: start,
        endDate: end,
        status: booking.status,
        notes: body.notes,
        platform: booking.platform,
        ancillaryTotalCents
      },
      feeRows,
      guest: {
        name: resolved.user.profileName ?? undefined,
        firstName: resolved.user.firstName,
        lastName: resolved.user.lastName,
        email: resolved.user.email,
        phone: resolved.user.phone ?? undefined,
        residenceAddress: resolved.user.residenceAddress
      },
      includePricingEstimate: true
    });
    const chatMessage = await this.bookings.createMessage({
      conversationId: conv.id,
      senderId: resolved.user.id,
      body: bodyText,
      bookingId: booking.id
    });
    await this.bookings.touchConversation(conv.id);
    this.chatEmitter.emitNewMessage(conv.id, chatMessage);

    return { booking, clientCreated: resolved.created };
  }

  async updateForAdmin(id: string, body: AdminUpdateBookingBody) {
    const existing = await this.bookings.findByIdWithUser(id);
    if (!existing) throw new AppError("NOT_FOUND", 404);
    const start = new Date(`${body.startDate}T00:00:00.000Z`);
    const end = new Date(`${body.endDate}T00:00:00.000Z`);
    await this.assertRangeAndAvailability(start, end, id);
    if (existing.user) {
      await this.applyClientProfile(existing.user.id, {
        residenceAddress: body.residenceAddress !== undefined ? body.residenceAddress.trim() || null : undefined,
        firstName: body.firstName,
        lastName: body.lastName
      });
      if (body.phone !== undefined) {
        await this.bookings.updateUser(existing.user.id, { phone: body.phone.trim() || null });
      }
    }
    const platform = body.platform === undefined ? existing.platform : body.platform;
    await this.bookings.updateBooking(id, {
      startDate: start,
      endDate: end,
      notes: body.notes?.trim() || null,
      platform,
      clearPlatformImage: !platform
    });
    return { ok: true as const };
  }

  private async requireClient(clientId: string) {
    const user = await this.bookings.findUserById(clientId);
    if (!user || user.role !== "CLIENT") throw new AppError("CLIENT_NOT_FOUND", 404);
    return user;
  }

  /** Champs absents : on ne touche pas à la fiche. `residenceAddress` à `null` efface l’adresse. */
  private async applyClientProfile(
    clientId: string,
    patch: { residenceAddress?: string | null; firstName?: string; lastName?: string }
  ) {
    const current = await this.requireClient(clientId);
    const data: Record<string, unknown> = {};
    if (patch.residenceAddress !== undefined) data.residenceAddress = patch.residenceAddress;
    const firstName = patch.firstName?.trim() ?? "";
    const lastName = patch.lastName?.trim() ?? "";
    if ((patch.firstName !== undefined || patch.lastName !== undefined) && (firstName || lastName)) {
      data.firstName = firstName || null;
      data.lastName = lastName || null;
      data.profileName = [firstName, lastName].filter(Boolean).join(" ");
    }
    if (!Object.keys(data).length) return { user: current, created: false as const };
    const user = await this.bookings.updateUser(current.id, data);
    return { user, created: false as const };
  }

  private async findOrCreateClient(input: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    residenceAddress: string | null;
  }) {
    const email = normalizeEmail(input.email);
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const profileName = [firstName, lastName].filter(Boolean).join(" ");
    const existing = await this.bookings.findUserByEmailInsensitive(email);
    if (existing) {
      if (existing.role !== "CLIENT") throw new AppError("EMAIL_TAKEN", 409);
      const data: Record<string, unknown> = {};
      if (profileName) {
        data.firstName = firstName || null;
        data.lastName = lastName || null;
        data.profileName = profileName;
      }
      if (input.residenceAddress) data.residenceAddress = input.residenceAddress;
      if (!Object.keys(data).length) return { user: existing, created: false as const };
      const user = await this.bookings.updateUser(existing.id, data);
      return { user, created: false as const };
    }
    const passwordHash = await hashRandomGuestPassword();
    const user = await this.bookings.createUser({
      email,
      passwordHash,
      profileName,
      firstName,
      lastName,
      phone: input.phone.trim(),
      isGuest: true,
      residenceAddress: input.residenceAddress
    });
    return { user, created: true as const };
  }

  listMine(userId: string) {
    return this.bookings.findByUser(userId);
  }

  adminList() {
    return this.bookings.findAllWithUser();
  }

  async remove(id: string) {
    await this.bookings.deleteBooking(id);
    return { ok: true as const };
  }

  async savePlatformImage(id: string, bytes: Buffer, contentType: string) {
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowed.has(contentType)) throw new AppError("IMAGE_TYPE", 400);
    if (bytes.length === 0 || bytes.length > 8_000_000) throw new AppError("IMAGE_TOO_LARGE", 400);
    await this.bookings.savePlatformImage(id, Uint8Array.from(bytes), contentType);
    return { ok: true as const };
  }

  async readPlatformImage(id: string) {
    const row = await this.bookings.findPlatformImage(id);
    if (!row?.platformImage || row.platformImage.byteLength === 0) throw new AppError("NOT_FOUND", 404);
    return { type: row.platformImageType || "application/octet-stream", body: Buffer.from(row.platformImage) };
  }

  async setStatus(id: string, body: SetBookingStatusBody) {
    const updated = await this.bookings.updateStatus(id, body.status);
    const detail = await this.bookings.findByIdWithUser(id);
    if (detail?.user?.email) {
      this.mail.notifyBookingStatusChanged({
        bookingId: detail.id,
        startDate: detail.startDate,
        endDate: detail.endDate,
        status: detail.status,
        guestName: detail.user.profileName,
        guestEmail: detail.user.email,
        guestPhone: detail.user.phone,
        notes: detail.notes,
        equipment: detail.equipment,
        ancillaryTotalCents: detail.ancillaryTotalCents
      });
    }
    return updated;
  }

  async sendEmail(id: string) {
    const detail = await this.bookings.findByIdWithUser(id);
    if (!detail) throw new AppError("NOT_FOUND", 404);
    const email = detail.user?.email?.trim();
    if (!email) throw new AppError("NO_GUEST_EMAIL", 400);
    const owners = await this.bookings.listOwnerContacts();
    const copies = quittanceOwnerCopies(
      owners.map((link) => link.owner),
      email,
      ""
    );
    try {
      await this.mail.sendBookingEmailToGuest({
        bookingId: detail.id,
        startDate: detail.startDate,
        endDate: detail.endDate,
        status: detail.status,
        guestName: detail.user.profileName,
        guestEmail: email,
        guestPhone: detail.user.phone,
        notes: detail.notes,
        equipment: detail.equipment,
        ancillaryTotalCents: detail.ancillaryTotalCents,
        copies
      });
    } catch (e: any) {
      if (e?.name === "MAIL_DISABLED" || e?.message === "MAIL_DISABLED") {
        throw new AppError("MAIL_DISABLED", 503);
      }
      throw new AppError("MAIL_SEND_FAILED", 502);
    }
    return { ok: true as const, to: email, owners: copies.map((copy) => copy.email) };
  }

  async propose(id: string, body: ProposeBookingBody) {
    const detail = await this.bookings.findByIdWithUser(id);
    if (!detail) throw new AppError("NOT_FOUND", 404);
    if (detail.status !== "PENDING") throw new AppError("NOT_A_REQUEST", 409);
    const email = detail.user?.email?.trim();
    if (!email) throw new AppError("NO_GUEST_EMAIL", 400);

    const proposedStart = new Date(`${body.proposedStart}T00:00:00.000Z`);
    const proposedEnd = new Date(`${body.proposedEnd}T00:00:00.000Z`);
    if (!Number.isFinite(proposedStart.getTime()) || !Number.isFinite(proposedEnd.getTime()) || proposedEnd <= proposedStart) {
      throw new AppError("INVALID_PROPOSAL_DATES", 400);
    }

    try {
      await this.mail.sendCounterProposal({
        bookingId: detail.id,
        startDate: detail.startDate,
        endDate: detail.endDate,
        status: detail.status,
        guestName: detail.user?.profileName,
        guestEmail: email,
        guestPhone: detail.user?.phone,
        notes: detail.notes,
        equipment: detail.equipment,
        ancillaryTotalCents: detail.ancillaryTotalCents,
        proposedStart,
        proposedEnd,
        message: body.message.trim()
      });
    } catch (e: unknown) {
      const name = e instanceof Error ? e.message : "";
      if (name === "MAIL_DISABLED") throw new AppError("MAIL_DISABLED", 503);
      throw new AppError("MAIL_SEND_FAILED", 502);
    }
    return { ok: true as const, to: email };
  }

  async sendQuittance(
    id: string,
    body: SendQuittanceBody,
    extraAttachments: Array<{ filename: string; content: Buffer; contentType: string }> = []
  ) {
    const detail = await this.bookings.findByIdWithUser(id);
    if (!detail) throw new AppError("NOT_FOUND", 404);
    if (!detail.platform && body.rentCents + body.chargesCents <= 0) throw new AppError("VALIDATION_ERROR", 400);
    if (detail.status !== "CONFIRMED") throw new AppError("STAY_NOT_CONFIRMED", 409);
    const startYmd = detail.startDate.toISOString().slice(0, 10);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
    if (startYmd > today) throw new AppError("STAY_NOT_STARTED", 409);
    const email = detail.user?.email?.trim();
    if (!email) throw new AppError("NO_GUEST_EMAIL", 400);
    const owners = await this.bookings.listOwnerContacts();
    const copies = quittanceOwnerCopies(
      owners.map((link) => link.owner),
      email,
      body.bailleurEmail
    );

    try {
      await this.mail.sendQuittance({
        to: email,
        copies,
        guestName: detail.user?.profileName,
        bailleurName: body.bailleurName,
        bailleurAddress: body.bailleurAddress,
        bailleurPhone: body.bailleurPhone,
        bailleurEmail: body.bailleurEmail,
        tenantName: body.tenantName,
        tenantAddress: detail.user?.residenceAddress?.trim() || undefined,
        logement: body.logement,
        periodFrom: body.periodFrom,
        periodTo: body.periodTo,
        rentCents: body.rentCents,
        chargesCents: body.chargesCents,
        receivedCents: body.receivedCents,
        paymentDate: body.paymentDate,
        paymentMethod: body.paymentMethod,
        place: body.place,
        issueDate: body.issueDate,
        feeLines: body.feeLines,
        signatures: owners.map((link) => signatureOfOwner(link.owner)),
        ...(detail.platform ? { platform: detail.platform } : {}),
        ...(await this.platformProofOf(id, detail.platform, detail.platformImageType)),
        furnishedTourism: true,
        extraAttachments
      });
    } catch (e: unknown) {
      const name = e instanceof Error ? e.message : "";
      if (name !== "MAIL_DISABLED") {
        const detail = name.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
        console.error("[quittance]", detail || "envoi impossible");
      }
      if (name === "MAIL_DISABLED") throw new AppError("MAIL_DISABLED", 503);
      throw new AppError("MAIL_SEND_FAILED", 502);
    }
    return { ok: true as const, to: email, owners: copies.map((copy) => copy.email) };
  }

  private async platformProofOf(id: string, platform: string | null, imageType: string | null) {
    if (!platform || !imageType) return {};
    const row = await this.bookings.findPlatformImage(id);
    if (!row?.platformImage || row.platformImage.byteLength === 0) return {};
    return { platformProof: { platform, image: Buffer.from(row.platformImage) } };
  }

  async adminDetail(id: string) {
    const booking = await this.bookings.findByIdWithUser(id);
    if (!booking) throw new AppError("NOT_FOUND", 404);

    const pricing = await this.pricing.computeStayPricingSummary(
      new Date(booking.startDate),
      new Date(booking.endDate)
    );
    const snap = booking.ancillarySnapshot as Array<{ id?: string; label: string; priceCents: number }> | null;
    const ancillaryFees = Array.isArray(snap) ? snap : [];
    const ancillaryTotalCents =
      booking.ancillaryTotalCents ?? ancillaryFees.reduce((s, x) => s + (x.priceCents ?? 0), 0);
    const grandTotalCents = pricing.totalCents + ancillaryTotalCents;

    return {
      booking,
      pricing: {
        ...pricing,
        ancillaryFees,
        ancillaryTotalCents,
        grandTotalCents
      }
    };
  }
}
