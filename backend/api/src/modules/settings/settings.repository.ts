import type { PrismaClient, SiteSettings } from "@prisma/client";
import { currentEstablishmentId } from "../../shared/establishmentContext.js";

export interface SettingsRepository {
  findFirst(): Promise<SiteSettings | null>;
  create(data: { studioName: string } & Record<string, unknown>): Promise<SiteSettings>;
  update(id: string, data: Record<string, unknown>): Promise<SiteSettings>;
}

export class PrismaSettingsRepository implements SettingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findFirst() {
    return this.prisma.siteSettings.findUnique({ where: { establishmentId: currentEstablishmentId() } });
  }

  create(data: { studioName: string } & Record<string, unknown>) {
    return this.prisma.siteSettings.create({
      data: { ...data, establishmentId: currentEstablishmentId() } as never
    });
  }

  update(id: string, data: Record<string, unknown>) {
    return this.prisma.siteSettings.update({ where: { id }, data: data as never });
  }
}
