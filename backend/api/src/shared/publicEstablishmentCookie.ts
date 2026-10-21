import type { Request, Response } from "express";
import { getEnv } from "../config/env.js";

const COOKIE = "sdg_establishment";

export function readPublicEstablishmentId(req: Request): string | undefined {
  const raw = (req as Request & { cookies?: Record<string, unknown> }).cookies?.[COOKIE];
  return typeof raw === "string" && raw.trim() ? raw : undefined;
}

function options() {
  const isProd = getEnv().NODE_ENV === "production";
  return {
    httpOnly: true as const,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    secure: isProd,
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000
  };
}

export function setPublicEstablishmentCookie(res: Response, establishmentId: string): void {
  res.cookie(COOKIE, establishmentId, options());
}

export function clearPublicEstablishmentCookie(res: Response): void {
  const opts = options();
  res.clearCookie(COOKIE, {
    path: opts.path,
    sameSite: opts.sameSite,
    secure: opts.secure,
    httpOnly: opts.httpOnly
  });
}
