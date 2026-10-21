import type { NextFunction, Response } from "express";
import { prisma } from "../infra/db.js";
import { AppError } from "../shared/http.js";
import { readPublicEstablishmentId } from "../shared/publicEstablishmentCookie.js";
import { runWithEstablishment } from "../shared/establishmentContext.js";
import type { AuthedRequest } from "./auth.js";
import { isManagerRole } from "../shared/roles.js";

async function resolveEstablishmentId(req: AuthedRequest): Promise<string> {
  if (!req.auth) {
    const picked = readPublicEstablishmentId(req);
    if (picked) {
      const chosen = await prisma.establishment.findUnique({ where: { id: picked }, select: { id: true } });
      if (chosen) return chosen.id;
    }
  }

  if (req.auth && isManagerRole(req.auth.role)) {
    const linked = {
      OR: [
        { members: { some: { userId: req.auth.sub } } },
        { owners: { some: { owner: { userId: req.auth.sub } } } }
      ]
    };
    const user = await prisma.user.findUnique({
      where: { id: req.auth.sub },
      select: { activeEstablishmentId: true }
    });
    if (user?.activeEstablishmentId) {
      const active = await prisma.establishment.findFirst({
        where: { id: user.activeEstablishmentId, ...linked },
        select: { id: true }
      });
      if (active) return active.id;
    }
    const firstLinked = await prisma.establishment.findFirst({
      where: linked,
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
    if (firstLinked) return firstLinked.id;
    throw new AppError("NO_ESTABLISHMENT", 503);
  }

  const fallback =
    (await prisma.establishment.findFirst({ where: { isDefault: true }, orderBy: { createdAt: "asc" } })) ??
    (await prisma.establishment.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!fallback) throw new AppError("NO_ESTABLISHMENT", 503);
  return fallback.id;
}

export function establishmentContext(req: AuthedRequest, _res: Response, next: NextFunction) {
  const path = req.path || "";
  if (path === "/health" || path.endsWith("/health")) return next();
  void resolveEstablishmentId(req)
    .then((id) => {
      runWithEstablishment(id, () => next());
    })
    .catch(next);
}
