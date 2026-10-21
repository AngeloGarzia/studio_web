import { Router } from "express";
import { requireAdmin } from "../../middleware/auth.js";
import type { AncillaryFeeController } from "./ancillaryFee.controller.js";

export function createAncillaryFeeRouter(controller: AncillaryFeeController): Router {
  const r = Router();
  r.get("/public/ancillary-fees", controller.listPublic);
  r.get("/admin/ancillary-fees", requireAdmin, controller.listAdmin);
  r.post("/admin/ancillary-fees", requireAdmin, controller.create);
  r.patch("/admin/ancillary-fees/:id", requireAdmin, controller.update);
  r.delete("/admin/ancillary-fees/:id", requireAdmin, controller.remove);
  return r;
}
