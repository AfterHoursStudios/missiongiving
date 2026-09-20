import { SimpleForm, CheckInput, TextInput } from "@/components/donor/forms";
import { saveProject } from "@/lib/admin/project-actions";
import { PROJECT_STATUSES } from "@/lib/admin/project-schema";

export interface ProjectValues {
  id?: string; title?: string; slug?: string; summary?: string | null; story_html?: string | null; featured_image_url?: string | null;
  gallery?: string[] | null; location?: string | null; goal_cents?: number | null; start_date?: string | null; end_date?: string | null;
  status?: string; featured?: boolean; is_public?: boolean; allow_custom_amount?: boolean;
  seo_title?: string | null; seo_description?: string | null; share_image_url?: string | null;
}
const area = "mt-1.5 w-full rounded-md border border-ink-soft bg-white px-3 py-2";
const dateCls = "mt-1.5 min-h-12 w-full rounded-md border border-ink-soft bg-white px-2";

export function ProjectForm({ project }: { project?: ProjectValues }) {
  // New projects default to Public: visitors still see nothing until the status is Active, Goal reached or Completed.
  const p = project ?? { status: "draft", allow_custom_amount: true, is_public: true };
  return (
    <SimpleForm action={saveProject} submit={project?.id ? "Save project" : "Create project"}>
      {project?.id && <input type="hidden" name="id" value={project.id} />}
      <TextInput label="Title" name="title" defaultValue={p.title} required />
      <TextInput label="URL slug" name="slug" defaultValue={p.slug} hint="Leave blank to generate from the title. Appears as /projects/your-slug." />
      <TextInput label="Location" name="location" defaultValue={p.location} />
      <div><label htmlFor="summary" className="block font-semibold">Short summary</label>
        <textarea id="summary" name="summary" rows={2} maxLength={300} defaultValue={p.summary ?? ""} className={area} /></div>
      <div><label htmlFor="story" className="block font-semibold">Full story</label>
        <textarea id="story" name="story_html" rows={10} defaultValue={p.story_html ?? ""} className={area + " font-mono text-sm"} />
        <p className="text-sm text-ink-soft">Basic HTML only: p, br, strong, em, h2, h3, ul, ol, li, blockquote, and https links. Anything else is removed on save.</p></div>
      <TextInput label="Featured image URL (https)" name="featured_image_url" defaultValue={p.featured_image_url} />
      <div><label htmlFor="gallery" className="block font-semibold">Gallery image URLs (one per line, up to 10)</label>
        <textarea id="gallery" name="gallery" rows={3} defaultValue={(p.gallery ?? []).join("\n")} className={area} /></div>
      <TextInput label="Social sharing image URL (https)" name="share_image_url" defaultValue={p.share_image_url} />
      <TextInput label="Fundraising goal (USD)" name="goal" defaultValue={p.goal_cents ? (p.goal_cents / 100).toFixed(2) : ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="start" className="block font-semibold">Start date</label><input id="start" type="date" name="start_date" defaultValue={p.start_date ?? ""} className={dateCls} /></div>
        <div><label htmlFor="end" className="block font-semibold">End date</label><input id="end" type="date" name="end_date" defaultValue={p.end_date ?? ""} className={dateCls} /></div>
      </div>
      <div><label htmlFor="status" className="block font-semibold">Status</label>
        <select id="status" name="status" defaultValue={p.status} className={dateCls}>{PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select></div>
      <CheckInput label="Public: show on the website and in the donate flow (also requires Active, Goal reached or Completed status)" name="is_public" defaultChecked={p.is_public} />
      <CheckInput label="Featured on the home page" name="featured" defaultChecked={p.featured} />
      <CheckInput label="Allow custom donation amounts" name="allow_custom_amount" defaultChecked={p.allow_custom_amount} />
      <TextInput label="SEO title (max 70)" name="seo_title" defaultValue={p.seo_title} />
      <TextInput label="SEO description (max 160)" name="seo_description" defaultValue={p.seo_description} />
    </SimpleForm>
  );
}
