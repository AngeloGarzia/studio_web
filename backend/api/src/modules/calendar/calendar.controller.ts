import { asyncHandler, routeParam } from "../../shared/http.js";
import {
  ClearBlocksBodySchema,
  CreateBlockBodySchema,
  PublicCalendarQuerySchema,
  UnblockDayBodySchema,
  UpsertDayConfigBodySchema
} from "./calendar.dto.js";
import type { CalendarService } from "./calendar.service.js";

export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  getPublic = asyncHandler(async (req, res) => {
    const query = PublicCalendarQuerySchema.parse(req.query);
    return res.json(await this.calendar.getPublic(query));
  });

  createBlock = asyncHandler(async (req, res) => {
    const body = CreateBlockBodySchema.parse(req.body);
    return res.json(await this.calendar.createBlock(body));
  });

  deleteBlock = asyncHandler(async (req, res) => {
    return res.json(await this.calendar.deleteBlock(routeParam(req, "id")));
  });

  clearBlocks = asyncHandler(async (req, res) => {
    const body = ClearBlocksBodySchema.parse(req.body);
    return res.json(await this.calendar.clearBlocks(body));
  });

  unblockDay = asyncHandler(async (req, res) => {
    const body = UnblockDayBodySchema.parse(req.body);
    return res.json(await this.calendar.unblockDay(body));
  });

  upsertDayConfig = asyncHandler(async (req, res) => {
    const body = UpsertDayConfigBodySchema.parse(req.body);
    return res.json(await this.calendar.upsertDayConfig(body));
  });
}
