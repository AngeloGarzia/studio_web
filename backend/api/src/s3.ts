import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv } from "./env.js";

function requireS3() {
  const env = getEnv();
  const missing: string[] = [];
  if (!env.S3_BUCKET) missing.push("S3_BUCKET");
  if (!env.S3_REGION) missing.push("S3_REGION");
  if (!env.S3_ACCESS_KEY_ID) missing.push("S3_ACCESS_KEY_ID");
  if (!env.S3_SECRET_ACCESS_KEY) missing.push("S3_SECRET_ACCESS_KEY");
  if (!env.S3_ENDPOINT) missing.push("S3_ENDPOINT");
  if (missing.length) throw new Error(`S3_NOT_CONFIGURED: ${missing.join(", ")}`);
  return env;
}

export function getS3Client() {
  const env = requireS3();
  return new S3Client({
    region: env.S3_REGION!,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE ?? true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!
    }
  });
}

export async function presignPutObject(key: string, contentType: string) {
  const env = requireS3();
  const s3 = getS3Client();
  const cmd = new PutObjectCommand({
    Bucket: env.S3_BUCKET!,
    Key: key,
    ContentType: contentType
  });
  const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 60 * 10 });
  return { uploadUrl };
}

export async function deleteObject(key: string) {
  const env = requireS3();
  const s3 = getS3Client();
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET!, Key: key }));
}

export async function getObjectStream(key: string) {
  const env = requireS3();
  const s3 = getS3Client();
  const obj = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET!, Key: key }));
  return obj;
}

export async function putObjectBuffer(key: string, body: Buffer, contentType: string) {
  const env = requireS3();
  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType
    })
  );
}

