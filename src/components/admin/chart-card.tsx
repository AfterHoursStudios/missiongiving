"use client";

import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Table } from "@/lib/admin/metrics";

// Distinct hues plus differing luminance so series remain distinguishable without color perception.
const COLORS = ["#124848", "#c04f28", "#6b4fbb", "#8a6d00", "#2f7d3c", "#a3221a"];

interface Props { id: string; title: string; description: string; table: Table; csvHref: string }

const isMoney = (col: string) => col.includes("($)");
const fmt = (col: string, v: string | number) => (typeof v === "number" && isMoney(col) ? v.toLocaleString("en-US", { style: "currency", currency: "USD" }) : v);

export function ChartCard({ id, title, description, table, csvHref }: Props) {
  const { columns, rows, kind } = table;
  const data = rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
  const allSeries = columns.slice(1);
  // Never plot counts and dollars on one axis: prefer the money columns when present.
  const series = allSeries.some(isMoney) ? allSeries.filter(isMoney) : allSeries;
  const summary = rows.length === 0 ? "No data for the selected dates." : `${title}. ${rows.length} rows. See the data table below the chart.`;

  return (
    <section aria-labelledby={`${id}-h`} className="border-t border-line pt-6 print:break-inside-avoid">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`${id}-h`} className="text-xl font-semibold">{title}</h3>
        <a href={csvHref} className="min-h-11 py-2 text-sm font-semibold underline no-print" download>
          Download CSV<span className="sr-only">: {title}</span>
        </a>
      </div>
      <p className="text-sm text-ink-soft">{description}</p>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-md bg-paper-2 p-4 text-ink-soft">No data for the selected dates.</p>
      ) : kind === "progress" ? (
        <ul className="mt-4 space-y-4">
          {rows.map((r) => (
            <li key={String(r[0])}>
              <div className="flex justify-between text-sm"><span className="font-semibold">{r[0]}</span><span>{fmt(columns[1], r[1])} of {fmt(columns[2], r[2])} ({r[3]}%)</span></div>
              <div role="progressbar" aria-label={`${r[0]} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(r[3])} className="mt-1 h-3 bg-paper-2">
                <div className="h-3 bg-teal-800" style={{ width: `${Math.min(100, Number(r[3]))}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div role="img" aria-label={summary} className="mt-4 h-72 w-full">
          <ResponsiveContainer>
            {kind === "line" ? (
              <LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey={columns[0]} /><YAxis /><Tooltip /><Legend />
                {(allSeries.includes("Retention (%)") ? ["Retention (%)"] : [series[0]]).map((s, i) => <Line key={s} type="monotone" dataKey={s} stroke={COLORS[i]} strokeWidth={3} dot />)}</LineChart>
            ) : kind === "pie" ? (
              <PieChart><Tooltip /><Legend />
                <Pie data={data} dataKey={columns[1]} nameKey={columns[0]} outerRadius={100} label>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie></PieChart>
            ) : (
              <BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey={columns[0]} /><YAxis /><Tooltip /><Legend />
                {series.map((s, i) => <Bar key={s} dataKey={s} fill={COLORS[i % COLORS.length]} />)}</BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {rows.length > 0 && (
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold underline no-print">View as table</summary>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{title}</caption>
              <thead><tr className="border-b-2 border-ink">{columns.map((c) => <th key={c} scope="col" className="py-1.5 pr-4">{c}</th>)}</tr></thead>
              <tbody>{rows.map((r, i) => (
                <tr key={i} className="border-b border-line">{r.map((v, j) => <td key={j} className="py-1.5 pr-4">{fmt(columns[j], v)}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
