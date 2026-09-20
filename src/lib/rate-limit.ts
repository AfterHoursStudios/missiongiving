/**
 * Minimal in-memory sliding-window limiter.
 * LIMITATION: per server instance only. For production, back this with a shared store
 * (e.g. Upstash Redis via the Vercel Marketplace) or Vercel Firewall rate-limit rules.
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false as const, retryAfterMs: windowMs - (now - recent[0]) };
  }
  recent.push(now);
  hits.set(key, recent);
  return { ok: true as const };
}

export function resetRateLimits() {
  hits.clear();
}
