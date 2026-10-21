import { asyncHandler } from "../../shared/http.js";
import { AccessLogQuerySchema } from "./accessLog.dto.js";
import type { AccessLogService } from "./accessLog.service.js";

export class AccessLogController {
  constructor(private readonly logs: AccessLogService) {}

  list = asyncHandler(async (req, res) => {
    const query = AccessLogQuerySchema.parse(req.query);
    return res.json(await this.logs.list(query));
  });

  ping = asyncHandler(async (_req, res) => {
    return res.json({ ok: true });
  });
}
