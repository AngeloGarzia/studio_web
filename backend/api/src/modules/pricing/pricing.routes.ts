import { Router } from "express";
import type { PricingController } from "./pricing.controller.js";

export function createPricingRouter(controller: PricingController): Router {
  const r = Router();
  r.post("/public/booking-pricing-preview", controller.preview);
  return r;
}
