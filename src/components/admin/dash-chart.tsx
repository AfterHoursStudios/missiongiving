"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, Rectangle, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Validated categorical slots (dataviz reference palette, light surface): always assigned in this order. */
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"] as const;
const INK_SOFT = "#52514e", GRID = "#e6e5e1";

export type ValueFormat = "money" | "percent" | "count";
/** `slot` is the series' fixed color (SERIES_COLORS index), so an entity keeps its color on every chart. */
export interface Series { key: string; label: string; slot: 0 | 1 | 2 }

const fmt = (v: unknown, f: ValueFormat, compact = false): string => {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  if (f === "percent") return `${v}%`;
  if (f === "count") return v.toLocaleString("en-US");
  const dollars = v / 100;
  return compact && Math.abs(dollars) >= 1000
    ? `$${(dollars / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`
    : dollars.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: compact ? 0 : 2 });
};

/**
 * One dashboard chart: a line chart (change over time) or grouped bars (comparing amounts), with hover tooltips, a
 * legend, and the same numbers as a table. Values are cents for "money", so the table and tooltip format them.
 */
export function DashChart({ kind, title, data, xKey, series, format, yLabel }: {
  kind: "line" | "bar"; title: string; data: Record<string, string | number | null>[]; xKey: string; series: Series[]; format: ValueFormat; yLabel?: string;
}) {
  const axis = { tick: { fill: INK_SOFT, fontSize: 12 }, axisLine: { stroke: GRID }, tickLine: false } as const;
  const tooltip = (
    <Tooltip
      formatter={(v, name) => [fmt(v, format), name]}
      contentStyle={{ borderRadius: 8, borderColor: GRID, fontSize: 13 }}
      cursor={kind === "line" ? { stroke: INK_SOFT, strokeDasharray: "3 3" } : { fill: "rgba(0,0,0,0.04)" }}
    />
  );
  const legend = series.length > 1 ? <Legend iconType={kind === "line" ? "plainline" : "square"} wrapperStyle={{ fontSize: 13, color: INK_SOFT }} /> : null;
  const yAxis = <YAxis {...axis} width={64} tickFormatter={(v) => fmt(v, format, true)} label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", fill: INK_SOFT, fontSize: 12 } : undefined} />;
  const empty = data.every((row) => series.every((s) => !row[s.key]));

  return (
    <>
      {empty ? (
        <p className="mt-3 rounded-md bg-paper-2 p-6 text-center text-ink-soft">No gifts in this period yet.</p>
      ) : (
        <div role="img" aria-label={`${title}. The same numbers are in the table below the chart.`} className="mt-3 h-64 w-full">
          <ResponsiveContainer>
            {kind === "line" ? (
              <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey={xKey} {...axis} interval="preserveStartEnd" />
                {yAxis}{tooltip}{legend}
                {series.map((s) => (
                  // Straight segments: a smoothed curve would bulge past the real monthly values.
                  <Line key={s.key} dataKey={s.key} name={s.label} type="linear" stroke={SERIES_COLORS[s.slot]} strokeWidth={2} connectNulls
                    dot={{ r: 4, fill: SERIES_COLORS[s.slot], stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
                ))}
              </LineChart>
            ) : (
              <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barGap={2} barCategoryGap="20%">
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey={xKey} {...axis} />
                {yAxis}{tooltip}{legend}
                <ReferenceLine y={0} stroke={INK_SOFT} />
                {series.map((s) => (
                  // Rounded at the data end: the top of a positive bar, the bottom of a negative one.
                  <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES_COLORS[s.slot]} maxBarSize={28}
                    shape={(p: { value?: number | number[] }) => <Rectangle {...(p as object)} radius={(Array.isArray(p.value) ? p.value[1] : p.value ?? 0) < 0 ? [0, 0, 4, 4] : [4, 4, 0, 0]} />} />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
      <details className="mt-2">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-teal-600 underline">View as table</summary>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead><tr className="border-b-2 border-ink"><th scope="col" className="py-1.5 pr-4">{xKey === "month" ? "Month" : "Status"}</th>
              {series.map((s) => <th key={s.key} scope="col" className="py-1.5 pr-4 text-right">{s.label}</th>)}</tr></thead>
            <tbody>{data.map((row, i) => (
              <tr key={i} className="border-b border-line"><th scope="row" className="py-1.5 pr-4 font-normal">{String(row[xKey])}</th>
                {series.map((s) => <td key={s.key} className="py-1.5 pr-4 text-right tabular-nums">{fmt(row[s.key], format)}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </>
  );
}
