import type { Request, Response } from "express";

export class HealthController {
  get(_req: Request, res: Response) {
    return res.json({ ok: true });
  }
}
