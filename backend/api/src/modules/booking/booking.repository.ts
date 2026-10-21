import type { Booking, BookingStatus, Prisma, PrismaClient, User } from "@prisma/client";
import { AppError } from "../../shared/http.js";
import { currentEstablishmentId } from "../../shared/establishmentContext.js";

type BookingView = Omit<Booking, "platformImage">;

export interface BookingRepository {
  findDayConfigByDate(date: Date): Promise<{ arrivalAllowed: boolean; departureAllowed: boolean } | null>;
  findOverlappingBooking(start: Date, end: Date, excludeId?: string): Promise<{ id: string } | null>;
  findOverlappingBlock(start: Date, end: Date): Promise<{ id: string } | null>;
  findUserByEmailInsensitive(email: string): Promise<User | null>;
  findUserByPhone(phone: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  listClients(): Promise<
    Array<{
      id: string;
      email: string;
      profileName: string | null;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      residenceAddress: string | null;
    }>
  >;
  createUser(data: {
    email: string;
    passwordHash: string;
    profileName: string;
    firstName?: string | null;
    lastName?: string | null;
    phone: string;
    isGuest: boolean;
    residenceAddress?: string | null;
  }): Promise<User>;
  updateUser(id: string, data: Record<string, unknown>): Promise<User>;
  findSettings(): Promise<{ bookingAutoConfirm: boolean } | null>;
  createBooking(data: {
    userId: string;
    startDate: Date;
    endDate: Date;
    notes?: string;
    equipment?: string;
    platform?: string | null;
    status: BookingStatus;
    ancillaryTotalCents: number;
    ancillarySnapshot: Prisma.InputJsonValue;
  }): Promise<Booking>;
  updateBooking(
    id: string,
    data: {
      startDate: Date;
      endDate: Date;
      notes: string | null;
      platform: string | null;
      clearPlatformImage: boolean;
    }
  ): Promise<void>;
  findOrCreateConversation(clientId: string): Promise<{ id: string }>;
  createMessage(data: { conversationId: string; senderId: string; body: string; bookingId?: string }): Promise<unknown>;
  deleteBooking(id: string): Promise<void>;
  touchConversation(id: string): Promise<void>;
  findPlatformImage(id: string): Promise<{ platformImage: Uint8Array | null; platformImageType: string | null } | null>;
  savePlatformImage(id: string, image: Uint8Array, contentType: string): Promise<void>;
  findByUser(userId: string): Promise<BookingView[]>;
  findAllWithUser(): Promise<
    Array<BookingView & { user: { email: string; profileName: string | null; phone: string | null } }>
  >;
  updateStatus(id: string, status: BookingStatus): Promise<Booking>;
  findByIdWithUser(id: string): Promise<
    | (BookingView & {
        user: {
          id: string;
          email: string;
          profileName: string | null;
          firstName: string | null;
          lastName: string | null;
          phone: string | null;
          residenceAddress: string | null;
        };
      })
    | null
  >;
  listOwnerContacts(): Promise<
    Array<{ owner: { email: string | null; firstName: string; lastName: string; isCompany: boolean; signaturePng: Uint8Array | null } }>
  >;
}

export class PrismaBookingRepository implements BookingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findDayConfigByDate(date: Date) {
    return this.prisma.dayConfig
      .findUnique({
        where: { establishmentId_date: { establishmentId: currentEstablishmentId(), date } }
      })
      .catch(() => null);
  }

  findOverlappingBooking(start: Date, end: Date, excludeId?: string) {
    return this.prisma.booking.findFirst({
      where: {
        establishmentId: currentEstablishmentId(),
        ...(excludeId ? { id: { not: excludeId } } : {}),
        status: { in: ["PENDING", "CONFIRMED"] },
        startDate: { lt: end },
        endDate: { gt: start }
      },
      select: { id: true }
    });
  }

  findOverlappingBlock(start: Date, end: Date) {
    return this.prisma.calendarBlock.findFirst({
      where: { establishmentId: currentEstablishmentId(), startDate: { lt: end }, endDate: { gt: start } },
      select: { id: true }
    });
  }

