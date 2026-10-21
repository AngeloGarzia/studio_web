import { inclusiveUtcNightKeys } from "../../shared/dates.js";
import { AppError } from "../../shared/http.js";
import type {
  ClearBlocksBody,
  CreateBlockBody,
  PublicCalendarQuery,
  UnblockDayBody,
  UpsertDayConfigBody
} from "./calendar.dto.js";
import type { CalendarRepository } from "./calendar.repository.js";

export class CalendarService {
  constructor(private readonly calendar: CalendarRepository) {}

  async getPublic(query: PublicCalendarQuery) {
    const fromDate = query.from
      ? new Date(query.from)
      : new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1);
    const toDate = query.to
      ? new Date(query.to)
      : (() => {
          const d = new Date();
          d.setMonth(d.getMonth() + 24);
          return d;
        })();
    const raw = await this.calendar.findPublicWindow(fromDate, toDate);
    // Pas d’ids / statuts / raisons côté public : uniquement les plages occupées + tarifs jour.
    return {
      bookings: raw.bookings.map((b) => ({
        startDate: b.startDate,
        endDate: b.endDate
      })),
      blocks: raw.blocks.map((b) => ({
        startDate: b.startDate,
        endDate: b.endDate
      })),
      dayConfigs: raw.dayConfigs.map((d) => ({
        date: d.date,
        priceCents: d.priceCents,
        arrivalAllowed: d.arrivalAllowed,
        departureAllowed: d.departureAllowed,
        promoPercent: d.promoPercent,
        promoLabel: d.promoLabel
      }))
    };
  }

  async createBlock(body: CreateBlockBody) {
    const start = new Date(body.startDate);
    const end = new Date(body.endDate);
    if (end <= start) throw new AppError("INVALID_RANGE", 400);
    return this.calendar.createBlock({ startDate: start, endDate: end, reason: body.reason });
  }

  async deleteBlock(id: string) {
    await this.calendar.deleteBlock(id);
    return { ok: true as const };
  }

  async clearBlocks(body: ClearBlocksBody) {
    const start = new Date(body.startDate);
    const end = new Date(body.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new AppError("INVALID_RANGE", 400);
    if (end <= start) throw new AppError("INVALID_RANGE", 400);
    const deleted = await this.calendar.deleteBlocksOverlapping(start, end);
    return { ok: true as const, deleted };
  }

  async unblockDay(body: UnblockDayBody) {
    const dayStart = new Date(`${body.day}T00:00:00.000Z`);
    if (isNaN(dayStart.getTime())) throw new AppError("INVALID_DAY", 400);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const overlapping = await this.calendar.findBlocksOverlapping(dayStart, dayEnd);
    if (overlapping.length === 0) return { ok: true as const, updated: 0 };

    const ops: Promise<unknown>[] = [];
    for (const blk of overlapping) {
      ops.push(this.calendar.deleteBlockOp(blk.id));
      if (blk.startDate < dayStart) {
        ops.push(
          this.calendar.createBlockOp({
            startDate: blk.startDate,
            endDate: dayStart,
            reason: blk.reason ?? undefined
          })
        );
      }
      if (blk.endDate > dayEnd) {
        ops.push(
          this.calendar.createBlockOp({
            startDate: dayEnd,
            endDate: blk.endDate,
            reason: blk.reason ?? undefined
          })
        );
      }
    }
    await this.calendar.runTransaction(ops);
    return { ok: true as const, updated: overlapping.length };
  }

  async upsertDayConfig(body: UpsertDayConfigBody) {
    const fromDate = new Date(`${body.from}T00:00:00.000Z`);
    const toDate = new Date(`${body.to}T00:00:00.000Z`);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) throw new AppError("INVALID_RANGE", 400);
    if (toDate < fromDate) throw new AppError("INVALID_RANGE", 400);

    const nightKeys = inclusiveUtcNightKeys(body.from, body.to);
    if (nightKeys.length === 0) throw new AppError("INVALID_RANGE", 400);

    const results = await this.calendar.upsertDayConfigs(nightKeys, {
      priceCents: body.priceCents,
      arrivalAllowed: body.arrivalAllowed ?? true,
      departureAllowed: body.departureAllowed ?? true,
      promoPercent: body.promoPercent ?? null,
      promoLabel: body.promoLabel ?? null
    });
    return { ok: true as const, count: results.length };
  }
}
