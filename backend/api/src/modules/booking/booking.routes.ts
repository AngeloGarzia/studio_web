import express, { Router } from "express";
import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { quittanceUpload } from "../../shared/mailAttachments.js";
import type { BookingController } from "./booking.controller.js";

const publicBookingLimit = rateLimit({
  windowMs: 15 * 60_000,
  max: 30,
  prefix: "public-booking",
  message: "RATE_LIMITED"
});

export function createBookingRouter(controller: BookingController): Router {
  const r = Router();
  r.post("/public/booking-request", publicBookingLimit, controller.publicRequest);
  r.post("/bookings", requireAuth, controller.create);
  r.get("/bookings/me", requireAuth, controller.listMine);
  r.get("/admin/bookings", requireAdmin, controller.adminList);
  r.get("/admin/clients", requireAdmin, controller.adminClients);
  r.post("/admin/bookings", requireAdmin, controller.adminCreate);
  r.patch("/admin/bookings/:id", requireAdmin, controller.adminUpdate);
  r.put(
    "/admin/bookings/:id/platform-image",
    requireAdmin,
    express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "8mb" }),
    controller.savePlatformImage
  );
  r.get("/admin/bookings/:id/platform-image", requireAdmin, controller.platformImage);
  r.delete("/admin/bookings/:id", requireAdmin, controller.remove);
  r.post("/admin/bookings/:id/status", requireAdmin, controller.setStatus);
  r.post("/admin/bookings/:id/send-email", requireAdmin, controller.sendEmail);
  r.post("/admin/bookings/:id/proposal", requireAdmin, controller.propose);
  r.post("/admin/bookings/:id/quittance", requireAdmin, quittanceUpload, controller.sendQuittance);
  r.get("/admin/bookings/:id", requireAdmin, controller.adminDetail);
  return r;
}
