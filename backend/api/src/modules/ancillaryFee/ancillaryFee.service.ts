import { AppError } from "../../shared/http.js";
import type { CreateAncillaryFeeBody, UpdateAncillaryFeeBody } from "./ancillaryFee.dto.js";
import type { AncillaryFeePublic, AncillaryFeeRepository } from "./ancillaryFee.repository.js";

export function ancillarySnapshotFromFees(fees: AncillaryFeePublic[]) {
  const ancillaryTotalCents = fees.reduce((s, f) => s + f.priceCents, 0);
  const ancillarySnapshot = fees.map((f) => ({ id: f.id, label: f.label, priceCents: f.priceCents }));
  return { ancillaryTotalCents, ancillarySnapshot };
}

export class AncillaryFeeService {
  constructor(private readonly fees: AncillaryFeeRepository) {}

  listPublic() {
    return this.fees.findActiveOrdered();
  }

  listAdmin() {
    return this.fees.findAllOrdered();
  }

  loadActiveOrdered() {
    return this.fees.findActiveOrdered();
  }

  async create(body: CreateAncillaryFeeBody) {
    return this.fees.create({
      label: body.label.trim(),
      priceCents: body.priceCents,
      active: body.active ?? true,
      sortOrder: body.sortOrder ?? 0
    });
  }

  async update(id: string, body: UpdateAncillaryFeeBody) {
    const existing = await this.fees.findById(id);
    if (!existing) throw new AppError("NOT_FOUND", 404);
    return this.fees.update(id, {
      ...(body.label != null ? { label: body.label.trim() } : {}),
      ...(body.priceCents != null ? { priceCents: body.priceCents } : {}),
      ...(body.active != null ? { active: body.active } : {}),
      ...(body.sortOrder != null ? { sortOrder: body.sortOrder } : {})
    });
  }

  async delete(id: string) {
    const existing = await this.fees.findById(id);
    if (!existing) throw new AppError("NOT_FOUND", 404);
    await this.fees.delete(id);
    return { ok: true as const };
  }
}
