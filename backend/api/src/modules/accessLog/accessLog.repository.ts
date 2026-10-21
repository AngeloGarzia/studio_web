import type { AccessLog, PrismaClient } from "@prisma/client";

export interface AccessLogRepository {
  findRecent(take: number): Promise<AccessLog[]>;
}

export class PrismaAccessLogRepository implements AccessLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findRecent(take: number) {
    return this.prisma.accessLog.findMany({ orderBy: { createdAt: "desc" }, take });
  }
}
