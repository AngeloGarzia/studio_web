import { AppError } from "../../shared/http.js";
import type { CreateStayPromoBody, UpdateStayPromoBody } from "./stayPromo.dto.js";
import type { StayPromoRepository } from "./stayPromo.repository.js";

export class StayPromoService {
  constructor(private readonly promos: StayPromoRepository) {}

  listPublic() {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    return this.promos.findPublicActive(todayStart);
  }

  listAdmin() {
    return this.promos.findAllAdminOrdered();
  }

  async create(body: CreateStayPromoBody) {
    const vf = new Date(`${body.validFrom}T00:00:00.000Z`);
    const vt = new Date(`${body.validToInclusive}T00:00:00.000Z`);
    if (isNaN(vf.getTime()) || isNaN(vt.getTime())) throw new AppError("INVALID_DATE", 400);
    if (vt < vf) throw new AppError("INVALID_RANGE", 400);
    return this.promos.create({
      validFrom: vf,
      validToInclusive: vt,
      minStayNights: body.minStayNights,
      promoPercent: body.promoPercent,
      label: body.label ?? null,
      active: body.active ?? true
    });
  }

  async update(id: string, body: UpdateStayPromoBody) {
    const existing = await this.promos.findById(id);
    if (!existing) throw new AppError("NOT_FOUND", 404);

    const nextFrom = body.validFrom != null ? new Date(`${body.validFrom}T00:00:00.000Z`) : existing.validFrom;
    const nextTo =
      body.validToInclusive != null ? new Date(`${body.validToInclusive}T00:00:00.000Z`) : existing.validToInclusive;
    if (isNaN(nextFrom.getTime()) || isNaN(nextTo.getTime())) throw new AppError("INVALID_DATE", 400);
    if (nextTo < nextFrom) throw new AppError("INVALID_RANGE", 400);

    return this.promos.update(id, {
      ...(body.validFrom != null ? { validFrom: nextFrom } : {}),
      ...(body.validToInclusive != null ? { validToInclusive: nextTo } : {}),
      ...(body.minStayNights !== undefined ? { minStayNights: body.minStayNights } : {}),
      ...(body.promoPercent !== undefined ? { promoPercent: body.promoPercent } : {}),
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(body.active !== undefined ? { active: body.active } : {})
    });
  }

  async delete(id: string) {
    try {
      await this.promos.delete(id);
    } catch {
      throw new AppError("NOT_FOUND", 404);
    }
    return { ok: true as const };
  }
}
