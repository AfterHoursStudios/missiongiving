"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, FileSpreadsheet, FileText, Play, Plus, Printer, Save, Trash2, X } from "lucide-react";
import { deleteBuilderReport, runBuilderReport, saveBuilderReport, type RunResult } from "@/lib/reports/builder/actions";
import { displayValue } from "@/lib/reports/builder/engine";
import { OPERATORS, SOURCES, defaultDefinition, fieldOf, type FieldDef, type ReportDefinition, type ReportFilter, type SourceKey } from "@/lib/reports/builder/fields";

const input = "min-h-11 rounded-md border border-ink-soft/60 bg-white px-2";
const step = "min-w-0 rounded-xl border border-line bg-white p-4 shadow-sm sm:p-5";
const btn = "inline-flex min-h-11 items-center gap-2 rounded-md px-4 font-semibold disabled:opacity-60";
const iconBtn = "inline-flex size-9 items-center justify-center rounded-md text-ink-soft hover:bg-paper-2 hover:text-ink disabled:opacity-30";

export interface SavedReport { id: string; name: string; shared: boolean; mine: boolean; definition: ReportDefinition }

/** base64url of UTF-8 JSON, for the export link. */
const encodeDef = (def: ReportDefinition) => {
  const bytes = new TextEncoder().encode(JSON.stringify(def));
  let bin = ""; bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/**
 * Reports → Report builder (modeled on DonorPerfect's): pick a report type, the columns, filters, sorting and grouping;
 * run it to see the rows with totals; export to CSV or Excel; save it (privately or shared with all staff) to run again.
 */
export function ReportBuilder({ saved, initial, canViewDonors }: { saved: SavedReport[]; initial: SavedReport | null; canViewDonors: boolean }) {
  const router = useRouter();
  const [def, setDef] = useState<ReportDefinition>(initial?.definition ?? defaultDefinition("gifts"));
  const [name, setName] = useState(initial?.name ?? "");
  const [shared, setShared] = useState(initial?.shared ?? false);
  const [reportId, setReportId] = useState<string | null>(initial?.mine ? initial.id : null);
  const [run, setRun] = useState<RunResult | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [running, startRun] = useTransition();
  const [saving, startSave] = useTransition();

  const fields = useMemo(() => (SOURCES[def.source].fields as FieldDef[]).filter((f) => canViewDonors || !f.pii), [def.source, canViewDonors]);
  const groups = useMemo(() => [...new Set(fields.map((f) => f.group))], [fields]);
  const label = (key: string) => fieldOf(def.source, key)?.label ?? key;
  const update = (patch: Partial<ReportDefinition>) => { setDef((d) => ({ ...d, ...patch })); setNotice(null); };

  const toggleColumn = (key: string) => update({ columns: def.columns.includes(key) ? def.columns.filter((c) => c !== key) : [...def.columns, key] });
  const moveColumn = (i: number, by: number) => { const c = [...def.columns]; [c[i], c[i + by]] = [c[i + by], c[i]]; update({ columns: c }); };
  const setFilter = (i: number, patch: Partial<ReportFilter>) => update({ filters: def.filters.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const addFilter = () => { const f = fields[0]; update({ filters: [...def.filters, { field: f.key, op: OPERATORS[f.type][0].value }] }); };
  const setSort = (i: number, field: string, dir: "asc" | "desc") => {
    const s = [...def.sort];
    if (!field) s.splice(i); else s[i] = { field, dir };
    update({ sort: s.filter(Boolean) });
  };

  function chooseSource(source: SourceKey) {
    if (source === def.source) return;
    setDef(defaultDefinition(source)); setRun(null); setReportId(null); setName(""); setShared(false); setNotice(null);
  }
  const doRun = () => startRun(async () => { setNotice(null); setRun(await runBuilderReport(def)); });
  const doSave = (asNew: boolean) => startSave(async () => {
    const r = await saveBuilderReport({ id: asNew ? undefined : reportId ?? undefined, name, shared, definition: def });
    if (!r.ok) return setNotice({ ok: false, text: r.error });
    setReportId(r.id); setNotice({ ok: true, text: r.message });
    router.replace(`/admin/reports/builder?report=${r.id}`, { scroll: false });
  });
  const exportHref = (format: "csv" | "xlsx") => `/admin/reports/builder/export?format=${format}&name=${encodeURIComponent(name || `${SOURCES[def.source].label} report`)}&def=${encodeDef(def)}`;

  return (
    <div className="min-w-0 space-y-5">
      <SavedList saved={saved} currentId={initial?.id ?? null} />

      <section aria-labelledby="b-type" className={step}>
        <h2 id="b-type" className="text-lg font-semibold">1. Report type</h2>
        <div role="radiogroup" aria-labelledby="b-type" className="mt-3 grid gap-3 sm:grid-cols-2">
          {(Object.keys(SOURCES) as SourceKey[]).map((k) => (
            <label key={k} className={`flex min-h-11 cursor-pointer gap-3 rounded-lg border-2 p-3 ${def.source === k ? "border-teal-800 bg-paper-2" : "border-line"}`}>
              <input type="radio" name="source" checked={def.source === k} onChange={() => chooseSource(k)} className="mt-1 size-4" />
              <span><span className="block font-semibold">{SOURCES[k].label}</span><span className="text-sm text-ink-soft">{SOURCES[k].hint}</span></span>
            </label>
          ))}
        </div>
      </section>

      <section aria-labelledby="b-cols" className={step}>
        <h2 id="b-cols" className="text-lg font-semibold">2. Columns</h2>
        <p className="text-sm text-ink-soft">Tick the fields to show. Use the arrows to change their order.</p>
        <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="max-h-80 overflow-y-auto rounded-md border border-line p-3">
            {groups.map((g) => (
              <fieldset key={g} className="mb-3 last:mb-0">
                <legend className="text-sm font-semibold uppercase tracking-wide text-ink-soft">{g}</legend>
                {fields.filter((f) => f.group === g).map((f) => (
                  <label key={f.key} className="flex min-h-9 cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={def.columns.includes(f.key)} onChange={() => toggleColumn(f.key)} className="size-4" />{f.label}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          <div className="rounded-md border border-line p-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Report columns, in order</p>
            {def.columns.length === 0 ? <p className="mt-2 text-ink-soft">No columns chosen yet.</p> : (
              <ol className="mt-1">{def.columns.map((c, i) => (
                <li key={c} className="flex items-center gap-1 border-b border-line py-0.5 last:border-0">
                  <span className="flex-1">{i + 1}. {label(c)}</span>
                  <button type="button" className={iconBtn} disabled={i === 0} onClick={() => moveColumn(i, -1)} aria-label={`Move ${label(c)} up`}><ArrowUp size={16} aria-hidden="true" /></button>
                  <button type="button" className={iconBtn} disabled={i === def.columns.length - 1} onClick={() => moveColumn(i, 1)} aria-label={`Move ${label(c)} down`}><ArrowDown size={16} aria-hidden="true" /></button>
                  <button type="button" className={iconBtn} onClick={() => toggleColumn(c)} aria-label={`Remove ${label(c)}`}><X size={16} aria-hidden="true" /></button>
                </li>
              ))}</ol>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="b-filters" className={step}>
        <h2 id="b-filters" className="text-lg font-semibold">3. Filters</h2>
        <p className="text-sm text-ink-soft">Only rows that match every filter are included.</p>
        <ul className="mt-3 space-y-2">
          {def.filters.map((f, i) => <FilterRow key={i} index={i} filter={f} fields={fields} onChange={(p) => setFilter(i, p)} onRemove={() => update({ filters: def.filters.filter((_, j) => j !== i) })} />)}
        </ul>
        <button type="button" onClick={addFilter} disabled={def.filters.length >= 15} className={`${btn} mt-3 border-2 border-teal-800 text-teal-800 hover:bg-paper-2`}><Plus size={18} aria-hidden="true" />Add filter</button>
      </section>

      <section aria-labelledby="b-sort" className={step}>
        <h2 id="b-sort" className="text-lg font-semibold">4. Sort and group</h2>
        <p className="text-sm text-ink-soft">Ascending is A to Z, lowest first, or oldest first; descending is the reverse.</p>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {[0, 1].map((i) => (i === 0 || def.sort[0]) && (
            <div key={i} className="min-w-0">
              <label htmlFor={`sort-${i}`} className="block font-semibold">{i === 0 ? "Sort by" : "Then by"}</label>
              <div className="mt-1.5 flex gap-2">
                <select id={`sort-${i}`} className={`${input} min-w-0 flex-1`} value={def.sort[i]?.field ?? ""} onChange={(e) => setSort(i, e.target.value, def.sort[i]?.dir ?? "asc")}>
                  <option value="">{i === 0 ? "No sorting" : "Nothing else"}</option>
                  {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <select aria-label={`${i === 0 ? "Sort" : "Then"} direction`} className={input} value={def.sort[i]?.dir ?? "asc"} disabled={!def.sort[i]} onChange={(e) => setSort(i, def.sort[i]!.field, e.target.value as "asc" | "desc")}>
                  <option value="asc">Ascending</option><option value="desc">Descending</option>
                </select>
              </div>
            </div>
          ))}
          <div className="min-w-0">
            <label htmlFor="group-by" className="block font-semibold">Group by</label>
            <select id="group-by" className={`${input} mt-1.5 w-full`} value={def.groupBy ?? ""} onChange={(e) => update({ groupBy: e.target.value || null, summaryOnly: e.target.value ? def.summaryOnly : false })}>
              <option value="">No grouping</option>
              {fields.filter((f) => f.type !== "money" && f.type !== "number").map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            {def.groupBy && (
              <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2">
                <input type="checkbox" checked={def.summaryOnly} onChange={(e) => update({ summaryOnly: e.target.checked })} className="size-4" />Show group totals only
              </label>
            )}
          </div>
        </div>
      </section>

      <div className="no-print sticky bottom-0 z-10 -mx-1 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white/95 p-3 shadow-md backdrop-blur">
        <button type="button" onClick={doRun} disabled={running || def.columns.length === 0} className={`${btn} bg-teal-800 text-white hover:bg-teal-800/90`}><Play size={18} aria-hidden="true" />{running ? "Running…" : "Run report"}</button>
        <a href={exportHref("csv")} aria-disabled={def.columns.length === 0} className={`${btn} border-2 border-teal-800 text-teal-800 hover:bg-paper-2`}><FileText size={18} aria-hidden="true" />CSV</a>
        <a href={exportHref("xlsx")} aria-disabled={def.columns.length === 0} className={`${btn} border-2 border-teal-800 text-teal-800 hover:bg-paper-2`}><FileSpreadsheet size={18} aria-hidden="true" />Excel</a>
        <button type="button" onClick={() => window.print()} disabled={!run?.ok} className={`${btn} border-2 border-teal-800 text-teal-800 hover:bg-paper-2`}><Printer size={18} aria-hidden="true" />Print</button>
        <span className="mx-1 hidden h-8 w-px bg-line sm:block" aria-hidden="true" />
        <div><label htmlFor="report-name" className="block text-sm font-semibold">Report name</label>
          <input id="report-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gifts over $1,000 this year" className={`${input} w-64`} /></div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="size-4" />Share with all staff</label>
        <button type="button" onClick={() => doSave(false)} disabled={saving || !name.trim()} className={`${btn} bg-teal-800 text-white hover:bg-teal-800/90`}><Save size={18} aria-hidden="true" />{saving ? "Saving…" : reportId ? "Save" : "Save report"}</button>
        {reportId && <button type="button" onClick={() => doSave(true)} disabled={saving || !name.trim()} className={`${btn} border-2 border-teal-800 text-teal-800 hover:bg-paper-2`}>Save as new</button>}
        <p role="status" aria-live="polite" className="w-full text-sm">{notice && <span className={notice.ok ? "text-success" : "text-danger"}>{notice.text}</span>}</p>
      </div>

      <Results run={run} source={def.source} groupLabel={def.groupBy ? label(def.groupBy) : null} title={name || `${SOURCES[def.source].label} report`} />
    </div>
  );
}

function FilterRow({ index, filter, fields, onChange, onRemove }: {
  index: number; filter: ReportFilter; fields: FieldDef[]; onChange: (p: Partial<ReportFilter>) => void; onRemove: () => void;
}) {
  const field = fields.find((f) => f.key === filter.field) ?? fields[0];
  const ops = OPERATORS[field.type];
  const op = ops.find((o) => o.value === filter.op) ?? ops[0];
  const kind = field.type === "date" ? (op.value === "last_days" ? "number" : "date") : field.type === "money" || field.type === "number" ? "number" : "text";
  const id = `f${index}`;
  return (
    <li className="flex flex-wrap items-start gap-2 rounded-md bg-paper-2 p-2">
      <select aria-label={`Filter ${index + 1} field`} className={`${input} min-w-44`} value={field.key}
        onChange={(e) => { const nf = fields.find((f) => f.key === e.target.value)!; onChange({ field: nf.key, op: OPERATORS[nf.type][0].value, value: undefined, value2: undefined, values: undefined }); }}>
        {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
      <select aria-label={`Filter ${index + 1} condition`} className={input} value={op.value} onChange={(e) => onChange({ op: e.target.value })}>
        {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {(op.needs === "one" || op.needs === "two") && (
        <span className="inline-flex items-center gap-2">
          {field.type === "money" && <span aria-hidden="true">$</span>}
          <input id={`${id}-a`} aria-label={`Filter ${index + 1} value`} type={kind === "date" ? "date" : "text"} inputMode={kind === "number" ? "decimal" : undefined}
            value={filter.value ?? ""} onChange={(e) => onChange({ value: e.target.value })} className={`${input} w-40`} />
          {op.value === "last_days" && <span>days</span>}
          {op.needs === "two" && <>
            <span>and</span>
            <input aria-label={`Filter ${index + 1} second value`} type={kind === "date" ? "date" : "text"} inputMode={kind === "number" ? "decimal" : undefined}
              value={filter.value2 ?? ""} onChange={(e) => onChange({ value2: e.target.value })} className={`${input} w-40`} />
          </>}
        </span>
      )}
      {op.needs === "many" && (
        <fieldset className="flex flex-wrap gap-x-4">
          <legend className="sr-only">Filter {index + 1} values</legend>
          {field.options?.map((o) => (
            <label key={o.value} className="flex min-h-11 cursor-pointer items-center gap-1.5">
              <input type="checkbox" className="size-4" checked={filter.values?.includes(o.value) ?? false}
                onChange={(e) => onChange({ values: e.target.checked ? [...(filter.values ?? []), o.value] : (filter.values ?? []).filter((v) => v !== o.value) })} />{o.label}
            </label>
          ))}
        </fieldset>
      )}
      <button type="button" onClick={onRemove} className={`${iconBtn} ml-auto size-11`} aria-label={`Remove filter ${index + 1}`}><Trash2 size={18} aria-hidden="true" /></button>
    </li>
  );
}

function Results({ run, source, groupLabel, title }: { run: RunResult | null; source: SourceKey; groupLabel: string | null; title: string }) {
  if (!run) return <p className="rounded-xl border border-dashed border-line p-8 text-center text-ink-soft">Choose your columns and filters, then select <strong>Run report</strong>.</p>;
  if (!run.ok) return <p role="alert" className="rounded-md bg-danger-bg p-3 text-danger">{run.error}</p>;
  const { result: r, removed } = run;
  const fields = r.columns.map((c) => fieldOf(source, c.key)!);
  const right = (i: number) => (fields[i].type === "money" || fields[i].type === "number" ? "text-right tabular-nums" : "");
  const cell = "border-b border-line px-3 py-2";
  const totals = (label: string, count: number, t: (number | null)[], strong: boolean) => (
    <tr className={strong ? "bg-paper-2 font-bold" : "font-semibold"}>
      {fields.map((f, i) => <td key={f.key} className={`${cell} ${right(i)}`}>{t[i] !== null ? displayValue(f, t[i]) : i === 0 ? `${label} (${count.toLocaleString("en-US")})` : ""}</td>)}
    </tr>
  );
  return (
    <section aria-labelledby="results-h" className={step}>
      <h2 id="results-h" className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-ink-soft">{r.count.toLocaleString("en-US")} {r.count === 1 ? "row" : "rows"}{r.truncated ? " · showing the first 1,000 here; CSV and Excel include every row" : ""}</p>
      {removed.length > 0 && <p className="mt-2 rounded-md bg-warning-bg p-2 text-sm text-warning">Left out (your role can&apos;t see donor personal details): {removed.join(", ")}.</p>}
      {r.count === 0 ? <p className="mt-4 text-ink-soft">No rows match these filters.</p> : (
        <div className="mt-3 max-h-[70vh] overflow-auto rounded-md border border-line">
          <table className="w-full min-w-max text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-white"><tr>{r.columns.map((c, i) => <th key={c.key} scope="col" className={`border-b-2 border-ink px-3 py-2 ${right(i)}`}>{c.label}</th>)}</tr></thead>
            <tbody>
              {r.sections.map((s, si) => (
                <Fragment key={si}>
                  {s.label !== null && <tr><th colSpan={fields.length} scope="rowgroup" className="border-b border-line bg-teal-800/5 px-3 py-2 text-left">{groupLabel}: {s.label}</th></tr>}
                  {s.rows.map((row, ri) => <tr key={ri} className="hover:bg-paper-2">{row.map((v, i) => <td key={i} className={`${cell} ${right(i)}`}>{displayValue(fields[i], v)}</td>)}</tr>)}
                  {s.label !== null && totals(`Subtotal ${s.label}`, s.count, s.totals, false)}
                </Fragment>
              ))}
              {totals("Total", r.count, r.totals, true)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SavedList({ saved, currentId }: { saved: SavedReport[]; currentId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  if (saved.length === 0) return null;
  return (
    <section aria-labelledby="saved-h" className={step}>
      <h2 id="saved-h" className="text-lg font-semibold">Saved reports</h2>
      <ul className="mt-2 divide-y divide-line">
        {saved.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-x-3 py-1.5">
            <a href={`/admin/reports/builder?report=${s.id}`} aria-current={s.id === currentId ? "page" : undefined} className={`min-h-11 flex-1 py-2.5 font-semibold text-teal-600 hover:underline ${s.id === currentId ? "underline" : ""}`}>{s.name}</a>
            <span className="text-sm text-ink-soft">{SOURCES[s.definition.source]?.label}{s.shared ? " · shared" : ""}{s.mine ? "" : " · shared by a colleague"}</span>
            {s.mine && confirming !== s.id && (
              <button type="button" aria-label={`Delete ${s.name}`} className={`${iconBtn} size-11`} onClick={() => setConfirming(s.id)}><Trash2 size={18} aria-hidden="true" /></button>
            )}
            {s.mine && confirming === s.id && (<span className="inline-flex items-center gap-2 text-sm">Delete this report?
              <button type="button" disabled={pending} className="min-h-11 rounded-md bg-danger px-3 font-semibold text-white disabled:opacity-60"
                onClick={() => start(async () => {
                  const r = await deleteBuilderReport(s.id);
                  if (!r.ok) return setError(r.error ?? "Could not delete.");
                  router.replace(s.id === currentId ? "/admin/reports/builder" : `/admin/reports/builder${currentId ? `?report=${currentId}` : ""}`);
                  router.refresh();
                })}>Delete</button>
              <button type="button" onClick={() => setConfirming(null)} className="min-h-11 px-2 font-semibold text-teal-600 hover:underline">Cancel</button>
            </span>)}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </section>
  );
}
