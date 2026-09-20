import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { MAX_GALLERY_IMAGES, MAX_TOTAL_UPLOAD_BYTES, processImage, storagePathFromPublicUrl } from "./image-upload";

export const IMAGE_BUCKET = "project-images";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, "public", any>;

export interface ProjectImages { featured: string | null; share: string | null; gallery: string[] }

const isFile = (v: FormDataEntryValue | null): v is File => v instanceof File && v.size > 0;

/** The bucket is public-read (the images are for the public site) and write-restricted to server code. Created on demand if missing. */
async function ensureBucket(db: Db) {
  await db.storage.createBucket(IMAGE_BUCKET, { public: true, fileSizeLimit: 5 * 1024 * 1024, allowedMimeTypes: ["image/webp"] });
}

export async function uploadImageFile(db: Db, file: File, folder = "projects"): Promise<{ url: string } | { error: string }> {
  const processed = await processImage(new Uint8Array(await file.arrayBuffer()));
  if (!processed.ok) return { error: `${file.name || "Image"}: ${processed.error}` };
  const path = `${folder}/${randomUUID()}.webp`; // server-generated name; the original filename is never used
  const put = () => db.storage.from(IMAGE_BUCKET).upload(path, processed.data, { contentType: "image/webp", upsert: false });
  let { error } = await put();
  if (error && /bucket.*not found/i.test(error.message)) { await ensureBucket(db); ({ error } = await put()); }
  if (error) return { error: "Could not store the image. Please try again." };
  return { url: db.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl };
}

/**
 * Works out the project's final images from what is already stored (the database, never the browser) plus this submission's
 * uploads and removals. Returns the storage paths of images that were replaced or removed so they can be deleted after the save.
 */
export async function applyImageChanges(db: Db, form: FormData, existing: ProjectImages): Promise<{ images: ProjectImages; toDelete: string[] } | { error: string }> {
  const featuredFile = form.get("featured_image"), shareFile = form.get("share_image");
  const galleryFiles = form.getAll("gallery_files").filter(isFile);
  const all = [featuredFile, shareFile, ...galleryFiles].filter(isFile);
  if (all.reduce((s, f) => s + f.size, 0) > MAX_TOTAL_UPLOAD_BYTES) return { error: "Those images are too large to upload at once. Upload fewer or smaller images per save." };

  const removedGallery = new Set(form.getAll("remove_gallery").map(String));
  const keptGallery = existing.gallery.filter((u) => !removedGallery.has(u));
  if (keptGallery.length + galleryFiles.length > MAX_GALLERY_IMAGES) return { error: `A project can have at most ${MAX_GALLERY_IMAGES} gallery images.` };

  const toDeleteUrls: string[] = existing.gallery.filter((u) => removedGallery.has(u));
  const images: ProjectImages = { featured: existing.featured, share: existing.share, gallery: keptGallery };

  for (const [field, key, removeFlag] of [[featuredFile, "featured", "remove_featured"], [shareFile, "share", "remove_share"]] as const) {
    if (isFile(field)) {
      const r = await uploadImageFile(db, field);
      if ("error" in r) return { error: r.error };
      if (images[key]) toDeleteUrls.push(images[key]!);
      images[key] = r.url;
    } else if (form.get(removeFlag) === "on" && images[key]) {
      toDeleteUrls.push(images[key]!);
      images[key] = null;
    }
  }
  for (const file of galleryFiles) {
    const r = await uploadImageFile(db, file);
    if ("error" in r) return { error: r.error };
    images.gallery.push(r.url);
  }

  const base = publicEnv.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const toDelete = toDeleteUrls.map((u) => storagePathFromPublicUrl(u, base, IMAGE_BUCKET)).filter((p): p is string => !!p);
  return { images, toDelete };
}

/** Best-effort cleanup of replaced/removed files. A failure here only leaves an unused file behind. */
export async function removeImages(db: Db, paths: string[]) {
  if (paths.length) await db.storage.from(IMAGE_BUCKET).remove(paths).catch(() => undefined);
}

export async function loadExistingImages(db: Db, projectId: string): Promise<ProjectImages | null> {
  const { data } = await db.from("projects").select("featured_image_url, share_image_url, gallery").eq("id", projectId).maybeSingle();
  return data ? { featured: data.featured_image_url ?? null, share: data.share_image_url ?? null, gallery: Array.isArray(data.gallery) ? data.gallery : [] } : null;
}