  findUserByEmailInsensitive(email: string) {
    // Les emails sont stockés en minuscules ; findUnique + fallback insensitive.
    return this.prisma.user
      .findUnique({ where: { email } })
      .then((u) => u ?? this.prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } }))
      .catch(() => null);
  }

  findUserByPhone(phone: string) {
    return this.prisma.user.findFirst({ where: { phone } }).catch(() => null);
  }

  findUserById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  listClients() {
    return this.prisma.user.findMany({
      where: { role: "CLIENT" },
      select: { id: true, email: true, profileName: true, firstName: true, lastName: true, phone: true, residenceAddress: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { email: "asc" }]
    });
  }

  createUser(data: {
    email: string;
    passwordHash: string;
    profileName: string;
    firstName?: string | null;
    lastName?: string | null;
    phone: string;
    isGuest: boolean;
    residenceAddress?: string | null;
  }) {
    return this.prisma.user.create({
      data: { ...data, role: "CLIENT" }
    });
  }

  updateUser(id: string, data: Record<string, unknown>) {
    return this.prisma.user.update({ where: { id }, data: data as never });
  }

  async findSettings() {
    const s = await this.prisma.siteSettings.findUnique({
      where: { establishmentId: currentEstablishmentId() }
    });
    return s ? { bookingAutoConfirm: s.bookingAutoConfirm } : null;
  }

  createBooking(data: {
    userId: string;
    startDate: Date;
    endDate: Date;
    notes?: string;
    equipment?: string;
    platform?: string | null;
    status: BookingStatus;
    ancillaryTotalCents: number;
    ancillarySnapshot: Prisma.InputJsonValue;
  }) {
    return this.prisma.booking.create({ data: { ...data, establishmentId: currentEstablishmentId() } });
  }

  async updateBooking(
    id: string,
    data: {
      startDate: Date;
      endDate: Date;
      notes: string | null;
      platform: string | null;
      clearPlatformImage: boolean;
    }
  ) {
    const existing = await this.prisma.booking.findFirst({
      where: { id, establishmentId: currentEstablishmentId() },
      select: { id: true }
    });
    if (!existing) throw new AppError("NOT_FOUND", 404);
    await this.prisma.booking.update({
      where: { id },
      data: {
        startDate: data.startDate,
        endDate: data.endDate,
        notes: data.notes,
        platform: data.platform,
        ...(data.clearPlatformImage ? { platformImage: null, platformImageType: null } : {})
      }
    });
  }

  async findOrCreateConversation(clientId: string) {
    const establishmentId = currentEstablishmentId();
    return (
      (await this.prisma.conversation.findUnique({
        where: { clientId_establishmentId: { clientId, establishmentId } }
      })) ??
      (await this.prisma.conversation.create({ data: { clientId, establishmentId } }))
    );
  }

  createMessage(data: { conversationId: string; senderId: string; body: string; bookingId?: string }) {
    return this.prisma.message.create({ data });
  }

  async deleteBooking(id: string) {
    const establishmentId = currentEstablishmentId();
    const existing = await this.prisma.booking.findFirst({
      where: { id, establishmentId },
      select: { id: true }
    });
    if (!existing) throw new AppError("NOT_FOUND", 404);

    await this.prisma.$transaction(async (tx) => {
      const linked = await tx.message.findMany({
        where: { bookingId: id },
        select: { conversationId: true }
      });
      const conversationIds = [...new Set(linked.map((m) => m.conversationId))];
      await tx.booking.delete({ where: { id } });
      if (!conversationIds.length) return;
      const remaining = await tx.message.groupBy({
        by: ["conversationId"],
        where: { conversationId: { in: conversationIds } },
        _count: { _all: true }
      });
      const stillUsed = new Set(remaining.map((row) => row.conversationId));
      const empty = conversationIds.filter((conversationId) => !stillUsed.has(conversationId));
      if (empty.length) {
        await tx.conversation.deleteMany({ where: { id: { in: empty }, establishmentId } });
      }
    });
  }

  async touchConversation(id: string) {
    await this.prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
  }

  findPlatformImage(id: string) {
    return this.prisma.booking.findFirst({
      where: { id, establishmentId: currentEstablishmentId() },
      select: { platformImage: true, platformImageType: true }
    });
  }

  async savePlatformImage(id: string, image: Uint8Array, contentType: string) {
    const existing = await this.prisma.booking.findFirst({
      where: { id, establishmentId: currentEstablishmentId() },
      select: { id: true, platform: true }
    });
    if (!existing) throw new AppError("NOT_FOUND", 404);
    if (!existing.platform) throw new AppError("PLATFORM_REQUIRED", 400);
    await this.prisma.booking.update({
      where: { id },
      data: { platformImage: Uint8Array.from(image) as Uint8Array<ArrayBuffer>, platformImageType: contentType }
    });
  }

  findByUser(userId: string) {
    return this.prisma.booking.findMany({
      where: { userId, establishmentId: currentEstablishmentId() },
      orderBy: { createdAt: "desc" },
      omit: { platformImage: true }
    });
  }

  findAllWithUser() {
    return this.prisma.booking.findMany({
      where: { establishmentId: currentEstablishmentId() },
      orderBy: { createdAt: "desc" },
      omit: { platformImage: true },
      include: { user: { select: { email: true, profileName: true, phone: true } } }
    });
  }

  async updateStatus(id: string, status: BookingStatus) {
    const existing = await this.prisma.booking.findFirst({
      where: { id, establishmentId: currentEstablishmentId() }
    });
    if (!existing) throw new AppError("NOT_FOUND", 404);
    return this.prisma.booking.update({ where: { id }, data: { status } });
  }

  findByIdWithUser(id: string) {
    return this.prisma.booking.findFirst({
      where: { id, establishmentId: currentEstablishmentId() },
      omit: { platformImage: true },
      include: {
        user: {
          select: { id: true, email: true, profileName: true, firstName: true, lastName: true, phone: true, residenceAddress: true }
        }
      }
    });
  }

  listOwnerContacts() {
    return this.prisma.establishmentOwner.findMany({
      where: { establishmentId: currentEstablishmentId() },
      orderBy: { createdAt: "asc" },
      select: { owner: { select: { email: true, firstName: true, lastName: true, isCompany: true, signaturePng: true } } }
    });
  }
}
