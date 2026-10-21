import sharp from "sharp";
import type { ObjectStorage } from "../../infra/s3.js";
import { AppError } from "../../shared/http.js";
import { ALLOWED_CONTENT_TYPES, type UpdatePortfolioBody, type UploadPortfolioBody } from "./portfolio.dto.js";
import type { PortfolioRepository } from "./portfolio.repository.js";

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.from([]);
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Vue HTTP sans clés S3 / chemins stockage (jamais exposés au frontend). */
function toMediaDto(m: {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  title: string | null;
  type: string;
  publicUrl: string | null;
  order: number;
  isPublished: boolean;
  thumbS3Key: string | null;
}) {
  return {
    id: m.id,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    title: m.title,
    type: m.type,
    publicUrl: m.publicUrl,
    order: m.order,
    isPublished: m.isPublished,
    thumbUrl: m.thumbS3Key ? `/api/public/media/${m.id}?variant=thumb` : null,
    url: `/api/public/media/${m.id}`
  };
}

export class PortfolioService {
  constructor(
    private readonly media: PortfolioRepository,
    private readonly storage: ObjectStorage
  ) {}

  async listPublic() {
    const rows = await this.media.findPublishedOrdered();
    return rows.map(toMediaDto);
  }

  async listAdmin() {
    const rows = await this.media.findAllOrdered();
    return rows.map(toMediaDto);
  }

  async getPublicStream(id: string, variant?: string) {
    const media = await this.media.findPublishedById(id);
    if (!media) throw new AppError("NOT_FOUND", 404);
    const key = variant === "thumb" && media.thumbS3Key ? media.thumbS3Key : media.s3Key;
    try {
      return await this.storage.getObjectStream(key);
    } catch {
      throw new AppError("NOT_FOUND", 404);
    }
  }

  async upload(body: UploadPortfolioBody) {
    if (!ALLOWED_CONTENT_TYPES.has(body.contentType)) throw new AppError("UNSUPPORTED_MEDIA_TYPE", 400);

    const safeName = body.filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
    const s3Key = `portfolio/${Date.now()}_${safeName}`;

    const created = await this.media.create({
      title: body.title,
      type: body.type,
      s3Key,
      publicUrl: null,
      isPublished: body.isPublished ?? true
    });

    try {
      const { uploadUrl } = await this.storage.presignPutObject(s3Key, body.contentType);
      return { media: toMediaDto(created), uploadUrl };
    } catch (e: unknown) {
      await this.media.delete(created.id).catch(() => {});
      const message = e instanceof Error ? e.message : "S3_ERROR";
      throw new AppError(String(message), 400);
    }
  }

  async generateThumbnail(id: string) {
    const media = await this.media.findById(id);
    if (!media) throw new AppError("NOT_FOUND", 404);
    if (media.type !== "image") throw new AppError("NOT_AN_IMAGE", 400);

    try {
      const obj = await this.storage.getObjectStream(media.s3Key);
      const buf = await streamToBuffer(obj.Body);
      const thumb = await sharp(buf)
        .rotate()
        .resize(360, 240, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 78 })
        .toBuffer();

      const thumbKey = `portfolio/thumbs/${media.id}.jpg`;
      await this.storage.putObjectBuffer(thumbKey, thumb, "image/jpeg");
      const updated = await this.media.update(media.id, { thumbS3Key: thumbKey });
      return {
        ok: true as const,
        media: toMediaDto(updated)
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "THUMBNAIL_FAILED";
      if (e instanceof AppError) throw e;
      throw new AppError(String(message), 400);
    }
  }

  async backfillThumbnails() {
    const targets = await this.media.findImagesMissingThumb();
    let ok = 0;
    let failed = 0;

    for (const t of targets) {
      try {
        const obj = await this.storage.getObjectStream(t.s3Key);
        const buf = await streamToBuffer(obj.Body);
        const thumb = await sharp(buf)
          .rotate()
          .resize(360, 240, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 78 })
          .toBuffer();
        const thumbKey = `portfolio/thumbs/${t.id}.jpg`;
        await this.storage.putObjectBuffer(thumbKey, thumb, "image/jpeg");
        await this.media.update(t.id, { thumbS3Key: thumbKey });
        ok++;
      } catch {
        failed++;
      }
    }

    return { ok: true as const, total: targets.length, generated: ok, failed };
  }

  async update(id: string, body: UpdatePortfolioBody) {
    const updated = await this.media.update(id, body);
    return toMediaDto(updated);
  }

  async delete(id: string) {
    const media = await this.media.findById(id);
    if (media) {
      await this.media.delete(id);
      await this.storage.deleteObject(media.s3Key).catch(() => {});
      if (media.thumbS3Key) await this.storage.deleteObject(media.thumbS3Key).catch(() => {});
    }
    return { ok: true as const };
  }
}
