import type { CalendarBlock, DayConfig, PrismaClient } from "@prisma/client";
import { AppError } from "../../shared/http.js";
import { currentEstablishmentId } from "../../shared/establishmentContext.js";

export interface CalendarRepository {
  findPublicWindow(
    fromDate: Date,
    toDate: Date
  ): Promise<{
    bookings: Array<{ id: string; startDate: Date; endDate: Date; status: string }>;
    blocks: Array<{ id: string; startDate: Date; endDate: Date; reason: string | null }>;
    dayConfigs: Array<{
      id: string;
      date: Date;
      priceCents: number;
      arrivalAllowed: boolean;
      departureAllowed: boolean;
      promoPercent: number | null;
      promoLabel: string | null;
    }>;
  }>;
  createBlock(data: { startDate: Date; endDate: Date; reason?: string }): Promise<CalendarBlock>;
  deleteBlock(id: string): Promise<void>;
  deleteBlocksOverlapping(start: Date, end: Date): Promise<number>;
  findBlocksOverlapping(
    dayStart: Date,
    dayEnd: Date
  ): Promise<Array<{ id: string; startDate: Date; endDate: Date; reason: string | null }>>;
  runTransaction(ops: Promise<unknown>[]): Promise<unknown[]>;
  deleteBlockOp(id: string): Promise<unknown>;
  createBlockOp(data: { startDate: Date; endDate: Date; reason?: string }): Promise<unknown>;
  upsertDayConfigs(
    nightKeys: string[],
    data: {
      priceCents: number;
      arrivalAllowed: boolean;
      departureAllowed: boolean;
      promoPercent: number | null;
      promoLabel: string | null;
    }
  ): Promise<DayConfig[]>;
}

export class PrismaCalendarRepository implements CalendarRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findPublicWindow(fromDate: Date, toDate: Date) {
    const [bookings, blocks, dayConfigs] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          establishmentId: currentEstablishmentId(),
          status: { in: ["PENDING", "CONFIRMED"] },
          startDate: { lt: toDate },
          endDate: { gt: fromDate }
        },
        select: { id: true, startDate: true, endDate: true, status: true }
      }),
      this.prisma.calendarBlock.findMany({
        where: { establishmentId: currentEstablishmentId(), startDate: { lt: toDate }, endDate: { gt: fromDate } },
        select: { id: true, startDate: true, endDate: true, reason: true }
      }),
      this.prisma.dayConfig.findMany({
        where: { establishmentId: currentEstablishmentId(), date: { gte: fromDate, lte: toDate } },
        select: {
          id: true,
          date: true,
          priceCents: true,
          arrivalAllowed: true,
          departureAllowed: true,
          promoPercent: true,
          promoLabel: true
        }
      })
    ]);
    return { bookings, blocks, dayConfigs };
  }

  createBlock(data: { startDate: Date; endDate: Date; reason?: string }) {
    return this.prisma.calendarBlock.create({ data: { ...data, establishmentId: currentEstablishmentId() } });
  }

  async deleteBlock(id: string) {
    const result = await this.prisma.calendarBlock.deleteMany({
      where: { id, establishmentId: currentEstablishmentId() }
    });
    if (result.count === 0) throw new AppError("NOT_FOUND", 404);
  }

  async deleteBlocksOverlapping(start: Date, end: Date) {
    const result = await this.prisma.calendarBlock.deleteMany({
      where: { establishmentId: currentEstablishmentId(), startDate: { lt: end }, endDate: { gt: start } }
    });
    return result.count;
  }

  findBlocksOverlapping(dayStart: Date, dayEnd: Date) {
    return this.prisma.calendarBlock.findMany({
      where: { establishmentId: currentEstablishmentId(), startDate: { lt: dayEnd }, endDate: { gt: dayStart } },
      select: { id: true, startDate: true, endDate: true, reason: true }
    });
  }

  runTransaction(ops: Promise<unknown>[]) {
    return this.prisma.$transaction(ops as never);
  }

  deleteBlockOp(id: string) {
    return this.prisma.calendarBlock.delete({ where: { id } });
  }

  createBlockOp(data: { startDate: Date; endDate: Date; reason?: string }) {
    return this.prisma.calendarBlock.create({ data: { ...data, establishmentId: currentEstablishmentId() } });
  }

  upsertDayConfigs(
    nightKeys: string[],
    data: {
      priceCents: number;
      arrivalAllowed: boolean;
      departureAllowed: boolean;
      promoPercent: number | null;
      promoLabel: string | null;
    }
  ) {
    const establishmentId = currentEstablishmentId();
    return this.prisma.$transaction(
      nightKeys.map((ymd) =>
        this.prisma.dayConfig.upsert({
          where: {
            establishmentId_date: { establishmentId, date: new Date(`${ymd}T00:00:00.000Z`) }
          },
          create: {
            establishmentId,
            date: new Date(`${ymd}T00:00:00.000Z`),
            priceCents: data.priceCents,
            arrivalAllowed: data.arrivalAllowed,
            departureAllowed: data.departureAllowed,
            promoPercent: data.promoPercent,
            promoLabel: data.promoLabel
          },
          update: {
            priceCents: data.priceCents,
            arrivalAllowed: data.arrivalAllowed,
            departureAllowed: data.departureAllowed,
            promoPercent: data.promoPercent,
            promoLabel: data.promoLabel
          }
        })
      )
    );
  }
}
