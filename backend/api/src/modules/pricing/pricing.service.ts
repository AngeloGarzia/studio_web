import { bookingNightKeyUtc } from "../../shared/dates.js";
import { AppError } from "../../shared/http.js";
import { ancillarySnapshotFromFees, type AncillaryFeeService } from "../ancillaryFee/ancillaryFee.service.js";
import type { PricingPreviewBody, StayPricingSummary, StayPromoRulePricing } from "./pricing.dto.js";
import type { PricingRepository } from "./pricing.repository.js";

function pickStayPromoRule(nightKeys: string[], rules: StayPromoRulePricing[]): StayPromoRulePricing | null {
  let best: StayPromoRulePricing | null = null;
  for (const r of rules) {
    if (!r.active) continue;
    const from = bookingNightKeyUtc(r.validFrom);
    const to = bookingNightKeyUtc(r.validToInclusive);
    if (from > to) continue;
    if (nightKeys.length < r.minStayNights) continue;
    if (!nightKeys.every((d) => d >= from && d <= to)) continue;
    if (!best || r.promoPercent > best.promoPercent) best = r;
  }
  return best;
}

export class PricingService {
  constructor(
    private readonly pricing: PricingRepository,
    private readonly ancillaryFees: AncillaryFeeService
  ) {}

  async computeStayPricingSummary(start: Date, end: Date): Promise<StayPricingSummary> {
    const startKey = start.toISOString().slice(0, 10);
    const endLast = new Date(end);
    endLast.setUTCDate(endLast.getUTCDate() - 1);
    const endLastKey = endLast.toISOString().slice(0, 10);

    const fromDate = new Date(`${startKey}T00:00:00.000Z`);
    const toDate = new Date(`${endLastKey}T00:00:00.000Z`);

    const nights: StayPricingSummary["nights"] = [];

    if (toDate >= fromDate) {
      const dayConfigs = await this.pricing.findDayConfigsInRange(fromDate, toDate);
      const byDay = new Map(dayConfigs.map((d) => [d.date.toISOString().slice(0, 10), d]));

      for (let d = new Date(fromDate); d <= toDate; d.setUTCDate(d.getUTCDate() + 1)) {
        const day = d.toISOString().slice(0, 10);
        const cfg = byDay.get(day);
        const priceCents = cfg?.priceCents ?? 0;
        const promoPercent = cfg?.promoPercent ?? null;
        const promoLabel = cfg?.promoLabel ?? null;
        const promoCents = promoPercent ? Math.round((priceCents * promoPercent) / 100) : 0;
        const finalCents = Math.max(0, priceCents - promoCents);
        nights.push({ day, priceCents, promoPercent, promoLabel, promoCents, finalCents, missingConfig: !cfg });
      }
    }

    const totalBeforePromoCents = nights.reduce((s, n) => s + n.priceCents, 0);
    const totalPromoCents = nights.reduce((s, n) => s + n.promoCents, 0);
    const totalAfterDayPromosCents = nights.reduce((s, n) => s + n.finalCents, 0);

    const stayPromoRules = await this.pricing.findAllStayPromoRules();
    const nightKeys = nights.map((n) => n.day);
    const matchedRule = pickStayPromoRule(nightKeys, stayPromoRules);
    const totalStayPromoCents = matchedRule
      ? Math.round((totalAfterDayPromosCents * matchedRule.promoPercent) / 100)
      : 0;
    const totalCents = Math.max(0, totalAfterDayPromosCents - totalStayPromoCents);

    return {
      nightsCount: nights.length,
      startKey,
      endKey: end.toISOString().slice(0, 10),
      nights,
      totalBeforePromoCents,
      totalPromoCents,
      totalAfterDayPromosCents,
      stayPromo: matchedRule
        ? {
            ruleId: matchedRule.id,
            label: matchedRule.label,
            promoPercent: matchedRule.promoPercent,
            promoCents: totalStayPromoCents,
            minStayNights: matchedRule.minStayNights,
            validFrom: bookingNightKeyUtc(matchedRule.validFrom),
            validToInclusive: bookingNightKeyUtc(matchedRule.validToInclusive)
          }
        : null,
      totalStayPromoCents,
      totalCents
    };
  }

  async preview(body: PricingPreviewBody) {
    const start = new Date(body.startDate);
    const end = new Date(body.endDate);
    if (isNaN(start.getTime())) throw new AppError("INVALID_START", 400);
    if (isNaN(end.getTime())) throw new AppError("INVALID_END", 400);
    if (end <= start) throw new AppError("INVALID_RANGE", 400);
    const pricing = await this.computeStayPricingSummary(start, end);
    const feeRows = await this.ancillaryFees.loadActiveOrdered();
    const { ancillaryTotalCents } = ancillarySnapshotFromFees(feeRows);
    return {
      ...pricing,
      ancillaryFees: feeRows,
      ancillaryTotalCents,
      grandTotalCents: pricing.totalCents + ancillaryTotalCents
    };
  }
}
