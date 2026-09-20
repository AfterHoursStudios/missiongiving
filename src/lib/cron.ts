import "server-only";
import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

/** Scheduled endpoints require `Authorization: Bearer $CRON_SECRET` (16+ chars), compared in constant time. */
export function isAuthorizedCron(request: Request): boolean {
  const secret = serverEnv().CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
