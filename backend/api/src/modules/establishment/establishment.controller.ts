import type { Response } from "express";
import type { AuthedRequest } from "../../middleware/auth.js";
import { asyncHandler, routeParam } from "../../shared/http.js";
import { extraAttachments, readPayload } from "../../shared/mailAttachments.js";
import { clearPublicEstablishmentCookie, readPublicEstablishmentId, setPublicEstablishmentCookie } from "../../shared/publicEstablishmentCookie.js";
import {
  AttachOwnerBodySchema,
  CreateEstablishmentBodySchema,
  CreateMonthlyTenantBodySchema,
  CreateOwnerBodySchema,
  UpdateOwnerBodySchema,
  SendMonthlyQuittanceBodySchema,
  CreateDirectoryOwnerBodySchema,
  CreateDirectoryTenantBodySchema,
  NewAccountSchema,
  OwnerSignatureBodySchema,
  SendAccountConfirmationBodySchema,
  UpdateDirectoryOwnerBodySchema,
  UpdateDirectoryTenantBodySchema,
  UpdateEstablishmentBodySchema,
  UpdateMonthlyTenantBodySchema
} from "./establishment.dto.js";
import { joinTenantNames, renderQuittancePdf } from "../mail/quittancePdf.js";
import type { EstablishmentService } from "./establishment.service.js";

export class EstablishmentController {
  constructor(private readonly establishments: EstablishmentService) {}

  publicList = asyncHandler(async (_req, res) => {
    return res.json(await this.establishments.listPublicCards());
  });

  publicVisit = asyncHandler(async (req, res) => {
    return res.json({ establishmentId: readPublicEstablishmentId(req) ?? null });
  });

  choosePublic = asyncHandler(async (req, res) => {
    const id = routeParam(req, "id");
    const rows = await this.establishments.listPublicCards();
    if (!rows.some((row) => row.id === id)) return res.status(404).json({ error: "NOT_FOUND" });
    setPublicEstablishmentCookie(res, id);
    return res.json({ ok: true, establishmentId: id });
  });

  clearPublic = asyncHandler(async (_req, res) => {
    clearPublicEstablishmentCookie(res);
    return res.json({ ok: true });
  });

  images = asyncHandler(async (req: AuthedRequest, res: Response) => {
    return res.json(await this.establishments.publishedImages(req.auth!.sub, routeParam(req, "id")));
  });

  directory = asyncHandler(async (_req: AuthedRequest, res: Response) => {
    return res.json(await this.establishments.directory());
  });

