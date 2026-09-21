"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { publicEnv } from "@/lib/env";
import { storagePathFromPublicUrl } from "./image-upload";
import { IMAGE_BUCKET, removeImages, uploadImageFile } from "./project-images";
import { sponsorshipSchema, sponsorshipSlug, sponsorshipToRow } from "./sponsorship-schema";
import type { AdminState } from "./donor-actions";

const oldPath = (url: string | null) => (url ? storagePathFromPublicUrl(url, publicEnv.NEXT_PUBLIC_SUPABASE_URL ?? "", IMAGE_BUCKET) : null);

/**
 * Creates or updates a sponsorship. A new one also gets its own restricted fund and a hidden backing project, so every gift is
 * recorded, receipted and reported under her name like any other designated gift. The amount is stored here and applied by the server.
 */
export async function saveSponsorship(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("projects.manage");
  const parsed = sponsorshipSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const row = sponsorshipToRow(parsed.data);
  const db = createSupabaseAdminClient();
  const id = form.get("id");
  const editingId = typeof id === "string" && id ? id : null;
  if (editingId && !z.string().uuid().safeParse(editingId).success) return { error: "Sponsorship not found." };

  const existing = editingId ? (await db.from("sponsorships").select("id, photo_url, project_id").eq("id", editingId).maybeSingle()).data : null;
  if (editingId && !existing) return { error: "Sponsorship not found." };

  let photo_url: string | null = existing?.photo_url ?? null;
  const toDelete: string[] = [];
  const file = form.get("photo");
  if (file instanceof File && file.size > 0) {
    const r = await uploadImageFile(db, file, "sponsors");
    if ("error" in r) return { error: r.error };
    const old = oldPath(photo_url); if (old) toDelete.push(old);
    photo_url = r.url;
  } else if (form.get("remove_photo") === "on") {
    const old = oldPath(photo_url); if (old) toDelete.push(old);
    photo_url = null;
  }

  if (existing) {
    const { error } = await db.from("sponsorships").update({ ...row, photo_url }).eq("id", existing.id);
    if (error) return { error: "Could not save the sponsorship." };
    await db.from("projects").update({ title: `Sponsor: ${row.name}` }).eq("id", existing.project_id);
    await removeImages(db, toDelete);
    await audit(user.id, "sponsorship.change", "sponsorship", existing.id, { op: "update", amount_cents: row.monthly_amount_cents, status: row.status });
    revalidatePath("/admin/sponsorships"); revalidatePath("/sponsor");
    return { ok: true, message: "Saved." };
  }

  const slug = sponsorshipSlug(row.name, randomBytes(2).toString("hex"));
  const { data: fund, error: fundErr } = await db.from("funds").insert({ key: `sponsor-${slug}`, name: `Sponsor: ${row.name}`, restriction: "restricted" }).select("id").single();
  if (fundErr || !fund) return { error: "Could not create her fund." };
  const { data: project, error: projErr } = await db.from("projects")
    .insert({ slug: `sponsor-${slug}`, title: `Sponsor: ${row.name}`, kind: "sponsorship", status: "active", is_public: false, fund_id: fund.id, created_by: user.id })
    .select("id").single();
  if (projErr || !project) { await db.from("funds").delete().eq("id", fund.id); return { error: "Could not create the sponsorship. Has migration 0010 been applied?" }; }
  const { data: created, error } = await db.from("sponsorships").insert({ ...row, slug, photo_url, project_id: project.id }).select("id").single();
  if (error || !created) {
    await db.from("projects").delete().eq("id", project.id); await db.from("funds").delete().eq("id", fund.id);
    return { error: "Could not create the sponsorship." };
  }
  await audit(user.id, "sponsorship.change", "sponsorship", created.id, { op: "create", amount_cents: row.monthly_amount_cents });
  revalidatePath("/admin/sponsorships"); revalidatePath("/sponsor");
  redirect("/admin/sponsorships");
}
