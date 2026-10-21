import { Router } from "express";
import { requireAdmin } from "../../middleware/auth.js";
import type { CalendarController } from "./calendar.controller.js";

export function createCalendarRouter(controller: CalendarController): Router {
  const r = Router();
  r.get("/public/calendar", controller.getPublic);
  r.post("/admin/blocks", requireAdmin, controller.createBlock);
  r.delete("/admin/blocks/:id", requireAdmin, controller.deleteBlock);
  r.post("/admin/blocks/clear", requireAdmin, controller.clearBlocks);
  r.post("/admin/blocks/unblock-day", requireAdmin, controller.unblockDay);
  r.put("/admin/day-config", requireAdmin, controller.upsertDayConfig);
  return r;
}
