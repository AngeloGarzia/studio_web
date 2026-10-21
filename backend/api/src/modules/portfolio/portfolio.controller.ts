import { asyncHandler, routeParam } from "../../shared/http.js";
import { UpdatePortfolioBodySchema, UploadPortfolioBodySchema } from "./portfolio.dto.js";
import type { PortfolioService } from "./portfolio.service.js";

export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  listPublic = asyncHandler(async (_req, res) => {
    return res.json(await this.portfolio.listPublic());
  });

  streamPublic = asyncHandler(async (req, res) => {
    const variant = typeof req.query.variant === "string" ? req.query.variant : undefined;
    const obj = await this.portfolio.getPublicStream(routeParam(req, "id"), variant);
    if (obj.ContentType) res.setHeader("Content-Type", obj.ContentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    // @ts-expect-error Body is a stream in Node
    return obj.Body.pipe(res);
  });

  listAdmin = asyncHandler(async (_req, res) => {
    return res.json(await this.portfolio.listAdmin());
  });

  upload = asyncHandler(async (req, res) => {
    const body = UploadPortfolioBodySchema.parse(req.body);
    return res.json(await this.portfolio.upload(body));
  });

  thumbnail = asyncHandler(async (req, res) => {
    return res.json(await this.portfolio.generateThumbnail(routeParam(req, "id")));
  });

  backfill = asyncHandler(async (_req, res) => {
    return res.json(await this.portfolio.backfillThumbnails());
  });

  update = asyncHandler(async (req, res) => {
    const body = UpdatePortfolioBodySchema.parse(req.body);
    return res.json(await this.portfolio.update(routeParam(req, "id"), body));
  });

  remove = asyncHandler(async (req, res) => {
    return res.json(await this.portfolio.delete(routeParam(req, "id")));
  });
}
