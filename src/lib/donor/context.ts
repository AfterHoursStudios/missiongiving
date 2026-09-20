import "server-only";
import { cache } from "react";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The signed-in donor and a user-scoped Supabase client. Every query made through `supabase` is filtered by
 * Row Level Security to this donor's own rows, so a forged id in a URL or form can never return someone else's data.
 */
export const getDonorContext = cache(async () => {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: donor } = await supabase
    .from("donor_profiles")
    .select("id, first_name, last_name, email, phone, address_line1, address_line2, city, region, postal_code, public_recognition, stripe_customer_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  return { user, supabase, donor };
});
