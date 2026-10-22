import "server-only";
import { feature } from "topojson-client";
import { geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import type { Topology, GeometryCollection } from "topojson-specification";
import statesTopo from "us-atlas/states-albers-10m.json";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getOrgSettings, getSetting } from "@/lib/settings";
import { SETTLED_STATUSES } from "@/lib/donations/status";
import { zoned } from "@/lib/admin/metrics";


import { addMonths, buildDashboard, givingByState, GOAL_SETTING, type DashGift } from "./dashboard";
export { GOAL_SETTING };

/** State outlines, already projected (Albers USA, 975 × 610), computed once per server instance. */
let shapes: { name: string; d: string }[] | null = null;
export function stateShapes() {
  if (!shapes) {
    const topo = statesTopo as unknown as Topology<{ states: GeometryCollection<{ name: string }> }>;
    const fc = feature(topo, topo.objects.states) as FeatureCollection<Geometry, { name: string }>;
    const path = geoPath();
    shapes = fc.features.map((f) => ({ name: f.properties.name, d: path(f) ?? "" }));
  }
  return shapes;
}

/**
 * Everything the Dashboard shows. Callers MUST have passed requirePermission("reports.view"). Selects no donor names or
 * emails: only donor ids (to count donors) and their state (for the map).
 */
export async function loadDashboard() {
  const db = createSupabaseAdminClient();
  const settings = await getOrgSettings();
  const [d, donors, fiscal, goal] = await Promise.all([
    db.from("donations").select("donor_id, amount_cents, refunded_cents, settled_at, donated_at")
      .in("status", SETTLED_STATUSES as string[]).is("archived_at", null).limit(200000),
    db.from("donor_profiles").select("id, region").is("deleted_at", null).not("region", "is", null).limit(200000),
    getSetting("fiscal_year_start_month"),
    getSetting(GOAL_SETTING),
  ]);
  if (d.error) throw new Error(d.error.message);
  const ymd = (iso: string) => { const p = zoned(iso, settings.timezone); return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`; };
  const gifts: DashGift[] = (d.data ?? []).map((r) => ({ donorId: r.donor_id, net: r.amount_cents - r.refunded_cents, date: ymd(r.settled_at ?? r.donated_at) }));
  const today = ymd(new Date().toISOString());
  const goalCents = Number(goal) > 0 ? Math.round(Number(goal)) : null;
  const dash = buildDashboard(gifts, { today, fiscalStartMonth: Math.min(12, Math.max(1, Number(fiscal) || 1)), goalCents });

  const region = new Map((donors.data ?? []).map((r) => [r.id as string, r.region as string]));
  const lastYear = addMonths(today, -12);
  const states = givingByState(gifts.filter((g) => g.date > lastYear && g.date <= today), (id) => region.get(id));
  return { dash, states, currency: settings.currency, timezone: settings.timezone };
}
