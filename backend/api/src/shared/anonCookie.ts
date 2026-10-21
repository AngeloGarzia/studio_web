import type { Request, Response } from "express";
import { getEnv } from "../config/env.js";

export function getAnonUserId(req: Request): string | undefined {
  const raw = (req as Request & { cookies?: Record<string, unknown> }).cookies?.sdg_anon;
  return typeof raw === "string" ? raw : undefined;
}

export function setAnonCookie(res: Response, userId: string): void {
  const isProd = getEnv().NODE_ENV === "production";
  res.cookie("sdg_anon", userId, {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    path: "/"
  });
}
