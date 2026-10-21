import { asyncHandler } from "../../shared/http.js";
import { UpdateSettingsBodySchema } from "./settings.dto.js";
import type { SettingsService } from "./settings.service.js";

export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  getPublic = asyncHandler(async (_req, res) => {
    return res.json(await this.settings.getPublic());
  });

  getAdmin = asyncHandler(async (_req, res) => {
    const row = await this.settings.getAdmin();
    if (!row) return res.json(null);
    return res.json(row);
  });

  putAdmin = asyncHandler(async (req, res) => {
    const body = UpdateSettingsBodySchema.parse(req.body);
    return res.json(await this.settings.upsert(body));
  });
}
