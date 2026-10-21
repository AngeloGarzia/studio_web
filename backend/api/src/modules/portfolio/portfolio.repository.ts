import type { PortfolioMedia, PrismaClient } from "@prisma/client";
import { currentEstablishmentId } from "../../shared/establishmentContext.js";

export interface PortfolioRepository {
  findPublishedOrdered(): Promise<PortfolioMedia[]>;
  findAllOrdered(): Promise<PortfolioMedia[]>;
  findById(id: string): Promise<PortfolioMedia | null>;
  findPublishedById(id: string): Promise<PortfolioMedia | null>;
  create(data: {
    title?: string;
    type: "image" | "video";
    s3Key: string;
    publicUrl: null;
    isPublished: boolean;
  }): Promise<PortfolioMedia>;
  delete(id: string): Promise<void>;
  update(
    id: string,
    data: Partial<{ title: string; publicUrl: string | null; order: number; isPublished: boolean; thumbS3Key: string }>
  ): Promise<PortfolioMedia>;
  findImagesMissingThumb(): Promise<Array<{ id: string; s3Key: string }>>;
}

export class PrismaPortfolioRepository implements PortfolioRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findPublishedOrdered() {
    return this.prisma.portfolioMedia.findMany({
      where: { establishmentId: currentEstablishmentId(), isPublished: true },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }]
    });
  }

  findAllOrdered() {
    return this.prisma.portfolioMedia.findMany({
      where: { establishmentId: currentEstablishmentId() },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }]
    });
  }

  findById(id: string) {
    return this.prisma.portfolioMedia.findFirst({ where: { id, establishmentId: currentEstablishmentId() } });
  }

  findPublishedById(id: string) {
    return this.prisma.portfolioMedia.findFirst({ where: { id, isPublished: true } });
  }

  create(data: {
    title?: string;
    type: "image" | "video";
    s3Key: string;
    publicUrl: null;
    isPublished: boolean;
  }) {
    return this.prisma.portfolioMedia.create({ data: { ...data, establishmentId: currentEstablishmentId() } });
  }

  async delete(id: string) {
    await this.prisma.portfolioMedia.delete({ where: { id } });
  }

  update(
    id: string,
    data: Partial<{ title: string; publicUrl: string | null; order: number; isPublished: boolean; thumbS3Key: string }>
  ) {
    return this.prisma.portfolioMedia.update({ where: { id }, data });
  }

  findImagesMissingThumb() {
    return this.prisma.portfolioMedia.findMany({
      where: { establishmentId: currentEstablishmentId(), type: "image", thumbS3Key: null },
      select: { id: true, s3Key: true }
    });
  }
}
