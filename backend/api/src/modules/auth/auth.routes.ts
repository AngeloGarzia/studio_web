import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import type { AuthController } from "./auth.controller.js";

const authWriteLimit = rateLimit({
  windowMs: 15 * 60_000,
  max: 20,
  prefix: "auth-write",
  message: "RATE_LIMITED"
});

export function createAuthRouter(controller: AuthController): Router {
  const r = Router();
  r.post("/auth/login", authWriteLimit, controller.login);
  r.post("/auth/logout", controller.logout);
  r.post("/auth/register", authWriteLimit, controller.register);
  r.post("/auth/setup-password", authWriteLimit, controller.setupPassword);
  r.get("/me", requireAuth, controller.me);
  return r;
}
