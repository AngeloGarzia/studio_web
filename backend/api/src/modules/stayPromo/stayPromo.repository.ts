import type { PrismaClient, StayPromoRule } from "@prisma/client";
import { currentEstablishmentId } from "../../shared/establishmentContext.js";

export type StayPromoPublic = {
  id: string;
  validFrom: Date;
  validToInclusive: Date;
  minStayNights: number;
  promoPercent: number;
  label: string | null;
};

export interface StayPromoRepository {
  findAll(): Promise<StayPromoRule[]>;
  findAllAdminOrdered(): Promise<StayPromoRule[]>;
  findPublicActive(todayStart: Date): Promise<StayPromoPublic[]>;
  findById(id: string): Promise<StayPromoRule | null>;
  create(data: {
    validFrom: Date;
    validToInclusive: Date;
    minStayNights: number;
    promoPercent: number;
    label: string | null;
    active: boolean;
  }): Promise<StayPromoRule>;
  update(
    id: string,
    data: Partial<{
      validFrom: Date;
      validToInclusive: Date;
      minStayNights: number;
      promoPercent: number;
      label: string | null;
      active: boolean;
    }>
  ): Promise<StayPromoRule>;
  delete(id: string): Promise<void>;
}

export class PrismaStayPromoRepository implements StayPromoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findAll() {
    return this.prisma.stayPromoRule.findMany({ where: { establishmentId: currentEstablishmentId() } });
  }

  findAllAdminOrdered() {
    return this.prisma.stayPromoRule.findMany({
      where: { establishmentId: currentEstablishmentId() },
      orderBy: [{ validFrom: "asc" }, { minStayNights: "desc" }, { promoPercent: "desc" }]
    });
  }

  findPublicActive(todayStart: Date) {
    return this.prisma.stayPromoRule.findMany({
      where: { establishmentId: currentEstablishmentId(), active: true, validToInclusive: { gte: todayStart } },
      orderBy: [{ validFrom: "asc" }, { minStayNights: "desc" }],
      select: {
        id: true,
        validFrom: true,
        validToInclusive: true,
        minStayNights: true,
        promoPercent: true,
        label: true
      }
    });
  }

  findById(id: string) {
    return this.prisma.stayPromoRule.findFirst({ where: { id, establishmentId: currentEstablishmentId() } });
  }

  create(data: {
    validFrom: Date;
    validToInclusive: Date;
    minStayNights: number;
    promoPercent: number;
    label: string | null;
    active: boolean;
  }) {
    return this.prisma.stayPromoRule.create({ data: { ...data, establishmentId: currentEstablishmentId() } });
  }

  update(
    id: string,
    data: Partial<{
      validFrom: Date;
      validToInclusive: Date;
      minStayNights: number;
      promoPercent: number;
      label: string | null;
      active: boolean;
    }>
  ) {
    return this.prisma.stayPromoRule.update({ where: { id }, data });
  }

  async delete(id: string) {
    await this.prisma.stayPromoRule.delete({ where: { id } });
  }
}
