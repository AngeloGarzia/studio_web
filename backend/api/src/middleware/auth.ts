import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getEnv } from "../config/env.js";
import { prisma } from "../infra/db.js";
import { isManagerRole, type AppRole } from "../shared/roles.js";

const TOKEN_NAME = "sdg_token";
/** Aligné sur JWT expiresIn. */
export const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type AuthTokenPayload = {
  sub: string;
  role: AppRole;
  email: string;
};

function cookieOptions() {
  const isProd = getEnv().NODE_ENV === "production";
  return {
    httpOnly: true as const,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    secure: isProd,
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE_MS
  };
}

export function signAuthToken(payload: AuthTokenPayload): string {
  const env = getEnv();
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" });
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(TOKEN_NAME, token, cookieOptions());
}

export function clearAuthCookie(res: Response) {
  const opts = cookieOptions();
  res.clearCookie(TOKEN_NAME, {
    path: opts.path,
    sameSite: opts.sameSite,
    secure: opts.secure,
    httpOnly: opts.httpOnly
  });
}

export function getTokenFromReq(req: Request): string | undefined {
  const raw = req.cookies?.[TOKEN_NAME];
  return typeof raw === "string" ? raw : undefined;
}

export type AuthedRequest = Request & { auth?: AuthTokenPayload };

async function loadSessionUser(userId: string): Promise<AuthTokenPayload | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, isGuest: true, lockedUntil: true }
  });
  if (!user) return null;
  if (user.isGuest) return null;
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) return null;
  return { sub: user.id, role: user.role, email: user.email };
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const env = getEnv();
  const token = getTokenFromReq(req);
  if (!token) return next();
  void (async () => {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
      const session = await loadSessionUser(payload.sub);
      if (session) req.auth = session;
    } catch {
      // ignore invalid/expired token
    }
    next();
  })();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const env = getEnv();
  const token = getTokenFromReq(req);
  if (!token) return res.status(401).json({ error: "UNAUTHENTICATED" });
  void (async () => {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
      const session = await loadSessionUser(payload.sub);
      if (!session) return res.status(401).json({ error: "UNAUTHENTICATED" });
      req.auth = session;
      next();
    } catch {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }
  })();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!isManagerRole(req.auth?.role)) return res.status(403).json({ error: "FORBIDDEN" });
    next();
  });
}
