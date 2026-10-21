import type { AncillaryFee, PrismaClient } from "@prisma/client";
import { currentEstablishmentId } from "../../shared/establishmentContext.js";

export type AncillaryFeePublic = { id: string; label: string; priceCents: number };

export interface AncillaryFeeRepository {
  findActiveOrdered(): Promise<AncillaryFeePublic[]>;
  findAllOrdered(): Promise<AncillaryFee[]>;
  findById(id: string): Promise<AncillaryFee | null>;
  create(data: { label: string; priceCents: number; active: boolean; sortOrder: number }): Promise<AncillaryFee>;
  update(
    id: string,
    data: Partial<{ label: string; priceCents: number; active: boolean; sortOrder: number }>
  ): Promise<AncillaryFee>;
  delete(id: string): Promise<void>;
}

export class PrismaAncillaryFeeRepository implements AncillaryFeeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findActiveOrdered() {
    return this.prisma.ancillaryFee.findMany({
      where: { establishmentId: currentEstablishmentId(), active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, label: true, priceCents: true }
    });
  }

  findAllOrdered() {
    return this.prisma.ancillaryFee.findMany({
      where: { establishmentId: currentEstablishmentId() },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });
  }

  findById(id: string) {
    return this.prisma.ancillaryFee.findFirst({ where: { id, establishmentId: currentEstablishmentId() } });
  }

  create(data: { label: string; priceCents: number; active: boolean; sortOrder: number }) {
    return this.prisma.ancillaryFee.create({ data: { ...data, establishmentId: currentEstablishmentId() } });
  }

  update(id: string, data: Partial<{ label: string; priceCents: number; active: boolean; sortOrder: number }>) {
    return this.prisma.ancillaryFee.update({ where: { id }, data });
  }

  async delete(id: string) {
    await this.prisma.ancillaryFee.delete({ where: { id } });
  }
}
