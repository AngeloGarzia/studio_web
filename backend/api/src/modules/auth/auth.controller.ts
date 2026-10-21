import type { Response } from "express";
import { clearAuthCookie, setAuthCookie, type AuthedRequest } from "../../middleware/auth.js";
import { getAnonUserId } from "../../shared/anonCookie.js";
import { asyncHandler } from "../../shared/http.js";
import { LoginBodySchema, RegisterBodySchema, SetupPasswordBodySchema } from "./auth.dto.js";
import type { AuthService } from "./auth.service.js";

export class AuthController {
  constructor(private readonly auth: AuthService) {}

  login = asyncHandler(async (req, res) => {
    const body = LoginBodySchema.parse(req.body);
    const result = await this.auth.login(body);
    setAuthCookie(res, result.token);
    return res.json(result.user);
  });

  logout = asyncHandler(async (_req, res) => {
    clearAuthCookie(res);
    return res.json({ ok: true });
  });

  register = asyncHandler(async (req, res) => {
    const body = RegisterBodySchema.parse(req.body);
    const result = await this.auth.register(body, getAnonUserId(req));
    setAuthCookie(res, result.token);
    return res.json(result.user);
  });

  setupPassword = asyncHandler(async (req, res) => {
    const body = SetupPasswordBodySchema.parse(req.body);
    const result = await this.auth.setupPassword(body);
    setAuthCookie(res, result.token);
    return res.json(result.user);
  });

  me = asyncHandler(async (req: AuthedRequest, res: Response) => {
    const user = await this.auth.me(req.auth!.sub);
    return res.json(user);
  });
}
