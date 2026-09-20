"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { auditStaffLogin } from "./login-audit";

export type FormState = { error?: string; message?: string } | undefined;

const password = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(128)
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/\d/, "Include a number");

const registerSchema = z.object({
  first_name: z.string().trim().min(1, "Enter your first name").max(80),
  last_name: z.string().trim().min(1, "Enter your last name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password,
});

async function clientKey(scope: string, email?: string) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return `${scope}:${ip}:${email ?? ""}`;
}

/** Only allow same-site relative redirects (prevents open redirects). */
function safeNext(next: unknown, fallback = "/dashboard") {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : fallback;
}

export async function registerAction(_: FormState, form: FormData): Promise<FormState> {
  // Honeypot: bots fill hidden fields. Add Turnstile/hCaptcha before launch (see README).
  if (form.get("website")) return { message: "Check your email to verify your account." };
  const parsed = registerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const rl = rateLimit(await clientKey("register"), 5, 60 * 60_000);
  if (!rl.ok) return { error: "Too many attempts. Please try again later." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard`,
      data: { first_name: parsed.data.first_name, last_name: parsed.data.last_name },
    },
  });
  // Same message either way: do not reveal whether an email is already registered.
  if (error && !/registered|already/i.test(error.message)) return { error: "We could not create your account. Please try again." };
  return { message: "Check your email to verify your account." };
}

export async function signInAction(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const pw = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  const rl = rateLimit(await clientKey("signin", email), 8, 15 * 60_000);
  if (!rl.ok) return { error: "Too many sign-in attempts. Please wait a few minutes." };
  if (!email || !pw) return { error: "Enter your email and password." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
  if (error) return { error: "Email or password is incorrect, or your email is not yet verified." };
  await auditStaffLogin(data.user.id);
  redirect(next);
}

export async function magicLinkAction(_: FormState, form: FormData): Promise<FormState> {
  const email = z.string().email().safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { error: "Enter a valid email." };
  const rl = rateLimit(await clientKey("magic", email.data), 3, 15 * 60_000);
  if (!rl.ok) return { error: "Too many requests. Please try again later." };
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signInWithOtp({
    email: email.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback` },
  });
  return { message: "If an account exists, a sign-in link is on its way." };
}

export async function resetPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const email = z.string().email().safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { error: "Enter a valid email." };
  const rl = rateLimit(await clientKey("reset", email.data), 3, 60 * 60_000);
  if (!rl.ok) return { error: "Too many requests. Please try again later." };
  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard/profile`,
  });
  return { message: "If an account exists, a reset link is on its way." };
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
