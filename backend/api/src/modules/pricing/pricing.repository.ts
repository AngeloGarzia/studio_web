import type { PrismaClient } from "@prisma/client";
import { currentEstablishmentId } from "../../shared/establishmentContext.js";
import type { StayPromoRulePricing } from "./pricing.dto.js";

export type DayConfigPricingRow = {
  date: Date;
  priceCents: number;
  promoPercent: number | null;
  promoLabel: string | null;
};

export interface PricingRepository {
  findDayConfigsInRange(fromDate: Date, toDate: Date): Promise<DayConfigPricingRow[]>;
  findAllStayPromoRules(): Promise<StayPromoRulePricing[]>;
}

export class PrismaPricingRepository implements PricingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findDayConfigsInRange(fromDate: Date, toDate: Date) {
    return this.prisma.dayConfig.findMany({
      where: { establishmentId: currentEstablishmentId(), date: { gte: fromDate, lte: toDate } },
      select: { date: true, priceCents: true, promoPercent: true, promoLabel: true }
    });
  }

  findAllStayPromoRules() {
    return this.prisma.stayPromoRule.findMany({ where: { establishmentId: currentEstablishmentId() } });
  }
}
