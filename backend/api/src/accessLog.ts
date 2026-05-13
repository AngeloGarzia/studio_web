import type { Request, Response, NextFunction } from "express";
import { prisma } from "./db.js";
import type { AuthedRequest } from "./auth.js";

function getForwardedFor(req: Request): string | undefined {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string") return xff;
  if (Array.isArray(xff)) return xff.join(", ");
  return undefined;
}

export async function logAccess(req: AuthedRequest, _res: Response, next: NextFunction) {
  // Fire-and-forget: never block a request on logging
  void prisma.accessLog
    .create({
      data: {
        ip: req.ip,
        forwardedFor: getForwardedFor(req),
        method: req.method,
        path: req.originalUrl,
        userAgent: req.headers["user-agent"] ?? null,
        referer: req.headers.referer ?? null,
        userId: req.auth?.sub ?? null,
        userRole: req.auth?.role ?? null
      }
    })
    .catch(() => {});

  next();
}

