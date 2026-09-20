"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches server data while a payment is unconfirmed. Stops after ~2 minutes; the webhook remains the source of truth. */
export function AutoRefresh({ everyMs = 4000, maxTicks = 30 }: { everyMs?: number; maxTicks?: number }) {
  const router = useRouter();
  useEffect(() => {
    let ticks = 0;
    const t = setInterval(() => { if (++ticks > maxTicks) clearInterval(t); else router.refresh(); }, everyMs);
    return () => clearInterval(t);
  }, [router, everyMs, maxTicks]);
  return null;
}
