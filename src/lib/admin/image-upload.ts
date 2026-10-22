import sharp from "sharp";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_TOTAL_UPLOAD_BYTES = 28 * 1024 * 1024; // must stay under the server-action body limit (30 MB)
export const MAX_GALLERY_IMAGES = 10;

/** Identifies the file by its CONTENT, never its name or browser-reported type. SVG and other formats are rejected on purpose. */
export function sniffImage(bytes: Uint8Array): "png" | "jpg" | "webp" | null {
  const at = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (bytes.length < 12) return null;
  if (at(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (at(0xff, 0xd8, 0xff)) return "jpg";
  if (at(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "webp";
  return null;
}

export type ProcessedImage = { ok: true; data: Buffer; width: number; height: number } | { ok: false; error: string };

/**
 * Validates and RE-ENCODES an upload. Re-encoding as WebP (a) strips all metadata, including the GPS location and camera details
 * phones embed in photos, (b) applies the camera rotation, (c) caps the size at 2000 px, and (d) guarantees the stored bytes are a
 * plain image, so a file disguised as an image cannot be served as anything else.
 */
export async function processImage(bytes: Uint8Array): Promise<ProcessedImage> {
  if (bytes.length === 0) return { ok: false, error: "The image file is empty." };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: "Each image must be 8 MB or smaller." };
  if (!sniffImage(bytes)) return { ok: false, error: "Use a JPEG, PNG or WebP image." };
  try {
    const { data, info } = await sharp(bytes, { failOn: "error", limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { ok: true, data, width: info.width, height: info.height };
  } catch {
    return { ok: false, error: "That file could not be read as an image. Try a different photo." };
  }
}

/** Storage object path for one of OUR public URLs (used to delete replaced images), or null for anything else. */
export function storagePathFromPublicUrl(url: string, supabaseUrl: string, bucket: string): string | null {
  const prefix = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/`;
  if (!url.startsWith(prefix)) return null;
  const path = decodeURIComponent(url.slice(prefix.length));
  return path && !path.includes("..") ? path : null;
}

export type ProcessedEmailImage = { ok: true; data: Buffer; width: number; height: number; type: "png" | "jpg" } | { ok: false; error: string };

/**
 * Like processImage, for pictures in emails: re-encoded as JPEG, or PNG when the picture has transparency (a signature,
 * a logo), since WebP doesn't show in Outlook for Windows. Capped at 1200 px wide, larger than any email is shown.
 */
export async function processEmailImage(bytes: Uint8Array): Promise<ProcessedEmailImage> {
  if (bytes.length === 0) return { ok: false, error: "The image file is empty." };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: "The image must be 8 MB or smaller." };
  if (!sniffImage(bytes)) return { ok: false, error: "Use a JPEG, PNG or WebP image." };
  try {
    const img = sharp(bytes, { failOn: "error", limitInputPixels: 60_000_000 }).rotate().resize({ width: 1200, withoutEnlargement: true });
    const { hasAlpha } = await sharp(bytes, { limitInputPixels: 60_000_000 }).metadata();
    const { data, info } = hasAlpha
      ? await img.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
      : await img.flatten({ background: "#ffffff" }).jpeg({ quality: 85, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    return { ok: true, data, width: info.width, height: info.height, type: hasAlpha ? "png" : "jpg" };
  } catch {
    return { ok: false, error: "That file could not be read as an image. Try a different picture." };
  }
}
