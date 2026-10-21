import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { AppError } from "./http.js";

const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"]);
const ALLOWED_EXT = new Set(["pdf", "jpg", "jpeg", "png", "webp"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 8, fileSize: 8_000_000 },
  fileFilter: (_req, file, cb) => {
    if (fileAllowed(file.mimetype, file.originalname)) cb(null, true);
    else cb(new Error("ATTACHMENT_TYPE"));
  }
});

/** Pièces jointes optionnelles d’un envoi de quittance, en plus du PDF. */
export function quittanceUpload(req: Request, res: Response, next: NextFunction) {
  upload.array("attachments", 8)(req, res, (err: unknown) => {
    if (!err) return next();
    const code = err instanceof Error ? err.message : "";
    const multerCode = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code === "ATTACHMENT_TYPE") return next(new AppError("ATTACHMENT_TYPE", 400));
    if (multerCode === "LIMIT_FILE_SIZE") return next(new AppError("ATTACHMENT_TOO_LARGE", 400));
    if (multerCode === "LIMIT_FILE_COUNT" || multerCode === "LIMIT_UNEXPECTED_FILE") return next(new AppError("TOO_MANY_ATTACHMENTS", 400));
    return next(err);
  });
}

export type MailAttachment = { filename: string; content: Buffer; contentType: string };

export function extraAttachments(req: Request): MailAttachment[] {
  const files = Array.isArray(req.files) ? req.files : [];
  return files.map((file) => ({
    filename: safeFilename(file.originalname),
    content: file.buffer,
    contentType: contentTypeOf(file.mimetype, file.originalname)
  }));
}

export function readPayload(req: Request): unknown {
  const raw = req.body && typeof req.body === "object" && "payload" in req.body ? (req.body as { payload?: unknown }).payload : req.body;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError("VALIDATION_ERROR", 400);
  }
}

function fileAllowed(mime: string, original: string): boolean {
  if (ALLOWED.has(mime)) return true;
  const ext = extensionOf(original);
  if (!ALLOWED_EXT.has(ext)) return false;
  return mime === "" || mime === "application/octet-stream";
}

function extensionOf(original: string): string {
  return original.split(".").pop()?.toLowerCase() ?? "";
}

function contentTypeOf(mime: string, original: string): string {
  if (mime === "image/jpg" || mime === "image/jpeg") return "image/jpeg";
  if (mime === "image/png" || mime === "image/webp" || mime === "application/pdf") return mime;
  return typeFromName(original);
}

function typeFromName(original: string): string {
  const ext = extensionOf(original);
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

function safeFilename(original: string): string {
  const base = original.split(/[/\\]/).pop()?.trim() || "piece-jointe";
  const clean = base.replace(/[^\w.\- ()àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ]/g, "_").slice(0, 120);
  return clean || "piece-jointe";
}
