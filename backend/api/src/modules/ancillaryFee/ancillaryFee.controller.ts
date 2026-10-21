import { asyncHandler, routeParam } from "../../shared/http.js";
import { CreateAncillaryFeeBodySchema, UpdateAncillaryFeeBodySchema } from "./ancillaryFee.dto.js";
import type { AncillaryFeeService } from "./ancillaryFee.service.js";

export class AncillaryFeeController {
  constructor(private readonly fees: AncillaryFeeService) {}

  listPublic = asyncHandler(async (_req, res) => {
    return res.json(await this.fees.listPublic());
  });

  listAdmin = asyncHandler(async (_req, res) => {
    return res.json(await this.fees.listAdmin());
  });

  create = asyncHandler(async (req, res) => {
    const body = CreateAncillaryFeeBodySchema.parse(req.body);
    return res.json(await this.fees.create(body));
  });

  update = asyncHandler(async (req, res) => {
    const body = UpdateAncillaryFeeBodySchema.parse(req.body);
    return res.json(await this.fees.update(routeParam(req, "id"), body));
  });

  remove = asyncHandler(async (req, res) => {
    return res.json(await this.fees.delete(routeParam(req, "id")));
  });
}
