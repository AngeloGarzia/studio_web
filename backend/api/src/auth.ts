import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getEnv } from "./env.js";

const TOKEN_NAME = "sdg_token";

export type AuthTokenPayload = {
  sub: string;
  role: "ADMIN" | "CLIENT";
  email: string;
};

export function signAuthToken(payload: AuthTokenPayload): string {
  const env = getEnv();
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" });
}

export function setAuthCookie(res: Response, token: string) {
  const isProd = getEnv().NODE_ENV === "production";
  res.cookie(TOKEN_NAME, token, {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    path: "/"
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(TOKEN_NAME, { path: "/" });
}

export function getTokenFromReq(req: Request): string | undefined {
  const raw = req.cookies?.[TOKEN_NAME];
  return typeof raw === "string" ? raw : undefined;
}

export type AuthedRequest = Request & { auth?: AuthTokenPayload };

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const env = getEnv();
  const token = getTokenFromReq(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
    req.auth = payload;
  } catch {
    // ignore invalid/expired token for anonymous access
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const env = getEnv();
  const token = getTokenFromReq(req);
  if (!token) return res.status(401).json({ error: "UNAUTHENTICATED" });
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
    req.auth = payload;
    next();
  } catch {
    return res.status(401).json({ error: "UNAUTHENTICATED" });
  }
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.auth?.role !== "ADMIN") return res.status(403).json({ error: "FORBIDDEN" });
    next();
  });
}

