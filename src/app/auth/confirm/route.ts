import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { auditStaffLogin } from "@/lib/auth/login-audit";

const TYPES: EmailOtpType[] = ["invite", "magiclink", "recovery", "signup", "email"];

/**
 * Opens a link Mission Giving emailed itself (staff invitations, Staff → Resend invite): ?token_hash=…&type=…&next=…
 * The token is verified on the server, which signs the person in (session cookie), then they continue to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const raw = searchParams.get("next") ?? "/admin";
  const next = raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") ? raw : "/admin";
  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error && data.user) {
      await auditStaffLogin(data.user.id);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/sign-in?error=link`);
}
