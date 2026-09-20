import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

// Project URLs are added in Phase 4 once projects are database-backed.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicEnv.NEXT_PUBLIC_APP_URL;
  return ["", "/donate", "/projects", "/about"].map((p) => ({ url: `${base}${p}` }));
}
