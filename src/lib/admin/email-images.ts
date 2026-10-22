"use server";

import { randomUUID } from "node:crypto";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { processEmailImage } from "./image-upload";

const BUCKET = "email-images";

/**
 * Uploads a picture inserted into a message template (called from the builder as the file is chosen). Email apps fetch
 * pictures from the web, so the bucket is public-read; only server code writes to it. Created on demand if missing.
 */
export async function uploadEmailImage(form: FormData): Promise<{ ok: true; url: string; width: number } | { ok: false; error: string }> {
  await requirePermission("comms.send");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a picture to upload." };
  const processed = await processEmailImage(new Uint8Array(await file.arrayBuffer()));
  if (!processed.ok) return { ok: false, error: processed.error };

  const db = createSupabaseAdminClient();
  const contentType = processed.type === "png" ? "image/png" : "image/jpeg";
  const path = `templates/${randomUUID()}.${processed.type}`; // server-generated name; the original filename is never used
  const put = () => db.storage.from(BUCKET).upload(path, processed.data, { contentType, upsert: false });
  let { error } = await put();
  if (error && /bucket.*not found/i.test(error.message)) {
    await db.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 5 * 1024 * 1024, allowedMimeTypes: ["image/png", "image/jpeg"] });
    ({ error } = await put());
  }
  if (error) return { ok: false, error: "Could not store the picture. Please try again." };
  return { ok: true, url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, width: processed.width };
}
