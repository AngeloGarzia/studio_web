import { Router } from "express";
import { requireAdmin } from "../../middleware/auth.js";
import type { SettingsController } from "./settings.controller.js";

export function createSettingsRouter(controller: SettingsController): Router {
  const r = Router();
  r.get("/public/settings", controller.getPublic);
  r.get("/admin/settings", requireAdmin, controller.getAdmin);
  r.put("/admin/settings", requireAdmin, controller.putAdmin);
  return r;
}
