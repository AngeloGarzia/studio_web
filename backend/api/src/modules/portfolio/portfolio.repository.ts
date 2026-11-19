import type { PortfolioMedia, PrismaClient } from "@prisma/client";
import { currentEstablishmentId } from "../../shared/establishmentContext.js";
import { buildMediaFolder } from "../../shared/mediaFolder.js";

export interface PortfolioRepository {
  findPublishedOrdered(): Promise<PortfolioMedia[]>;
  findAllOrdered(): Promise<PortfolioMedia[]>;
  findById(id: string): Promise<PortfolioMedia | null>;
  findPublishedById(id: string): Promise<PortfolioMedia | null>;
  /** Dossier S3 stable de l’établissement courant (créé au besoin). */
  ensureMediaFolder(establishmentId?: string): Promise<string>;
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
  listEstablishmentsForMedia(): Promise<Array<{ id: string; name: string; mediaFolder: string | null }>>;
  listMediaKeysByEstablishment(
    establishmentId: string
  ): Promise<Array<{ id: string; s3Key: string; thumbS3Key: string | null }>>;
  updateKeys(id: string, s3Key: string, thumbS3Key: string | null): Promise<void>;
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

  async ensureMediaFolder(establishmentId?: string): Promise<string> {
    const id = establishmentId ?? currentEstablishmentId();
    for (let attempt = 0; attempt < 5; attempt++) {
      const est = await this.prisma.establishment.findUnique({
        where: { id },
        select: { id: true, name: true, mediaFolder: true }
      });
      if (!est) throw new Error(`ESTABLISHMENT_NOT_FOUND:${id}`);
      if (est.mediaFolder) return est.mediaFolder;
      const folder = buildMediaFolder(est.name);
      try {
        await this.prisma.establishment.update({
          where: { id },
          data: { mediaFolder: folder }
        });
        return folder;
      } catch {
        // Collision unique rare → nouvel essai
      }
    }
    throw new Error("MEDIA_FOLDER_ALLOCATION_FAILED");
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

  listEstablishmentsForMedia() {
    return this.prisma.establishment.findMany({
      select: { id: true, name: true, mediaFolder: true },
      orderBy: { createdAt: "asc" }
    });
  }

  listMediaKeysByEstablishment(establishmentId: string) {
    return this.prisma.portfolioMedia.findMany({
      where: { establishmentId },
      select: { id: true, s3Key: true, thumbS3Key: true }
    });
  }

  async updateKeys(id: string, s3Key: string, thumbS3Key: string | null) {
    await this.prisma.portfolioMedia.update({ where: { id }, data: { s3Key, thumbS3Key } });
  }
}
