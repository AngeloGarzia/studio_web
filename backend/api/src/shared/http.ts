import type { Request } from "express";

/** Route param Express (`string | string[]`) → `string` pour Prisma / logique métier. */
export function routeParam(req: Request, key: string): string {
  const v = req.params[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

/** Erreur métier mappable en HTTP (services → error handler). */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
    this.name = "AppError";
  }
}

export function asyncHandler(
  fn: (req: Request, res: import("express").Response, next: import("express").NextFunction) => Promise<unknown>
) {
  return (req: Request, res: import("express").Response, next: import("express").NextFunction) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}
