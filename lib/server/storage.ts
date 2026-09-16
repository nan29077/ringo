import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";

export type StoredObject = { body: ReadableStream<Uint8Array>; size?: number; contentType?: string };

export interface StorageDriver {
  name: "local" | "s3";
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  remove(key: string): Promise<void>;
  /** Short-lived direct URL (S3). Local driver returns null → stream through the app. */
  signedUrl(key: string, filename: string, seconds: number): Promise<string | null>;
}

const localRoot = () => process.env.UPLOAD_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), ".data", "uploads");

function safeLocalPath(key: string) {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..")) throw new Error("Invalid storage key");
  return path.join(localRoot(), key);
}

const local: StorageDriver = {
  name: "local",
  async put(key, data) {
    const file = safeLocalPath(key);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, data);
  },
  async get(key) {
    const file = safeLocalPath(key);
    try {
      const stat = await fsp.stat(file);
      return { body: Readable.toWeb(fs.createReadStream(file)) as ReadableStream<Uint8Array>, size: stat.size };
    } catch {
      return null;
    }
  },
  async remove(key) {
    await fsp.rm(safeLocalPath(key), { force: true });
  },
  async signedUrl() {
    return null;
  },
};

let s3Driver: StorageDriver | null = null;
async function s3(): Promise<StorageDriver> {
  if (s3Driver) return s3Driver;
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const bucket = process.env.S3_BUCKET!;
  const client = new S3Client({ region: process.env.AWS_REGION || "ap-southeast-1" });
  s3Driver = {
    name: "s3",
    async put(key, data, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: contentType, ServerSideEncryption: "AES256" }));
    },
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if (!res.Body) return null;
        return { body: res.Body.transformToWebStream() as ReadableStream<Uint8Array>, size: res.ContentLength, contentType: res.ContentType };
      } catch {
        return null;
      }
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async signedUrl(key, filename, seconds) {
      return getSignedUrl(client, new GetObjectCommand({
        Bucket: bucket, Key: key,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      }), { expiresIn: seconds });
    },
  };
  return s3Driver;
}

export async function storage(): Promise<StorageDriver> {
  return process.env.S3_BUCKET ? s3() : local;
}

export function storageDriverName() {
  return process.env.S3_BUCKET ? "s3" : "local";
}

export function newStorageKey(prefix: "public/covers" | "public/banners" | "public/avatars" | "private/assets" | "private/deliverables", filename: string) {
  const ext = path.extname(filename).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10);
  return `${prefix}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}${ext}`;
}

/** Public URL for covers/banners. `preset:name` keys use bundled artwork in /public/images. */
export function mediaUrl(key: string | null | undefined): string {
  if (!key) return "/images/book.webp";
  if (key.startsWith("preset:")) return `/images/${key.slice(7)}.webp`;
  if (key.startsWith("public/")) return `/media/${key}`;
  return "/images/book.webp";
}

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const maxUploadBytes = () => Number(process.env.MAX_UPLOAD_MB || 200) * 1024 * 1024;
