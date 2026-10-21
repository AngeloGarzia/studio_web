import type { Response } from "express";
import type { AuthedRequest } from "../../middleware/auth.js";
import { setAnonCookie } from "../../shared/anonCookie.js";
import { extraAttachments, readPayload } from "../../shared/mailAttachments.js";
import { asyncHandler, routeParam } from "../../shared/http.js";
import {
  AdminCreateBookingBodySchema,
  AdminUpdateBookingBodySchema,
  CreateBookingBodySchema,
  ProposeBookingBodySchema,
  PublicBookingRequestBodySchema,
  SendQuittanceBodySchema,
  SetBookingStatusBodySchema
} from "./booking.dto.js";
import type { BookingService } from "./booking.service.js";

export class BookingController {
  constructor(private readonly bookings: BookingService) {}

  publicRequest = asyncHandler(async (req, res) => {
    const body = PublicBookingRequestBodySchema.parse(req.body);
    const result = await this.bookings.createPublicRequest(body);
    setAnonCookie(res, result.clientId);
    return res.json({
      ok: result.ok,
      bookingId: result.bookingId,
      conversationId: result.conversationId
    });
  });

  create = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = CreateBookingBodySchema.parse(req.body);
    const booking = await this.bookings.createAuthenticated(req.auth!.sub, req.auth!.role, body);
    return res.json(booking);
  });

  listMine = asyncHandler(async (req: AuthedRequest, res: Response) => {
    return res.json(await this.bookings.listMine(req.auth!.sub));
  });

  adminList = asyncHandler(async (_req, res) => {
    return res.json(await this.bookings.adminList());
  });

  adminClients = asyncHandler(async (_req, res) => {
    return res.json(await this.bookings.listClients());
  });

  adminCreate = asyncHandler(async (req, res) => {
    const body = AdminCreateBookingBodySchema.parse(req.body);
    return res.status(201).json(await this.bookings.createForClient(body));
  });

  adminUpdate = asyncHandler(async (req, res) => {
    const body = AdminUpdateBookingBodySchema.parse(req.body);
    return res.json(await this.bookings.updateForAdmin(routeParam(req, "id"), body));
  });

  savePlatformImage = asyncHandler(async (req, res) => {
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const contentType = String(req.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    return res.json(await this.bookings.savePlatformImage(routeParam(req, "id"), bytes, contentType));
  });

  platformImage = asyncHandler(async (req, res) => {
    const image = await this.bookings.readPlatformImage(routeParam(req, "id"));
    res.setHeader("Content-Type", image.type);
    res.setHeader("Cache-Control", "private, max-age=60");
    return res.send(image.body);
  });

  remove = asyncHandler(async (req, res) => {
    return res.json(await this.bookings.remove(routeParam(req, "id")));
  });

  setStatus = asyncHandler(async (req, res) => {
    const body = SetBookingStatusBodySchema.parse(req.body);
    return res.json(await this.bookings.setStatus(routeParam(req, "id"), body));
  });

  adminDetail = asyncHandler(async (req, res) => {
    return res.json(await this.bookings.adminDetail(routeParam(req, "id")));
  });

  sendEmail = asyncHandler(async (req, res) => {
    return res.json(await this.bookings.sendEmail(routeParam(req, "id")));
  });

  propose = asyncHandler(async (req, res) => {
    const body = ProposeBookingBodySchema.parse(req.body);
    return res.json(await this.bookings.propose(routeParam(req, "id"), body));
  });

  sendQuittance = asyncHandler(async (req, res) => {
    const body = SendQuittanceBodySchema.parse(readPayload(req));
    return res.json(await this.bookings.sendQuittance(routeParam(req, "id"), body, extraAttachments(req)));
  });
}
