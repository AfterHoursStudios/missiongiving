import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv, serverEnv } from "@/lib/env";
import { SESSION_COOKIE_OPTIONS } from "./cookie-options";

/** Per-request client acting as the signed-in user. RLS applies. */
export async function createSupabaseServerClient() {
  const store = await cookies();
  return createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL!,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: SESSION_COOKIE_OPTIONS,
      cookies: {
        getAll: () => store.getAll(),
        setAll(list) {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Called from a Server Component; proxy.ts refreshes the session.
          }
        },
      },
    },
  );
}

/** Bypasses RLS. Server-only; never import from client components. */
// Rows are untyped until `supabase gen types` output is added; validate at boundaries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSupabaseAdminClient(): SupabaseClient<any, "public", any> {
  const key = serverEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
