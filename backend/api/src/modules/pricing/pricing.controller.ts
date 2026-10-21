import { asyncHandler } from "../../shared/http.js";
import { PricingPreviewBodySchema } from "./pricing.dto.js";
import type { PricingService } from "./pricing.service.js";

export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  preview = asyncHandler(async (req, res) => {
    const body = PricingPreviewBodySchema.parse(req.body);
    return res.json(await this.pricing.preview(body));
  });
}
