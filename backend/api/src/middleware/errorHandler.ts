import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../shared/http.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "VALIDATION_ERROR", issues: err.issues });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.code });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
}
