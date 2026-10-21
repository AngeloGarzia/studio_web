import type { NextFunction, Request, Response } from "express";

type Entry = { count: number; resetAt: number };

const buckets = new Map<string, Entry>();

function clientKey(req: Request, prefix: string): string {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return `${prefix}:${ip}`;
}

/**
 * Rate-limit mémoire (process-local). Suffisant pour un seul instance Node.
 * windowMs / max : ex. 15 min / 20 tentatives.
 */
export function rateLimit(opts: { windowMs: number; max: number; prefix: string; message?: string }) {
  const message = opts.message ?? "RATE_LIMITED";
  return (req: Request, res: Response, next: NextFunction) => {
    const key = clientKey(req, opts.prefix);
    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, entry);
    }
    entry.count += 1;
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader("X-RateLimit-Limit", String(opts.max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, opts.max - entry.count)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
    if (entry.count > opts.max) {
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({ error: message });
    }
    return next();
  };
}

/** Nettoyage occasionnel pour éviter la croissance infinie en mémoire. */
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}, 60_000).unref?.();
