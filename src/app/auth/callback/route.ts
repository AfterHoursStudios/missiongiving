import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { auditStaffLogin } from "@/lib/auth/login-audit";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const requested = searchParams.get("next");
  const raw = requested ?? "/dashboard";
  const next = raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") ? raw : "/dashboard";
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const isStaff = data.user ? await auditStaffLogin(data.user.id) : false; // magic links and invitations count as staff sign-ins too
      return NextResponse.redirect(`${origin}${requested === null && isStaff ? "/admin" : next}`);
    }
  }
  return NextResponse.redirect(`${origin}/sign-in?error=link`);
}
