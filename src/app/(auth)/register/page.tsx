import Link from "next/link";
import { AuthForm, Field } from "@/components/ui/form";
import { registerAction } from "@/lib/auth/actions";

export const metadata = { title: "Create your account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ email?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-3xl font-semibold">Create your account</h1>
      <p className="mt-2 text-ink-soft">See your giving history, manage recurring gifts, and download receipts.</p>
      <div className="mt-6">
        <AuthForm action={registerAction} submitLabel="Create account">
          {sp.next && <input type="hidden" name="next" value={sp.next} />}
          <Field label="First name" name="first_name" autoComplete="given-name" />
          <Field label="Last name" name="last_name" autoComplete="family-name" />
          <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={sp.email} />
          <Field label="Password" name="password" type="password" autoComplete="new-password"
            hint="At least 12 characters with upper case, lower case and a number." />
        </AuthForm>
      </div>
      <p className="mt-8">Already registered? <Link className="font-semibold underline" href="/sign-in">Sign in</Link></p>
    </>
  );
}
