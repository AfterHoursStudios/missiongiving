import Link from "next/link";
import { SimpleForm, CheckInput, TextInput } from "@/components/donor/forms";
import { saveProject } from "@/lib/admin/project-actions";
import { PROJECT_STATUSES, SUMMARY_MAX } from "@/lib/admin/project-schema";
import { CountedTextarea } from "./counted-textarea";

export interface ProjectValues {
  id?: string; title?: string; slug?: string; summary?: string | null; story_html?: string | null; featured_image_url?: string | null;
  gallery?: string[] | null; location?: string | null; goal_cents?: number | null; start_date?: string | null; end_date?: string | null;
  status?: string; featured?: boolean; is_public?: boolean; allow_custom_amount?: boolean;
  seo_title?: string | null; seo_description?: string | null; share_image_url?: string | null;
  donation_form_template_id?: string | null;
}
const area = "mt-1.5 w-full rounded-md border border-ink-soft bg-white px-3 py-2";
const dateCls = "mt-1.5 min-h-12 w-full rounded-md border border-ink-soft bg-white px-2";

export function ProjectForm({ project, formTemplates = [] }: { project?: ProjectValues; formTemplates?: { id: string; name: string }[] }) {
  // New projects default to Public: visitors still see nothing until the status is Active, Goal reached or Completed.
  const p = project ?? { status: "draft", allow_custom_amount: true, is_public: true };
  return (
    <SimpleForm action={saveProject} submit={project?.id ? "Save project" : "Create project"}>
      {project?.id && <input type="hidden" name="id" value={project.id} />}
      <TextInput label="Title" name="title" defaultValue={p.title} required />
      <TextInput label="URL slug" name="slug" defaultValue={p.slug} hint="Leave blank to generate from the title. Appears as /projects/your-slug." />
      <TextInput label="Location" name="location" defaultValue={p.location} />
      <CountedTextarea id="summary" name="summary" label="Short summary" max={SUMMARY_MAX} rows={4} defaultValue={p.summary ?? ""} hint="Shown on project cards (long text is shortened there) and in link previews." />
      <div><label htmlFor="story" className="block font-semibold">Full story</label>
        <textarea id="story" name="story_html" rows={10} defaultValue={p.story_html ?? ""} className={area + " font-mono text-sm"} />
        <p className="text-sm text-ink-soft">Write it as you want it to look: press Enter twice for a new paragraph, once for a line break, and start lines with &quot;- &quot; for a bulleted list. You can also use basic HTML (p, br, strong, em, h2, h3, ul, ol, li, blockquote, and https links); anything else is removed.</p></div>
      <ImageFields project={p} />
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
      <div><label htmlFor="donation_form_template_id" className="block font-semibold">Donation form</label>
        <select id="donation_form_template_id" name="donation_form_template_id" defaultValue={p.donation_form_template_id ?? ""} className={dateCls}>
          <option value="">Use the default form</option>
          {formTemplates.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <p className="text-sm text-ink-soft">Controls the branding and fields shown when someone donates to this project. Built in <Link className="underline" href="/admin/forms">Donation forms</Link>.</p>
      </div>
      <TextInput label="SEO title (max 70)" name="seo_title" defaultValue={p.seo_title} />
      <TextInput label="SEO description (max 160)" name="seo_description" defaultValue={p.seo_description} />
    </SimpleForm>
  );
}

const fileCls = "mt-1.5 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-teal-800 file:px-4 file:font-semibold file:text-white";

/** Upload-from-computer image fields. Existing images are shown with a Remove option; uploads are re-encoded on the server. */
function ImageFields({ project }: { project: ProjectValues }) {
  const gallery = project.gallery ?? [];
  return (
    <fieldset className="space-y-5">
      <legend className="font-semibold">Images</legend>
      <p className="text-sm text-ink-soft">Choose files from your computer (JPEG, PNG or WebP, up to 8 MB each). Photos are resized to 2000 px and location data is removed automatically.</p>

      <div>
        <label htmlFor="featured_image" className="block font-semibold">Featured image</label>
        {project.featured_image_url && (<div className="mt-2 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={project.featured_image_url} alt="Current featured image" className="h-24 w-36 object-cover" />
          <label className="flex items-center gap-2"><input type="checkbox" name="remove_featured" className="size-5" />Remove</label>
        </div>)}
        <input id="featured_image" name="featured_image" type="file" accept="image/jpeg,image/png,image/webp" className={fileCls} />
        {project.featured_image_url && <p className="text-sm text-ink-soft">Choosing a new file replaces the current one.</p>}
      </div>

      <div>
        <label htmlFor="gallery_files" className="block font-semibold">Gallery images (up to 10)</label>
        {gallery.length > 0 && (<ul className="mt-2 flex flex-wrap gap-4">{gallery.map((url, i) => (
          <li key={url} className="w-36">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Gallery image ${i + 1}`} className="h-24 w-36 object-cover" />
            <label className="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" name="remove_gallery" value={url} className="size-5" />Remove</label>
          </li>))}</ul>)}
        <input id="gallery_files" name="gallery_files" type="file" multiple accept="image/jpeg,image/png,image/webp" className={fileCls} />
        <p className="text-sm text-ink-soft">New files are added to the gallery. Hold Ctrl or Cmd to pick several.</p>
      </div>

      <div>
        <label htmlFor="share_image" className="block font-semibold">Social sharing image (optional)</label>
        {project.share_image_url && (<div className="mt-2 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={project.share_image_url} alt="Current sharing image" className="h-24 w-36 object-cover" />
          <label className="flex items-center gap-2"><input type="checkbox" name="remove_share" className="size-5" />Remove</label>
        </div>)}
        <input id="share_image" name="share_image" type="file" accept="image/jpeg,image/png,image/webp" className={fileCls} />
        <p className="text-sm text-ink-soft">Shown when the project link is shared. If empty, the featured image is used.</p>
      </div>
    </fieldset>
  );
}
