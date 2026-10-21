import { getEnv } from "../../config/env.js";
import { joinTenantNames, signatureOfOwner } from "../mail/quittancePdf.js";
import { quittanceOwnerCopies, type MailService } from "../mail/mail.service.js";
import { AppError } from "../../shared/http.js";
import type { AppRole } from "../../shared/roles.js";
import { hashPassword, makeSetupToken, makeTemporaryPassword, normalizeEmail } from "../../shared/password.js";
import type { CreateDirectoryOwnerBody, CreateDirectoryTenantBody, CreateEstablishmentBody, CreateMonthlyTenantBody, CreateOwnerBody, NewAccountBody, SendAccountConfirmationBody, SendMonthlyQuittanceBody, UpdateDirectoryOwnerBody, UpdateDirectoryTenantBody, UpdateEstablishmentBody, UpdateMonthlyTenantBody, UpdateOwnerBody } from "./establishment.dto.js";
import type { PrismaEstablishmentRepository } from "./establishment.repository.js";

function parisTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function ymdUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function monthKey(ymd: string): string {
  return ymd.slice(0, 7);
}

function addMonths(yearMonth: string, delta: number): string {
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function displayName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

function ownerLegal(body: { address: string; isCompany: boolean; companyName: string }) {
  const companyName = body.companyName.trim();
  if (body.isCompany && !companyName) throw new AppError("COMPANY_NAME_REQUIRED", 400);
  return {
    address: body.address.trim() || null,
    isCompany: body.isCompany,
    companyName: body.isCompany ? companyName : null
  };
}

/** Conflit d’unicité Prisma (e-mail de compte ou lien déjà pris). */
function isUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "P2002";
}

function summarizeDescription(text: string, max = 180): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  const base = space > 40 ? cut.slice(0, space) : cut;
  return `${base.trimEnd()}…`;
}

function accountView(user: { id: string; email: string; profileName: string | null; phone: string | null; role: AppRole } | null) {
  if (!user) return null;
  return { id: user.id, email: user.email, profileName: user.profileName ?? "", phone: user.phone ?? "", role: user.role };
}

export class EstablishmentService {
  constructor(
    private readonly establishments: PrismaEstablishmentRepository,
    private readonly mail: MailService
  ) {}

