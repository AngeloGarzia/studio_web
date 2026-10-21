import { Router } from "express";
import { requireAdmin } from "../../middleware/auth.js";
import type { StayPromoController } from "./stayPromo.controller.js";

export function createStayPromoRouter(controller: StayPromoController): Router {
  const r = Router();
  r.get("/public/stay-promo-rules", controller.listPublic);
  r.get("/admin/stay-promo-rules", requireAdmin, controller.listAdmin);
  r.post("/admin/stay-promo-rules", requireAdmin, controller.create);
  r.patch("/admin/stay-promo-rules/:id", requireAdmin, controller.update);
  r.delete("/admin/stay-promo-rules/:id", requireAdmin, controller.remove);
  return r;
}
