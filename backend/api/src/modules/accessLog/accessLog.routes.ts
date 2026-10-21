import { Router } from "express";
import { requireAdmin } from "../../middleware/auth.js";
import type { AccessLogController } from "./accessLog.controller.js";

export function createAccessLogRouter(controller: AccessLogController): Router {
  const r = Router();
  r.post("/public/ping", controller.ping);
  r.get("/admin/access-logs", requireAdmin, controller.list);
  return r;
}
