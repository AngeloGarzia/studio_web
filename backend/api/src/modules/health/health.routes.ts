import { Router } from "express";
import type { HealthController } from "./health.controller.js";

export function createHealthRouter(controller: HealthController): Router {
  const r = Router();
  r.get("/health", (req, res) => controller.get(req, res));
  return r;
}
