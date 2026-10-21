import { Router } from "express";
import { requireAdmin } from "../../middleware/auth.js";
import type { PortfolioController } from "./portfolio.controller.js";

export function createPortfolioRouter(controller: PortfolioController): Router {
  const r = Router();
  r.get("/public/portfolio", controller.listPublic);
  r.get("/public/media/:id", controller.streamPublic);
  r.get("/admin/portfolio", requireAdmin, controller.listAdmin);
  r.post("/admin/portfolio/upload", requireAdmin, controller.upload);
  r.post("/admin/portfolio/:id/thumbnail", requireAdmin, controller.thumbnail);
  r.post("/admin/portfolio/thumbnails/backfill", requireAdmin, controller.backfill);
  r.patch("/admin/portfolio/:id", requireAdmin, controller.update);
  r.delete("/admin/portfolio/:id", requireAdmin, controller.remove);
  return r;
}
