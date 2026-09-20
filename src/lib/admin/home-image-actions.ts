"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { getSetting, setSetting } from "@/lib/settings";
import { publicEnv } from "@/lib/env";
import { storagePathFromPublicUrl } from "./image-upload";
import { IMAGE_BUCKET, removeImages, uploadImageFile } from "./project-images";
import { HOME_ALT_KEY, HOME_IMAGE_KEY } from "./home-image-keys";
import type { AdminState } from "./donor-actions";

const altSchema = z.string().trim().min(5, "Describe the photo for people who can't see it (at least a few words).").max(200);

/** Sets, replaces or removes the home page hero photo. Alt text is required whenever there is a photo (accessibility). */
export async function saveHomeImage(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("settings.manage");
  const db = createSupabaseAdminClient();
  const file = form.get("hero_image");
  const upload = file instanceof File && file.size > 0 ? file : null;
  const remove = form.get("remove_hero") === "on";
  const currentUrl = ((await getSetting(HOME_IMAGE_KEY)) as string | null) || null;

  if (remove && !upload) {
    await setSetting(HOME_IMAGE_KEY, "", user.id);
    await setSetting(HOME_ALT_KEY, "", user.id);
    if (currentUrl) {
      const path = storagePathFromPublicUrl(currentUrl, publicEnv.NEXT_PUBLIC_SUPABASE_URL ?? "", IMAGE_BUCKET);
      if (path) await removeImages(db, [path]);
    }
    await audit(user.id, "settings.change", "organization_settings", undefined, { keys: [HOME_IMAGE_KEY], removed: true });
    revalidatePath("/"); revalidatePath("/admin/settings");
    return { ok: true, message: "Home page photo removed. The placeholder is showing again." };
  }

  const alt = altSchema.safeParse(form.get("hero_alt"));
  if (!upload && !currentUrl) return { error: "Choose a photo to upload." };
  if (!alt.success) return { error: alt.error.issues[0].message };

  let url = currentUrl;
  if (upload) {
    const r = await uploadImageFile(db, upload, "site");
    if ("error" in r) return { error: r.error };
    url = r.url;
    if (currentUrl) {
      const old = storagePathFromPublicUrl(currentUrl, publicEnv.NEXT_PUBLIC_SUPABASE_URL ?? "", IMAGE_BUCKET);
      if (old) await removeImages(db, [old]);
    }
  }
  await setSetting(HOME_IMAGE_KEY, url, user.id);
  await setSetting(HOME_ALT_KEY, alt.data, user.id);
  await audit(user.id, "settings.change", "organization_settings", undefined, { keys: [HOME_IMAGE_KEY, HOME_ALT_KEY] });
  revalidatePath("/"); revalidatePath("/admin/settings");
  return { ok: true, message: upload ? "Home page photo saved." : "Description updated." };
}