  async list(userId: string) {
    const [rows, active, signedRows] = await Promise.all([
      this.establishments.listForAdmin(userId),
      this.establishments.activeId(userId),
      this.establishments.ownerIdsWithSignature()
    ]);
    const signed = new Set(signedRows.map((row) => row.id));
    const activeId = active?.activeEstablishmentId ?? null;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      rentalKind: row.rentalKind,
      tenants: row.monthlyTenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        phone: tenant.phone,
        formerAddress: tenant.formerAddress
      })),
      monthlyRentCents: row.monthlyRentCents,
      monthlyChargesCents: row.monthlyChargesCents,
      owners: row.owners.map((link) => ({
        id: link.owner.id,
        firstName: link.owner.firstName,
        lastName: link.owner.lastName,
        email: link.owner.email,
        phone: link.owner.phone,
        address: link.owner.address,
        isCompany: link.owner.isCompany,
        companyName: link.owner.companyName,
        hasSignature: signed.has(link.owner.id)
      })),
      address: row.settings?.address ?? null,
      city: row.settings?.city ?? "",
      studioName: row.settings?.studioName ?? row.name,
      description: row.description,
      summary: summarizeDescription(row.description),
      coverMediaId: row.coverMediaId,
      coverUrl: (() => {
        const chosen = row.coverMedia?.isPublished && row.coverMedia.type === "image" ? row.coverMedia.id : null;
        const coverId = chosen ?? row.portfolioMedia[0]?.id ?? null;
        return coverId ? `/api/public/media/${coverId}?variant=thumb` : null;
      })(),
      active: row.id === activeId
    }));
  }

  async listPublicCards() {
    const rows = await this.establishments.listPublicCards();
    return rows.map((row) => {
      const chosen = row.coverMedia?.isPublished && row.coverMedia.type === "image" ? row.coverMedia.id : null;
      const coverId = chosen ?? row.portfolioMedia[0]?.id ?? null;
      return {
        id: row.id,
        name: row.name,
        rentalKind: row.rentalKind,
        summary: summarizeDescription(row.description),
        city: row.settings?.city?.trim() ?? "",
        coverUrl: coverId ? `/api/public/media/${coverId}?variant=thumb` : null
      };
    });
  }

  async publishedImages(userId: string, establishmentId: string) {
    const existing = await this.establishments.findForAdmin(establishmentId, userId);
    if (!existing) throw new AppError("NOT_FOUND", 404);
    const images = await this.establishments.listPublishedImages(establishmentId);
    return images.map((image) => ({
      id: image.id,
      title: image.title,
      thumbUrl: `/api/public/media/${image.id}?variant=thumb`
    }));
  }

  async listOwners() {
    const rows = await this.establishments.listOwners();
    return rows.map((owner) => ({
      id: owner.id,
      firstName: owner.firstName,
      lastName: owner.lastName,
      email: owner.email,
      phone: owner.phone,
      establishments: owner.establishments.map((link) => ({
        id: link.establishment.id,
        name: link.establishment.name
      }))
    }));
  }

  async createOwner(body: CreateOwnerBody) {
    const owner = await this.establishments.createOwner({
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null
    });
    return { id: owner.id, firstName: owner.firstName, lastName: owner.lastName, email: owner.email, phone: owner.phone, establishments: [] };
  }

  async updateOwner(ownerId: string, body: UpdateOwnerBody) {
    const existing = await this.establishments.findOwner(ownerId);
    if (!existing) throw new AppError("NOT_FOUND", 404);
    const owner = await this.establishments.updateOwner(ownerId, {
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      email: body.email.trim() || null,
      phone: body.phone.trim() || null
    });
    return { id: owner.id, firstName: owner.firstName, lastName: owner.lastName, email: owner.email, phone: owner.phone };
  }

  async directory() {
    const [[owners, tenants, users, monthlyEstablishments], signedRows] = await Promise.all([
      this.establishments.listDirectory(),
      this.establishments.ownerIdsWithSignature()
    ]);
    const signed = new Set(signedRows.map((row) => row.id));
    return {
      owners: owners.map((owner) => ({
        id: owner.id,
        firstName: owner.firstName,
        lastName: owner.lastName,
        email: owner.email ?? "",
        phone: owner.phone ?? "",
        address: owner.address ?? "",
        isCompany: owner.isCompany,
        companyName: owner.companyName ?? "",
        establishments: owner.establishments.map((link) => ({ id: link.establishment.id, name: link.establishment.name })),
        hasSignature: signed.has(owner.id),
        user: accountView(owner.user)
      })),
      tenants: tenants.map((tenant) => ({
        id: tenant.id,
        establishmentId: tenant.establishmentId,
        establishmentName: tenant.establishment.name,
        firstName: tenant.firstName,
        lastName: tenant.lastName || tenant.name,
        email: tenant.email ?? "",
        phone: tenant.phone ?? "",
        formerAddress: tenant.formerAddress ?? "",
        visaNumber: tenant.visaNumber ?? "",
        nationality: tenant.nationality ?? "",
        birthDate: tenant.birthDate ? ymdUtc(tenant.birthDate) : "",
        leaseStart: ymdUtc(tenant.leaseStart ?? tenant.createdAt),
        user: accountView(tenant.user)
      })),
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        profileName: user.profileName ?? "",
        phone: user.phone ?? "",
        role: user.role,
        isGuest: user.isGuest
      })),
      establishments: monthlyEstablishments
    };
  }

  private async assertUserLink(userId: string, kind: "owner" | "tenant", currentId: string) {
    if (kind === "owner") {
      const taken = await this.establishments.findOwnerUserLink(userId);
      if (taken && taken.id !== currentId) throw new AppError("USER_ALREADY_LINKED", 409);
      return;
    }
    const taken = await this.establishments.findTenantUserLink(userId);
    if (taken && taken.id !== currentId) throw new AppError("USER_ALREADY_LINKED", 409);
  }

  private async saveAccount(userId: string, account: NonNullable<UpdateDirectoryOwnerBody["account"]>) {
    const existing = await this.establishments.findUserRole(userId);
    if (!existing) throw new AppError("NOT_FOUND", 404);
    if (existing.role === "ADMIN" && account.role !== "ADMIN") {
      const admins = await this.establishments.countAdmins();
      if (admins <= 1) throw new AppError("LAST_ADMIN", 409);
    }
    try {
      await this.establishments.updateUserAccount(userId, {
        email: normalizeEmail(account.email),
        profileName: account.profileName.trim() || null,
        phone: account.phone.trim() || null,
        role: account.role,
        ...(account.password ? { passwordHash: await hashPassword(account.password) } : {})
      });
    } catch (error: unknown) {
      if (isUniqueConflict(error)) throw new AppError("EMAIL_TAKEN", 409);
      throw error;
    }
  }

  async updateDirectoryOwner(ownerId: string, body: UpdateDirectoryOwnerBody) {
    const existing = await this.establishments.findOwner(ownerId);
    if (!existing) throw new AppError("NOT_FOUND", 404);
    const userId = body.userId.trim() || null;
    if (userId) await this.assertUserLink(userId, "owner", ownerId);
    try {
      await this.establishments.updateDirectoryOwner(ownerId, {
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        email: body.email.trim() || null,
        phone: body.phone.trim() || null,
        ...ownerLegal(body),
        userId
      });
    } catch (error: unknown) {
      if (isUniqueConflict(error)) throw new AppError("USER_ALREADY_LINKED", 409);
      throw error;
    }
    if (userId && body.account) await this.saveAccount(userId, body.account);
    if (userId) await this.establishments.ensureOwnerMemberships(ownerId, userId);
    return this.directory();
  }

  async updateDirectoryTenant(tenantId: string, body: UpdateDirectoryTenantBody) {
    const existing = await this.establishments.findTenantById(tenantId);
    if (!existing) throw new AppError("NOT_FOUND", 404);
    const establishment = await this.establishments.findEstablishment(body.establishmentId);
    if (!establishment || establishment.rentalKind !== "UNFURNISHED_MONTHLY") throw new AppError("NOT_MONTHLY_RENTAL", 409);
    const userId = body.userId.trim() || null;
    if (userId) await this.assertUserLink(userId, "tenant", tenantId);
    const firstName = body.firstName.trim();
    const lastName = body.lastName.trim();
    try {
      await this.establishments.updateDirectoryTenant(tenantId, {
        name: displayName(firstName, lastName),
        firstName,
        lastName,
        formerAddress: body.formerAddress.trim() || null,
        phone: body.phone.trim() || null,
        email: body.email.trim() || null,
        visaNumber: body.visaNumber.trim() || null,
        nationality: body.nationality.trim() || null,
        birthDate: body.birthDate ? parseYmd(body.birthDate) : null,
        leaseStart: parseYmd(body.leaseStart),
        establishmentId: body.establishmentId,
        userId
      });
    } catch (error: unknown) {
      if (isUniqueConflict(error)) throw new AppError("USER_ALREADY_LINKED", 409);
      throw error;
    }
    if (userId && body.account) await this.saveAccount(userId, body.account);
    return this.directory();
  }

  private async accountRecord(account: NewAccountBody) {
    const temporaryPassword = account.password.trim() || makeTemporaryPassword();
    return {
      temporaryPassword,
      record: {
        email: normalizeEmail(account.email),
        passwordHash: await hashPassword(temporaryPassword),
        profileName: account.profileName.trim() || null,
        phone: account.phone.trim() || null,
        role: account.role
      }
    };
  }

  /** Envoie l’accès : mot de passe temporaire et lien à usage unique pour le changer. */
  private async deliverAccountAccess(userId: string, email: string, name: string, temporaryPassword: string | null) {
    const setup = makeSetupToken();
    const expires = new Date(Date.now() + 72 * 60 * 60 * 1000);
    await this.establishments.setPasswordSetup(userId, setup.hash, expires);
    const setupUrl = `${getEnv().APP_ORIGIN.replace(/\/$/, "")}/choisir-mot-de-passe?token=${setup.token}`;
    try {
      await this.mail.sendAccountConfirmation({ to: email, name, password: temporaryPassword, setupUrl });
      return { ok: true as const, to: email };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      return {
        ok: false as const,
        error: message === "MAIL_DISABLED" ? ("MAIL_DISABLED" as const) : ("MAIL_SEND_FAILED" as const)
      };
    }
  }

  private async withAccountMail<T extends { userId: string | null }>(
    created: T,
    access: { email: string; name: string; temporaryPassword: string } | null
  ) {
    const directory = await this.directory();
    if (!access || !created.userId) return directory;
    const mail = await this.deliverAccountAccess(created.userId, access.email, access.name, access.temporaryPassword);
    return { ...directory, mail };
  }

  async createDirectoryOwner(body: CreateDirectoryOwnerBody) {
    const built = body.account ? await this.accountRecord(body.account) : null;
    let created;
    try {
      created = await this.establishments.createDirectoryOwner({
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        email: body.email.trim() || null,
        phone: body.phone.trim() || null,
        ...ownerLegal(body),
        user: built?.record ?? null
      });
    } catch (error: unknown) {
      if (isUniqueConflict(error)) throw new AppError("EMAIL_TAKEN", 409);
      throw error;
    }
    return this.withAccountMail(created, built ? { email: built.record.email, name: displayName(body.firstName, body.lastName), temporaryPassword: built.temporaryPassword } : null);
  }

  async createDirectoryTenant(body: CreateDirectoryTenantBody) {
    const establishment = await this.establishments.findEstablishment(body.establishmentId);
    if (!establishment || establishment.rentalKind !== "UNFURNISHED_MONTHLY") throw new AppError("NOT_MONTHLY_RENTAL", 409);
    const firstName = body.firstName.trim();
    const lastName = body.lastName.trim();
    const built = body.account ? await this.accountRecord(body.account) : null;
    let created;
    try {
      created = await this.establishments.createDirectoryTenant({
        name: displayName(firstName, lastName),
        firstName,
        lastName,
        email: body.email.trim() || null,
        phone: body.phone.trim() || null,
        establishmentId: body.establishmentId,
        leaseStart: parseYmd(body.leaseStart),
        user: built?.record ?? null
      });
    } catch (error: unknown) {
      if (isUniqueConflict(error)) throw new AppError("EMAIL_TAKEN", 409);
      throw error;
    }
    return this.withAccountMail(created, built ? { email: built.record.email, name: displayName(firstName, lastName), temporaryPassword: built.temporaryPassword } : null);
  }

  async createOwnerAccount(ownerId: string, account: NewAccountBody) {
    const owner = await this.establishments.findOwnerAccount(ownerId);
    if (!owner) throw new AppError("NOT_FOUND", 404);
    if (owner.user) throw new AppError("ACCOUNT_EXISTS", 409);
    const built = await this.accountRecord(account);
    let created;
    try {
      created = await this.establishments.createAccountForOwner(ownerId, built.record);
    } catch (error: unknown) {
      if (isUniqueConflict(error)) throw new AppError("EMAIL_TAKEN", 409);
      throw error;
    }
    const directory = await this.directory();
    const mail = await this.deliverAccountAccess(created.id, created.email, displayName(owner.firstName, owner.lastName), built.temporaryPassword);
    return { ...directory, mail };
  }

  async createTenantAccount(tenantId: string, account: NewAccountBody) {
    const tenant = await this.establishments.findTenantAccount(tenantId);
    if (!tenant) throw new AppError("NOT_FOUND", 404);
    if (tenant.user) throw new AppError("ACCOUNT_EXISTS", 409);
    const built = await this.accountRecord(account);
    let created;
    try {
      created = await this.establishments.createAccountForTenant(tenantId, built.record);
    } catch (error: unknown) {
      if (isUniqueConflict(error)) throw new AppError("EMAIL_TAKEN", 409);
      throw error;
    }
    const directory = await this.directory();
    const name = displayName(tenant.firstName, tenant.lastName) || tenant.name;
    const mail = await this.deliverAccountAccess(created.id, created.email, name, built.temporaryPassword);
    return { ...directory, mail };
  }

  async sendOwnerConfirmation(ownerId: string, body: SendAccountConfirmationBody) {
    const owner = await this.establishments.findOwnerAccount(ownerId);
    if (!owner) throw new AppError("NOT_FOUND", 404);
    return this.sendConfirmation(owner.user, displayName(owner.firstName, owner.lastName), body.password);
  }

  async sendTenantConfirmation(tenantId: string, body: SendAccountConfirmationBody) {
    const tenant = await this.establishments.findTenantAccount(tenantId);
    if (!tenant) throw new AppError("NOT_FOUND", 404);
    const name = displayName(tenant.firstName, tenant.lastName) || tenant.name;
    return this.sendConfirmation(tenant.user, name, body.password);
  }

  private async sendConfirmation(user: { id: string; email: string } | null, name: string, password: string) {
    if (!user?.email) throw new AppError("NO_ACCOUNT", 400);
    const temporary = password.trim();
    if (temporary) await this.establishments.updateUserPassword(user.id, await hashPassword(temporary));
    const result = await this.deliverAccountAccess(user.id, user.email, name, temporary || null);
    if (!result.ok) throw new AppError(result.error, result.error === "MAIL_DISABLED" ? 503 : 502);
    return { ok: true as const, to: result.to };
  }

  async deleteOwner(ownerId: string) {
    const owner = await this.establishments.findOwner(ownerId);
    if (!owner) throw new AppError("NOT_FOUND", 404);
    if ((await this.establishments.countQuittancesForOwner(ownerId)) > 0) throw new AppError("QUITTANCE_LINKED", 409);
    for (const link of owner.establishments) {
      const count = await this.establishments.countOwners(link.establishmentId);
      if (count <= 1) throw new AppError("LAST_OWNER", 409);
    }
    for (const link of owner.establishments) {
      await this.establishments.detachOwner(link.establishmentId, ownerId);
    }
    await this.establishments.deleteOwner(ownerId);
    return { ok: true as const };
  }

  async attachOwner(userId: string, establishmentId: string, ownerId: string) {
    const establishment = await this.establishments.findForAdmin(establishmentId, userId);
    if (!establishment) throw new AppError("FORBIDDEN", 403);
    const owner = await this.establishments.findOwner(ownerId);
    if (!owner) throw new AppError("NOT_FOUND", 404);
    const existing = await this.establishments.findOwnerLink(establishmentId, ownerId);
    if (existing) throw new AppError("ALREADY_OWNER", 409);
    await this.establishments.attachOwner(establishmentId, ownerId);
    return { ok: true as const };
  }

  async detachOwner(userId: string, establishmentId: string, ownerId: string) {
    const establishment = await this.establishments.findForAdmin(establishmentId, userId);
    if (!establishment) throw new AppError("FORBIDDEN", 403);
    const existing = await this.establishments.findOwnerLink(establishmentId, ownerId);
    if (!existing) throw new AppError("NOT_FOUND", 404);
    const count = await this.establishments.countOwners(establishmentId);
    if (count <= 1) throw new AppError("LAST_OWNER", 409);
    await this.establishments.detachOwner(establishmentId, ownerId);
    return { ok: true as const };
  }

  async create(userId: string, body: CreateEstablishmentBody) {
    const created = await this.establishments.createForAdmin(userId, body.name, body.rentalKind);
    await this.establishments.activate(userId, created.id);
    return { id: created.id, name: created.name, rentalKind: created.rentalKind, active: true };
  }

  async update(userId: string, establishmentId: string, body: UpdateEstablishmentBody) {
    const existing = await this.establishments.findForAdmin(establishmentId, userId);
    if (!existing) throw new AppError("FORBIDDEN", 403);
    if (body.rentalKind === "FURNISHED_TOURISM" && existing.rentalKind !== "FURNISHED_TOURISM") {
      const tenants = await this.establishments.countTenants(establishmentId);
      if (tenants > 0) throw new AppError("HAS_TENANTS", 409);
    }
    let coverMediaId = body.coverMediaId;
    if (coverMediaId) {
      const image = await this.establishments.findPublishedImage(establishmentId, coverMediaId);
      if (!image) throw new AppError("COVER_NOT_FOUND", 400);
    }
    const updated = await this.establishments.updateForAdmin(establishmentId, {
      name: body.name?.trim(),
      rentalKind: body.rentalKind,
      tenantName: body.tenantName === undefined ? undefined : body.tenantName?.trim() || null,
      tenantEmail: body.tenantEmail === undefined ? undefined : body.tenantEmail?.trim() || null,
      monthlyRentCents: body.monthlyRentCents,
      monthlyChargesCents: body.monthlyChargesCents,
      description: body.description === undefined ? undefined : body.description.trim(),
      coverMediaId
    });
    if (body.name !== undefined || body.address !== undefined || body.city !== undefined) {
      await this.establishments.savePublicIdentity(establishmentId, {
        ...(body.name !== undefined ? { studioName: body.name.trim() } : {}),
        ...(body.address !== undefined ? { address: body.address.trim() || null } : {}),
        ...(body.city !== undefined ? { city: body.city.trim() || null } : {})
      });
    }
    return {
      id: updated.id,
      rentalKind: updated.rentalKind,
      tenantName: updated.tenantName,
      tenantEmail: updated.tenantEmail,
      monthlyRentCents: updated.monthlyRentCents,
      monthlyChargesCents: updated.monthlyChargesCents
    };
  }

  /** Établissement mensuel dont l’admin est membre. */
  private async requireMonthly(userId: string, establishmentId: string) {
    const establishment = await this.establishments.findForAdmin(establishmentId, userId);
    if (!establishment) throw new AppError("FORBIDDEN", 403);
    if (establishment.rentalKind !== "UNFURNISHED_MONTHLY") throw new AppError("NOT_MONTHLY_RENTAL", 409);
    return establishment;
  }

  async createTenant(userId: string, establishmentId: string, body: CreateMonthlyTenantBody) {
    await this.requireMonthly(userId, establishmentId);
    const trimmed = body.name.trim();
    const space = trimmed.indexOf(" ");
    const firstName = space > 0 ? trimmed.slice(0, space) : "";
    const lastName = space > 0 ? trimmed.slice(space + 1).trim() : trimmed;
    const today = parisTodayYmd();
    return this.establishments.createTenant(establishmentId, {
      name: trimmed,
      firstName,
      lastName,
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      leaseStart: parseYmd(`${today.slice(0, 7)}-01`)
    });
  }

  async tenantFile(userId: string, establishmentId: string, tenantId: string) {
    const establishment = await this.requireMonthly(userId, establishmentId);
    const tenant = await this.establishments.findTenant(establishmentId, tenantId);
    if (!tenant) throw new AppError("NOT_FOUND", 404);
    const dueCents = establishment.monthlyRentCents + establishment.monthlyChargesCents;
    const leaseKey = monthKey(ymdUtc(tenant.leaseStart ?? tenant.createdAt));
    const endKey = monthKey(parisTodayYmd());
    const windowStart = addMonths(endKey, -47);
    const startKey = leaseKey > windowStart ? leaseKey : windowStart;
    const byMonth = new Map(tenant.receipts.map((receipt) => [monthKey(ymdUtc(receipt.periodFrom)), receipt]));
    const months: Array<{
      month: string;
      status: "paid" | "partial" | "unpaid";
      dueCents: number;
      receivedCents: number;
      balanceCents: number;
      receiptId: string | null;
    }> = [];
    if (startKey <= endKey) {
      for (let cursor = startKey, guard = 0; cursor <= endKey && guard < 48; cursor = addMonths(cursor, 1), guard += 1) {
        const receipt = byMonth.get(cursor);
        if (!receipt) {
          months.push({
            month: cursor,
            status: "unpaid",
            dueCents,
            receivedCents: 0,
            balanceCents: dueCents,
            receiptId: null
          });
          continue;
        }
        const monthDue = receipt.rentCents + receipt.chargesCents;
        const balance = Math.max(0, monthDue - receipt.receivedCents);
        months.push({
          month: cursor,
          status: monthDue > 0 && receipt.receivedCents >= monthDue ? "paid" : receipt.receivedCents > 0 ? "partial" : "unpaid",
          dueCents: monthDue,
          receivedCents: receipt.receivedCents,
          balanceCents: balance,
          receiptId: receipt.id
        });
      }
    }
    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        firstName: tenant.firstName,
        lastName: tenant.lastName || tenant.name,
        email: tenant.email,
        phone: tenant.phone,
        formerAddress: tenant.formerAddress,
        visaNumber: tenant.visaNumber,
        nationality: tenant.nationality,
        birthDate: tenant.birthDate ? ymdUtc(tenant.birthDate) : "",
        leaseStart: ymdUtc(tenant.leaseStart ?? tenant.createdAt)
      },
      months: months.reverse()
    };
  }

  async updateTenant(userId: string, establishmentId: string, tenantId: string, body: UpdateMonthlyTenantBody) {
    await this.requireMonthly(userId, establishmentId);
    const existing = await this.establishments.findTenant(establishmentId, tenantId);
    if (!existing) throw new AppError("NOT_FOUND", 404);
    const firstName = body.firstName.trim();
    const lastName = body.lastName.trim();
    const updated = await this.establishments.updateTenant(establishmentId, tenantId, {
      name: displayName(firstName, lastName),
      firstName,
      lastName,
      formerAddress: body.formerAddress.trim() || null,
      phone: body.phone.trim() || null,
      email: body.email.trim() || null,
      visaNumber: body.visaNumber.trim() || null,
      nationality: body.nationality.trim() || null,
      birthDate: body.birthDate ? parseYmd(body.birthDate) : null,
      leaseStart: parseYmd(body.leaseStart)
    });
    if (updated.count === 0) throw new AppError("NOT_FOUND", 404);
    return this.tenantFile(userId, establishmentId, tenantId);
  }

  async deleteTenant(userId: string, establishmentId: string, tenantId: string) {
    await this.requireMonthly(userId, establishmentId);
    if ((await this.establishments.countQuittancesForTenant(tenantId)) > 0) throw new AppError("QUITTANCE_LINKED", 409);
    const removed = await this.establishments.deleteTenant(establishmentId, tenantId);
    if (removed.count === 0) throw new AppError("NOT_FOUND", 404);
    return { ok: true as const };
  }

  async remove(userId: string, establishmentId: string) {
    const existing = await this.establishments.findForAdmin(establishmentId, userId);
    if (!existing) throw new AppError("NOT_FOUND", 404);
    const count = await this.establishments.countEstablishments();
    if (count <= 1) throw new AppError("LAST_ESTABLISHMENT", 409);
    const replacement = await this.establishments.findReplacement(establishmentId);
    if (!replacement) throw new AppError("LAST_ESTABLISHMENT", 409);
    await this.establishments.deleteEstablishment(establishmentId, replacement.id, existing.isDefault);
    return { ok: true as const };
  }

  async activate(userId: string, establishmentId: string) {
    const establishment = await this.establishments.findForAdmin(establishmentId, userId);
    if (!establishment) throw new AppError("NOT_FOUND", 404);
    await this.establishments.activate(userId, establishmentId);
    return { ok: true as const, id: establishmentId };
  }

  async sendMonthlyQuittance(
    userId: string,
    body: SendMonthlyQuittanceBody,
    extraAttachments: Array<{ filename: string; content: Buffer; contentType: string }> = []
  ) {
    const active = await this.establishments.activeId(userId);
    const establishmentId = body.establishmentId || active?.activeEstablishmentId;
    if (!establishmentId) throw new AppError("NO_ESTABLISHMENT", 503);
    const establishment = await this.establishments.findForAdmin(establishmentId, userId);
    if (!establishment) throw new AppError("NOT_FOUND", 404);
    if (establishment.rentalKind !== "UNFURNISHED_MONTHLY") throw new AppError("NOT_MONTHLY_RENTAL", 409);
    const owners = await this.establishments.listOwnerContacts(establishmentId);
    const ownerIds = [...new Set(owners.map((link) => link.owner.id))];
    if (ownerIds.length < 1) throw new AppError("OWNERS_REQUIRED", 409);
    const signatures = owners.map((link) => signatureOfOwner(link.owner));

    const issue = async (spec: {
      tenantIds: string[];
      recipients: Array<{ email: string; name: string }>;
      occupants: Array<{ name: string; email?: string; phone?: string; address?: string }>;
      tenantName: string;
      rentCents: number;
      chargesCents: number;
      receivedCents: number;
      emailsByTenant: Map<string, string>;
    }) => {
      const primary = spec.recipients[0];
      if (!primary) throw new AppError("NO_GUEST_EMAIL", 400);
      const blocked = new Set(spec.recipients.map((person) => person.email.toLowerCase()));
      const copies = quittanceOwnerCopies(owners.map((link) => link.owner), primary.email, body.bailleurEmail).filter(
        (copy) => !blocked.has(copy.email.toLowerCase())
      );
      try {
        await this.mail.sendQuittance({
          to: primary.email,
          alsoTo: spec.recipients.slice(1),
          copies,
          guestName: primary.name,
          bailleurName: body.bailleurName,
          bailleurAddress: body.bailleurAddress,
          bailleurPhone: body.bailleurPhone,
          bailleurEmail: body.bailleurEmail,
          tenantName: spec.tenantName,
          occupants: spec.occupants,
          logement: body.logement,
          periodFrom: body.periodFrom,
          periodTo: body.periodTo,
          rentCents: spec.rentCents,
          chargesCents: spec.chargesCents,
          receivedCents: spec.receivedCents,
          paymentDate: body.paymentDate,
          paymentMethod: body.paymentMethod,
          place: body.place,
          issueDate: body.issueDate,
          feeLines: body.feeLines,
          signatures,
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
      for (const tenantId of spec.tenantIds) {
        const sentTo = spec.emailsByTenant.get(tenantId) || primary.email;
        await this.establishments.upsertReceipt({
          tenantId,
          establishmentId,
          periodFrom: parseYmd(body.periodFrom),
          periodTo: parseYmd(body.periodTo),
          rentCents: spec.rentCents,
          chargesCents: spec.chargesCents,
          receivedCents: spec.receivedCents,
          paymentDate: parseYmd(body.paymentDate),
          paymentMethod: body.paymentMethod,
          place: body.place,
          issueDate: parseYmd(body.issueDate),
          bailleurName: body.bailleurName,
          bailleurAddress: body.bailleurAddress,
          bailleurPhone: body.bailleurPhone,
          bailleurEmail: body.bailleurEmail,
          logement: body.logement,
          sentTo
        });
      }
      await this.establishments.createQuittance({
        establishmentId,
        tenantIds: spec.tenantIds,
        ownerIds,
        periodFrom: parseYmd(body.periodFrom),
        periodTo: parseYmd(body.periodTo),
        rentCents: spec.rentCents,
        chargesCents: spec.chargesCents,
        receivedCents: spec.receivedCents,
        paymentDate: parseYmd(body.paymentDate),
        paymentMethod: body.paymentMethod,
        place: body.place,
        issueDate: parseYmd(body.issueDate),
        bailleurName: body.bailleurName,
        bailleurAddress: body.bailleurAddress,
        bailleurPhone: body.bailleurPhone,
        bailleurEmail: body.bailleurEmail,
        tenantName: spec.tenantName,
        logement: body.logement,
        sentTo: primary.email,
        feeLines: body.feeLines
      });
      return copies;
    };

    if (body.splitByTenant) {
      const lines = body.occupants ?? [];
      if (lines.length < 1) throw new AppError("QUITTANCE_PARTIES_REQUIRED", 409);
      const sent: string[] = [];
      let ownerEmails: string[] = [];
      for (const line of lines) {
        const found = await this.establishments.findTenant(establishmentId, line.tenantId);
        if (!found) throw new AppError("NOT_FOUND", 404);
        const email = line.tenantEmail.trim();
        const tenantName = line.tenantName.trim();
        if (!email) throw new AppError("NO_GUEST_EMAIL", 400);
        const rentCents = line.rentCents ?? 0;
        const chargesCents = line.chargesCents ?? 0;
        const receivedCents = line.receivedCents ?? 0;
        if (rentCents + chargesCents <= 0) throw new AppError("QUITTANCE_PARTIES_REQUIRED", 409);
        const copies = await issue({
          tenantIds: [line.tenantId],
          recipients: [{ email, name: tenantName }],
          occupants: [{ name: tenantName, email, phone: line.phone?.trim() || undefined, address: found.formerAddress?.trim() || undefined }],
          tenantName,
          rentCents,
          chargesCents,
          receivedCents,
          emailsByTenant: new Map([[line.tenantId, email]])
        });
        sent.push(email);
        ownerEmails = copies.map((copy) => copy.email);
      }
      return { ok: true as const, to: sent.join(", "), owners: ownerEmails };
    }

    const lines = body.occupants?.length
      ? body.occupants
      : [{ tenantId: body.tenantId, tenantName: body.tenantName, tenantEmail: body.tenantEmail, phone: undefined }];
    const known = new Map<string, string>();
    for (const line of lines) {
      const found = await this.establishments.findTenant(establishmentId, line.tenantId);
      if (!found) throw new AppError("NOT_FOUND", 404);
      const address = found.formerAddress?.trim();
      if (address) known.set(line.tenantId, address);
    }
    const recipients = lines
      .filter((line) => line.tenantEmail.trim())
      .map((line) => ({ email: line.tenantEmail.trim(), name: line.tenantName.trim() }));
    if (recipients.length < 1) throw new AppError("NO_GUEST_EMAIL", 400);
    const tenantName = joinTenantNames(lines.map((line) => line.tenantName));
    const copies = await issue({
      tenantIds: [...new Set(lines.map((line) => line.tenantId))],
      recipients,
      occupants: lines.map((line) => ({
        name: line.tenantName.trim(),
        email: line.tenantEmail.trim() || undefined,
        phone: line.phone?.trim() || undefined,
        address: known.get(line.tenantId)
      })),
      tenantName,
      rentCents: body.rentCents,
      chargesCents: body.chargesCents,
      receivedCents: body.receivedCents,
      emailsByTenant: new Map(lines.filter((line) => line.tenantEmail.trim()).map((line) => [line.tenantId, line.tenantEmail.trim()]))
    });
    return { ok: true as const, to: recipients.map((person) => person.email).join(", "), owners: copies.map((copy) => copy.email) };
  }

  async resendReceipt(userId: string, establishmentId: string, tenantId: string, receiptId: string) {
    await this.requireMonthly(userId, establishmentId);
    const tenant = await this.establishments.findTenant(establishmentId, tenantId);
    if (!tenant) throw new AppError("NOT_FOUND", 404);
    const email = tenant.email?.trim();
    if (!email) throw new AppError("NO_GUEST_EMAIL", 400);
    const receipt = await this.establishments.findReceipt(establishmentId, tenantId, receiptId);
    if (!receipt) throw new AppError("NOT_FOUND", 404);
    const owners = await this.establishments.listOwnerContacts(establishmentId);
    const ownerIds = [...new Set(owners.map((link) => link.owner.id))];
    if (ownerIds.length < 1) throw new AppError("OWNERS_REQUIRED", 409);
    const copies = quittanceOwnerCopies(
      owners.map((link) => link.owner),
      email,
      receipt.bailleurEmail
    );
    try {
      await this.mail.sendQuittance({
        to: email,
        copies,
        guestName: displayName(tenant.firstName, tenant.lastName) || tenant.name,
        bailleurName: receipt.bailleurName,
        bailleurAddress: receipt.bailleurAddress,
        bailleurPhone: receipt.bailleurPhone,
        bailleurEmail: receipt.bailleurEmail,
        tenantName: displayName(tenant.firstName, tenant.lastName) || tenant.name,
        tenantAddress: tenant.formerAddress?.trim() || undefined,
        logement: receipt.logement,
        periodFrom: ymdUtc(receipt.periodFrom),
        periodTo: ymdUtc(receipt.periodTo),
        rentCents: receipt.rentCents,
        chargesCents: receipt.chargesCents,
        receivedCents: receipt.receivedCents,
        paymentDate: ymdUtc(receipt.paymentDate),
        paymentMethod: receipt.paymentMethod,
        place: receipt.place,
        issueDate: ymdUtc(receipt.issueDate),
        feeLines: [],
        signatures: owners.map((link) => signatureOfOwner(link.owner))
      });
    } catch (e: unknown) {
      const name = e instanceof Error ? e.message : "";
      if (name === "MAIL_DISABLED") throw new AppError("MAIL_DISABLED", 503);
      throw new AppError("MAIL_SEND_FAILED", 502);
    }
    await this.establishments.upsertReceipt({
      tenantId: tenant.id,
      establishmentId,
      periodFrom: receipt.periodFrom,
      periodTo: receipt.periodTo,
      rentCents: receipt.rentCents,
      chargesCents: receipt.chargesCents,
      receivedCents: receipt.receivedCents,
      paymentDate: receipt.paymentDate,
      paymentMethod: receipt.paymentMethod,
      place: receipt.place,
      issueDate: receipt.issueDate,
      bailleurName: receipt.bailleurName,
      bailleurAddress: receipt.bailleurAddress,
      bailleurPhone: receipt.bailleurPhone,
      bailleurEmail: receipt.bailleurEmail,
      logement: receipt.logement,
      sentTo: email
    });
    const tenantName = displayName(tenant.firstName, tenant.lastName) || tenant.name;
    await this.establishments.createQuittance({
      establishmentId,
      tenantIds: [tenant.id],
      ownerIds,
      periodFrom: receipt.periodFrom,
      periodTo: receipt.periodTo,
      rentCents: receipt.rentCents,
      chargesCents: receipt.chargesCents,
      receivedCents: receipt.receivedCents,
      paymentDate: receipt.paymentDate,
      paymentMethod: receipt.paymentMethod,
      place: receipt.place,
      issueDate: receipt.issueDate,
      bailleurName: receipt.bailleurName,
      bailleurAddress: receipt.bailleurAddress,
      bailleurPhone: receipt.bailleurPhone,
      bailleurEmail: receipt.bailleurEmail,
      tenantName,
      logement: receipt.logement,
      sentTo: email,
      feeLines: []
    });
    return { ok: true as const, to: email, owners: copies.map((copy) => copy.email) };
  }

  async quittanceSignatures(establishmentId: string) {
    const owners = await this.establishments.listOwnerContacts(establishmentId);
    return owners.map((link) => signatureOfOwner(link.owner));
  }

  async readOwnerSignature(ownerId: string) {
    const row = await this.establishments.findSignature(ownerId);
    if (!row?.signaturePng || row.signaturePng.byteLength === 0) throw new AppError("NOT_FOUND", 404);
    return Buffer.from(row.signaturePng);
  }

  async saveOwnerSignature(ownerId: string, pngDataUrl: string) {
    const owner = await this.establishments.findOwner(ownerId);
    if (!owner) throw new AppError("NOT_FOUND", 404);
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(pngDataUrl.trim());
    if (!match) throw new AppError("INVALID_SIGNATURE", 400);
    const png = Buffer.from(match[1], "base64");
    const pngHeader = png.length >= 8 && png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47;
    if (!pngHeader || png.length < 40 || png.length > 500_000) throw new AppError("INVALID_SIGNATURE", 400);
    await this.establishments.saveSignature(ownerId, png);
    return { hasSignature: true as const };
  }

  async clearOwnerSignature(ownerId: string) {
    const owner = await this.establishments.findOwner(ownerId);
    if (!owner) throw new AppError("NOT_FOUND", 404);
    await this.establishments.saveSignature(ownerId, null);
    return { hasSignature: false as const };
  }
}
