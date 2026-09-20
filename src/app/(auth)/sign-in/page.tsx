import Link from "next/link";
import { AuthForm, Field } from "@/components/ui/form";
import { signInAction, magicLinkAction } from "@/lib/auth/actions";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="text-3xl font-semibold">Sign in</h1>
      {error === "link" && (
        <p role="alert" className="mt-4 rounded-md bg-danger-bg p-3 text-danger">
          That link is invalid or expired. Please request a new one.
        </p>
      )}
      <div className="mt-6">
        <AuthForm action={signInAction} submitLabel="Sign in">
          <input type="hidden" name="next" value={next ?? ""} />
          <Field label="Email" name="email" type="email" autoComplete="email" />
          <Field label="Password" name="password" type="password" autoComplete="current-password" />
        </AuthForm>
      </div>
      <p className="mt-4 text-sm">
        <Link className="underline" href="/reset-password">Forgot your password?</Link>
      </p>
      <hr className="my-8 border-line" />
      <h2 className="text-xl font-semibold">Email me a sign-in link</h2>
      <div className="mt-4">
        <AuthForm action={magicLinkAction} submitLabel="Send link">
          <Field label="Email" name="email" type="email" autoComplete="email" />
        </AuthForm>
      </div>
      <p className="mt-8">New here? <Link className="font-semibold underline" href="/register">Create an account</Link></p>
    </>
  );
}
