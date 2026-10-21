import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../../shared/http.js";
import type { AppRole } from "../../shared/roles.js";

function splitPersonName(name: string | null | undefined): { firstName: string; lastName: string } {
  const trimmed = name?.trim() ?? "";
  const space = trimmed.indexOf(" ");
  if (!trimmed) return { firstName: "", lastName: "" };
  if (space < 0) return { firstName: "", lastName: trimmed };
  return { firstName: trimmed.slice(0, space), lastName: trimmed.slice(space + 1).trim() };
}

function emailLocalPart(email: string | null | undefined): string {
  const local = email?.split("@")[0]?.trim();
  return local || "Propriétaire";
}

/** Établissements dont l’utilisateur est membre ou propriétaire (fiche Owner liée). */
function linkedToUser(userId: string) {
  return {
    OR: [{ members: { some: { userId } } }, { owners: { some: { owner: { userId } } } }]
  };
}

export class PrismaEstablishmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listForAdmin(userId: string) {
    return this.prisma.establishment.findMany({
      where: linkedToUser(userId),
      orderBy: { createdAt: "asc" },
      include: {
        settings: { select: { studioName: true, address: true, city: true } },
        monthlyTenants: { orderBy: { name: "asc" } },
        owners: { orderBy: { createdAt: "asc" }, include: { owner: true } },
        coverMedia: { select: { id: true, type: true, isPublished: true } },
        portfolioMedia: {
          where: { isPublished: true, type: "image" },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
          take: 1,
          select: { id: true }
        }
      }
    });
  }

  activeId(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { activeEstablishmentId: true }
    });
  }

  findForAdmin(establishmentId: string, userId: string) {
    return this.prisma.establishment.findFirst({
      where: { id: establishmentId, ...linkedToUser(userId) }
    });
  }

  firstLinkedId(userId: string) {
    return this.prisma.establishment.findFirst({
      where: linkedToUser(userId),
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
  }

  createForAdmin(userId: string, name: string, rentalKind: "FURNISHED_TOURISM" | "UNFURNISHED_MONTHLY") {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { email: true, phone: true, profileName: true, ownerProfile: { select: { id: true } } }
      });
      const establishment = await tx.establishment.create({
        data: {
          name,
          rentalKind,
          isDefault: false,
          members: { create: { userId } },
          settings: { create: { studioName: name, equipments: [] } }
        }
      });
      const person = splitPersonName(user?.profileName);
      const ownerId =
        user?.ownerProfile?.id ??
        (
          await tx.owner.create({
            data: {
              userId,
              firstName: person.firstName,
              lastName: person.lastName || emailLocalPart(user?.email),
              email: user?.email ?? null,
              phone: user?.phone ?? null
            }
          })
        ).id;
      await tx.establishmentOwner.create({ data: { ownerId, establishmentId: establishment.id } });
      return establishment;
    });
  }

  updateForAdmin(
    establishmentId: string,
    data: {
      name?: string;
      rentalKind?: "FURNISHED_TOURISM" | "UNFURNISHED_MONTHLY";
      tenantName?: string | null;
      tenantEmail?: string | null;
      monthlyRentCents?: number;
      monthlyChargesCents?: number;
      description?: string;
      coverMediaId?: string | null;
    }
  ) {
    return this.prisma.establishment.update({ where: { id: establishmentId }, data });
  }

  listPublicCards() {
    return this.prisma.establishment.findMany({
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        rentalKind: true,
        description: true,
        settings: { select: { city: true } },
        coverMedia: { select: { id: true, type: true, isPublished: true } },
        portfolioMedia: {
          where: { isPublished: true, type: "image" },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
          take: 1,
          select: { id: true }
        }
      }
    });
  }

  findPublishedImage(establishmentId: string, mediaId: string) {
    return this.prisma.portfolioMedia.findFirst({
      where: { id: mediaId, establishmentId, isPublished: true, type: "image" },
      select: { id: true }
    });
  }

  listPublishedImages(establishmentId: string) {
    return this.prisma.portfolioMedia.findMany({
      where: { establishmentId, isPublished: true, type: "image" },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true }
    });
  }

  countEstablishments() {
    return this.prisma.establishment.count();
  }

  findReplacement(establishmentId: string) {
    return this.prisma.establishment.findFirst({
      where: { id: { not: establishmentId } },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
  }

  savePublicIdentity(establishmentId: string, data: { studioName?: string; address?: string | null; city?: string | null }) {
    return this.prisma.siteSettings.upsert({
      where: { establishmentId },
      update: data,
      create: {
        establishmentId,
        studioName: data.studioName ?? "Établissement",
        address: data.address ?? null,
        city: data.city ?? null,
        equipments: []
      }
    });
  }

  deleteEstablishment(establishmentId: string, replacementId: string, wasDefault: boolean) {
    return this.prisma.$transaction(async (tx) => {
      if (wasDefault) {
        await tx.establishment.update({ where: { id: replacementId }, data: { isDefault: true } });
      }
      await tx.user.updateMany({
        where: { activeEstablishmentId: establishmentId },
        data: { activeEstablishmentId: replacementId }
      });
      await tx.message.deleteMany({ where: { conversation: { establishmentId } } });
      await tx.quittance.deleteMany({ where: { establishmentId } });
      await tx.establishment.update({ where: { id: establishmentId }, data: { coverMediaId: null } });
      await tx.establishment.delete({ where: { id: establishmentId } });
    });
  }

  countTenants(establishmentId: string) {
    return this.prisma.monthlyTenant.count({ where: { establishmentId } });
  }

  createTenant(
    establishmentId: string,
    data: { name: string; firstName: string; lastName: string; email: string | null; phone: string | null; leaseStart: Date }
  ) {
    return this.prisma.monthlyTenant.create({ data: { establishmentId, ...data } });
  }

  listOwnerContacts(establishmentId: string) {
    return this.prisma.establishmentOwner.findMany({
      where: { establishmentId },
      orderBy: { createdAt: "asc" },
      select: {
        owner: { select: { id: true, email: true, firstName: true, lastName: true, isCompany: true, signaturePng: true } }
      }
    });
  }

  findTenant(establishmentId: string, tenantId: string) {
    return this.prisma.monthlyTenant.findFirst({
      where: { id: tenantId, establishmentId },
      include: { receipts: { orderBy: { periodFrom: "desc" } } }
    });
  }

  updateTenant(
    establishmentId: string,
    tenantId: string,
    data: {
      name: string;
      firstName: string;
      lastName: string;
      formerAddress: string | null;
      phone: string | null;
      email: string | null;
      visaNumber: string | null;
      nationality: string | null;
      birthDate: Date | null;
      leaseStart: Date;
    }
  ) {
    return this.prisma.monthlyTenant.updateMany({ where: { id: tenantId, establishmentId }, data });
  }

  upsertReceipt(data: {
    tenantId: string;
    establishmentId: string;
    periodFrom: Date;
    periodTo: Date;
    rentCents: number;
    chargesCents: number;
    receivedCents: number;
    paymentDate: Date;
    paymentMethod: string;
    place: string;
    issueDate: Date;
    bailleurName: string;
    bailleurAddress: string;
    bailleurPhone: string;
    bailleurEmail: string;
    logement: string;
    sentTo: string;
  }) {
    const lastSentAt = new Date();
    return this.prisma.rentReceipt.upsert({
      where: { tenantId_periodFrom: { tenantId: data.tenantId, periodFrom: data.periodFrom } },
      create: { ...data, lastSentAt },
      update: { ...data, lastSentAt }
    });
  }

  findReceipt(establishmentId: string, tenantId: string, receiptId: string) {
    return this.prisma.rentReceipt.findFirst({ where: { id: receiptId, establishmentId, tenantId } });
  }

  createQuittance(data: {
    establishmentId: string;
    tenantIds: string[];
    ownerIds: string[];
    periodFrom: Date;
    periodTo: Date;
    rentCents: number;
    chargesCents: number;
    receivedCents: number;
    paymentDate: Date;
    paymentMethod: string;
    place: string;
    issueDate: Date;
    bailleurName: string;
    bailleurAddress: string;
    bailleurPhone: string;
    bailleurEmail: string;
    tenantName: string;
    logement: string;
    sentTo: string;
    feeLines: Prisma.InputJsonValue;
  }) {
    const tenantIds = [...new Set(data.tenantIds)];
    const ownerIds = [...new Set(data.ownerIds)];
    if (tenantIds.length < 1 || ownerIds.length < 1) throw new AppError("QUITTANCE_PARTIES_REQUIRED", 409);
    return this.prisma.quittance.create({
      data: {
        establishmentId: data.establishmentId,
        periodFrom: data.periodFrom,
        periodTo: data.periodTo,
        rentCents: data.rentCents,
        chargesCents: data.chargesCents,
        receivedCents: data.receivedCents,
        paymentDate: data.paymentDate,
        paymentMethod: data.paymentMethod,
        place: data.place,
        issueDate: data.issueDate,
        bailleurName: data.bailleurName,
        bailleurAddress: data.bailleurAddress,
        bailleurPhone: data.bailleurPhone,
        bailleurEmail: data.bailleurEmail,
        tenantName: data.tenantName,
        logement: data.logement,
        sentTo: data.sentTo,
        feeLines: data.feeLines,
        tenants: { create: tenantIds.map((tenantId) => ({ tenantId })) },
        owners: { create: ownerIds.map((ownerId) => ({ ownerId })) }
      }
    });
  }

  countQuittancesForTenant(tenantId: string) {
    return this.prisma.quittanceTenant.count({ where: { tenantId } });
  }

  countQuittancesForOwner(ownerId: string) {
    return this.prisma.quittanceOwner.count({ where: { ownerId } });
  }

  ownerIdsWithSignature() {
    return this.prisma.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Owner" WHERE "signaturePng" IS NOT NULL`;
  }

  findSignature(ownerId: string) {
    return this.prisma.owner.findUnique({ where: { id: ownerId }, select: { signaturePng: true } });
  }

  saveSignature(ownerId: string, signaturePng: Buffer | null) {
    return this.prisma.owner.update({
      where: { id: ownerId },
      data: { signaturePng: signaturePng ? Uint8Array.from(signaturePng) : null }
    });
  }

  deleteTenant(establishmentId: string, tenantId: string) {
    return this.prisma.monthlyTenant.deleteMany({ where: { id: tenantId, establishmentId } });
  }

  listOwners() {
    return this.prisma.owner.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      include: {
        establishments: {
          include: { establishment: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" }
        }
      }
    });
  }

  createOwner(data: { firstName: string; lastName: string; email: string | null; phone: string | null }) {
    return this.prisma.owner.create({ data });
  }

  updateOwner(ownerId: string, data: { firstName: string; lastName: string; email: string | null; phone: string | null }) {
    return this.prisma.owner.update({ where: { id: ownerId }, data });
  }

  findOwner(ownerId: string) {
    return this.prisma.owner.findUnique({
      where: { id: ownerId },
      include: { establishments: { select: { establishmentId: true } } }
    });
  }

  countOwners(establishmentId: string) {
    return this.prisma.establishmentOwner.count({ where: { establishmentId } });
  }

  findOwnerLink(establishmentId: string, ownerId: string) {
    return this.prisma.establishmentOwner.findUnique({
      where: { ownerId_establishmentId: { ownerId, establishmentId } }
    });
  }

  attachOwner(establishmentId: string, ownerId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.establishmentOwner.create({ data: { establishmentId, ownerId } });
      const owner = await tx.owner.findUnique({ where: { id: ownerId }, select: { userId: true } });
      if (owner?.userId) {
        await tx.establishmentMember.upsert({
          where: { userId_establishmentId: { userId: owner.userId, establishmentId } },
          create: { userId: owner.userId, establishmentId },
          update: {}
        });
      }
    });
  }

  /** Quand un compte est rattaché à une fiche propriétaire, il devient membre de ses établissements. */
  ensureOwnerMemberships(ownerId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const links = await tx.establishmentOwner.findMany({ where: { ownerId }, select: { establishmentId: true } });
      for (const link of links) {
        await tx.establishmentMember.upsert({
          where: { userId_establishmentId: { userId, establishmentId: link.establishmentId } },
          create: { userId, establishmentId: link.establishmentId },
          update: {}
        });
      }
    });
  }

  detachOwner(establishmentId: string, ownerId: string) {
    return this.prisma.establishmentOwner.deleteMany({ where: { establishmentId, ownerId } });
  }

  deleteOwner(ownerId: string) {
    return this.prisma.owner.delete({ where: { id: ownerId } });
  }

  listDirectory() {
    const account = { select: { id: true, email: true, profileName: true, phone: true, role: true } };
    return Promise.all([
      this.prisma.owner.findMany({
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        include: {
          user: account,
          establishments: {
            include: { establishment: { select: { id: true, name: true } } },
            orderBy: { createdAt: "asc" }
          }
        }
      }),
      this.prisma.monthlyTenant.findMany({
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        include: {
          user: account,
          establishment: { select: { id: true, name: true, rentalKind: true } }
        }
      }),
      this.prisma.user.findMany({
        orderBy: { email: "asc" },
        select: { id: true, email: true, profileName: true, phone: true, role: true, isGuest: true }
      }),
      this.prisma.establishment.findMany({
        where: { rentalKind: "UNFURNISHED_MONTHLY" },
        orderBy: { name: "asc" },
        select: { id: true, name: true }
      })
    ]);
  }

  findOwnerUserLink(userId: string) {
    return this.prisma.owner.findUnique({ where: { userId }, select: { id: true } });
  }

  findTenantUserLink(userId: string) {
    return this.prisma.monthlyTenant.findUnique({ where: { userId }, select: { id: true } });
  }

  findEstablishment(establishmentId: string) {
    return this.prisma.establishment.findUnique({
      where: { id: establishmentId },
      select: { id: true, rentalKind: true }
    });
  }

  findTenantById(tenantId: string) {
    return this.prisma.monthlyTenant.findUnique({ where: { id: tenantId }, select: { id: true, establishmentId: true } });
  }

  updateDirectoryTenant(
    tenantId: string,
    data: {
      name: string;
      firstName: string;
      lastName: string;
      formerAddress: string | null;
      phone: string | null;
      email: string | null;
      visaNumber: string | null;
      nationality: string | null;
      birthDate: Date | null;
      leaseStart: Date;
      establishmentId: string;
      userId: string | null;
    }
  ) {
    return this.prisma.monthlyTenant.update({ where: { id: tenantId }, data });
  }

  updateDirectoryOwner(
    ownerId: string,
    data: {
      firstName: string;
      lastName: string;
      email: string | null;
      phone: string | null;
      address: string | null;
      isCompany: boolean;
      companyName: string | null;
      userId: string | null;
    }
  ) {
    return this.prisma.owner.update({ where: { id: ownerId }, data });
  }

  countAdmins() {
    return this.prisma.user.count({ where: { role: "ADMIN", isGuest: false } });
  }

  findUserRole(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  }

  findOwnerAccount(ownerId: string) {
    return this.prisma.owner.findUnique({
      where: { id: ownerId },
      select: { id: true, firstName: true, lastName: true, user: { select: { id: true, email: true } } }
    });
  }

  findTenantAccount(tenantId: string) {
    return this.prisma.monthlyTenant.findUnique({
      where: { id: tenantId },
      select: { id: true, firstName: true, lastName: true, name: true, user: { select: { id: true, email: true } } }
    });
  }

  createDirectoryOwner(data: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    isCompany: boolean;
    companyName: string | null;
    user: { email: string; passwordHash: string; profileName: string | null; phone: string | null; role: AppRole } | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const userId = data.user ? (await tx.user.create({ data: { ...data.user, isGuest: false } })).id : null;
      return tx.owner.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          address: data.address,
          isCompany: data.isCompany,
          companyName: data.companyName,
          userId
        }
      });
    });
  }

  createDirectoryTenant(data: {
    name: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    establishmentId: string;
    leaseStart: Date;
    user: { email: string; passwordHash: string; profileName: string | null; phone: string | null; role: AppRole } | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const userId = data.user ? (await tx.user.create({ data: { ...data.user, isGuest: false } })).id : null;
      return tx.monthlyTenant.create({
        data: {
          name: data.name,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          establishmentId: data.establishmentId,
          leaseStart: data.leaseStart,
          userId
        }
      });
    });
  }

  createAccountForOwner(
    ownerId: string,
    user: { email: string; passwordHash: string; profileName: string | null; phone: string | null; role: AppRole }
  ) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { ...user, isGuest: false } });
      await tx.owner.update({ where: { id: ownerId }, data: { userId: created.id } });
      return created;
    });
  }

  createAccountForTenant(
    tenantId: string,
    user: { email: string; passwordHash: string; profileName: string | null; phone: string | null; role: AppRole }
  ) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { ...user, isGuest: false } });
      await tx.monthlyTenant.update({ where: { id: tenantId }, data: { userId: created.id } });
      return created;
    });
  }

  updateUserPassword(userId: string, passwordHash: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  setPasswordSetup(userId: string, tokenHash: string, expires: Date) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordSetupTokenHash: tokenHash, passwordSetupExpires: expires }
    });
  }

  updateUserAccount(
    userId: string,
    data: { email: string; profileName: string | null; phone: string | null; role: AppRole; passwordHash?: string }
  ) {
    return this.prisma.user.update({ where: { id: userId }, data });
  }

  activate(userId: string, establishmentId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { activeEstablishmentId: establishmentId },
      select: { activeEstablishmentId: true }
    });
  }
}
