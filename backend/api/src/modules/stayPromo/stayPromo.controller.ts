import { asyncHandler, routeParam } from "../../shared/http.js";
import { CreateStayPromoBodySchema, UpdateStayPromoBodySchema } from "./stayPromo.dto.js";
import type { StayPromoService } from "./stayPromo.service.js";

export class StayPromoController {
  constructor(private readonly promos: StayPromoService) {}

  listPublic = asyncHandler(async (_req, res) => {
    return res.json(await this.promos.listPublic());
  });

  listAdmin = asyncHandler(async (_req, res) => {
    return res.json(await this.promos.listAdmin());
  });

  create = asyncHandler(async (req, res) => {
    const body = CreateStayPromoBodySchema.parse(req.body);
    return res.json(await this.promos.create(body));
  });

  update = asyncHandler(async (req, res) => {
    const body = UpdateStayPromoBodySchema.parse(req.body);
    return res.json(await this.promos.update(routeParam(req, "id"), body));
  });

  remove = asyncHandler(async (req, res) => {
    return res.json(await this.promos.delete(routeParam(req, "id")));
  });
}
