import { z } from "zod";

export const PricingPreviewBodySchema = z.object({
  startDate: z.string(),
  endDate: z.string()
});
export type PricingPreviewBody = z.infer<typeof PricingPreviewBodySchema>;

export type StayPromoRulePricing = {
  id: string;
  active: boolean;
  validFrom: Date;
  validToInclusive: Date;
  minStayNights: number;
  promoPercent: number;
  label: string | null;
};

export type StayPricingSummary = {
  nightsCount: number;
  startKey: string;
  endKey: string;
  nights: Array<{
    day: string;
    priceCents: number;
    promoPercent: number | null;
    promoLabel: string | null;
    promoCents: number;
    finalCents: number;
    missingConfig: boolean;
  }>;
  totalBeforePromoCents: number;
  totalPromoCents: number;
  totalAfterDayPromosCents: number;
  stayPromo: {
    ruleId: string;
    label: string | null;
    promoPercent: number;
    promoCents: number;
    minStayNights: number;
    validFrom: string;
    validToInclusive: string;
  } | null;
  totalStayPromoCents: number;
  totalCents: number;
};