  createDirectoryOwner = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = CreateDirectoryOwnerBodySchema.parse(req.body);
    return res.status(201).json(await this.establishments.createDirectoryOwner(body));
  });

  createDirectoryTenant = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = CreateDirectoryTenantBodySchema.parse(req.body);
    return res.status(201).json(await this.establishments.createDirectoryTenant(body));
  });

  createOwnerAccount = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = NewAccountSchema.parse(req.body);
    return res.status(201).json(await this.establishments.createOwnerAccount(routeParam(req, "ownerId"), body));
  });

  createTenantAccount = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = NewAccountSchema.parse(req.body);
    return res.status(201).json(await this.establishments.createTenantAccount(routeParam(req, "tenantId"), body));
  });

  sendOwnerConfirmation = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = SendAccountConfirmationBodySchema.parse(req.body);
    return res.json(await this.establishments.sendOwnerConfirmation(routeParam(req, "ownerId"), body));
  });

  sendTenantConfirmation = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = SendAccountConfirmationBodySchema.parse(req.body);
    return res.json(await this.establishments.sendTenantConfirmation(routeParam(req, "tenantId"), body));
  });

  ownerSignature = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const png = await this.establishments.readOwnerSignature(routeParam(req, "ownerId"));
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "private, no-cache");
    return res.send(png);
  });

  saveOwnerSignature = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = OwnerSignatureBodySchema.parse(req.body);
    return res.json(await this.establishments.saveOwnerSignature(routeParam(req, "ownerId"), body.png));
  });

  clearOwnerSignature = asyncHandler(async (req: AuthedRequest, res: Response) => {
    return res.json(await this.establishments.clearOwnerSignature(routeParam(req, "ownerId")));
  });

  updateDirectoryOwner = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = UpdateDirectoryOwnerBodySchema.parse(req.body);
    return res.json(await this.establishments.updateDirectoryOwner(routeParam(req, "ownerId"), body));
  });

  updateDirectoryTenant = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = UpdateDirectoryTenantBodySchema.parse(req.body);
    return res.json(await this.establishments.updateDirectoryTenant(routeParam(req, "tenantId"), body));
  });

  listOwners = asyncHandler(async (_req: AuthedRequest, res: Response) => {
    return res.json(await this.establishments.listOwners());
  });

  createOwner = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = CreateOwnerBodySchema.parse(req.body);
    return res.status(201).json(await this.establishments.createOwner(body));
  });

  updateOwner = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = UpdateOwnerBodySchema.parse(req.body);
    return res.json(await this.establishments.updateOwner(routeParam(req, "ownerId"), body));
  });

  deleteOwner = asyncHandler(async (req: AuthedRequest, res: Response) => {
    return res.json(await this.establishments.deleteOwner(routeParam(req, "ownerId")));
  });

  attachOwner = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = AttachOwnerBodySchema.parse(req.body);
    return res.status(201).json(await this.establishments.attachOwner(req.auth!.sub, routeParam(req, "id"), body.ownerId));
  });

  detachOwner = asyncHandler(async (req: AuthedRequest, res: Response) => {
    return res.json(await this.establishments.detachOwner(req.auth!.sub, routeParam(req, "id"), routeParam(req, "ownerId")));
  });

  list = asyncHandler(async (req: AuthedRequest, res: Response) => {
    return res.json(await this.establishments.list(req.auth!.sub));
  });

  create = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = CreateEstablishmentBodySchema.parse(req.body);
    return res.status(201).json(await this.establishments.create(req.auth!.sub, body));
  });

  activate = asyncHandler(async (req: AuthedRequest, res: Response) => {
    return res.json(await this.establishments.activate(req.auth!.sub, routeParam(req, "id")));
  });

  remove = asyncHandler(async (req: AuthedRequest, res: Response) => {
    return res.json(await this.establishments.remove(req.auth!.sub, routeParam(req, "id")));
  });

  update = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = UpdateEstablishmentBodySchema.parse(req.body);
    return res.json(await this.establishments.update(req.auth!.sub, routeParam(req, "id"), body));
  });

  createTenant = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = CreateMonthlyTenantBodySchema.parse(req.body);
    return res.status(201).json(await this.establishments.createTenant(req.auth!.sub, routeParam(req, "id"), body));
  });

  deleteTenant = asyncHandler(async (req: AuthedRequest, res: Response) => {
    return res.json(await this.establishments.deleteTenant(req.auth!.sub, routeParam(req, "id"), routeParam(req, "tenantId")));
  });

  tenantFile = asyncHandler(async (req: AuthedRequest, res: Response) => {
    return res.json(await this.establishments.tenantFile(req.auth!.sub, routeParam(req, "id"), routeParam(req, "tenantId")));
  });

  updateTenant = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = UpdateMonthlyTenantBodySchema.parse(req.body);
    return res.json(await this.establishments.updateTenant(req.auth!.sub, routeParam(req, "id"), routeParam(req, "tenantId"), body));
  });

  resendReceipt = asyncHandler(async (req: AuthedRequest, res: Response) => {
    return res.json(
      await this.establishments.resendReceipt(req.auth!.sub, routeParam(req, "id"), routeParam(req, "tenantId"), routeParam(req, "receiptId"))
    );
  });

  sendMonthlyQuittance = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = SendMonthlyQuittanceBodySchema.parse(readPayload(req));
    return res.json(await this.establishments.sendMonthlyQuittance(req.auth!.sub, body, extraAttachments(req)));
  });

  previewMonthlyQuittance = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = SendMonthlyQuittanceBodySchema.parse(req.body);
    const signatures = body.establishmentId ? await this.establishments.quittanceSignatures(body.establishmentId) : [];
    const occupants = (body.occupants ?? [])
      .filter((person) => person.tenantName.trim())
      .map((person) => ({
        name: person.tenantName.trim(),
        email: person.tenantEmail.trim() || undefined,
        phone: person.phone?.trim() || undefined
      }));
    const tenantName = occupants.length > 1 ? joinTenantNames(occupants.map((person) => person.name)) : body.tenantName;
    const pdf = await renderQuittancePdf({ ...body, tenantName, occupants: occupants.length ? occupants : undefined, signatures });
    const full = body.receivedCents >= body.rentCents + body.chargesCents;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${full ? "quittance" : "recu"}-loyer.pdf"`);
    return res.send(pdf);
  });
}
