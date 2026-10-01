import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { put, get, del } from "@vercel/blob";

/**
 * File storage. Uses private Vercel Blob when BLOB_READ_WRITE_TOKEN is set
 * (production), otherwise the local ./storage folder (dev). Files are never
 * public: they are always streamed through /api/documents/[id] after a
 * permission check.
 */
const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const LOCAL_DIR = path.join(process.cwd(), "storage");

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel function body limit is 4.5 MB
export const ALLOWED_TYPES = [
  "application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
];

export function makeKey(scope: string, filename: string) {
  const safe = filename.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
  return `${scope}/${new Date().toISOString().slice(0, 7)}/${randomBytes(8).toString("hex")}-${safe}`;
}

export async function saveFile(key: string, data: Buffer, contentType: string) {
  if (blobEnabled()) {
    await put(key, data, { access: "private", contentType, addRandomSuffix: false });
    return;
  }
  const file = path.join(LOCAL_DIR, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
}

export async function readFileStream(key: string): Promise<ReadableStream<Uint8Array> | null> {
  if (blobEnabled()) {
    const res = await get(key, { access: "private" });
    return res?.statusCode === 200 ? res.stream : null;
  }
  const file = path.join(LOCAL_DIR, key);
  if (!file.startsWith(LOCAL_DIR)) return null; // path traversal guard
  try {
    const buf = await readFile(file);
    return new Blob([new Uint8Array(buf)]).stream();
  } catch {
    return null;
  }
}

export async function deleteFile(key: string) {
  if (blobEnabled()) {
    await del(key).catch(() => undefined);
    return;
  }
  await unlink(path.join(LOCAL_DIR, key)).catch(() => undefined);
}
