import Link from "next/link";
import { AuthForm, Field } from "@/components/ui/form";
import { signInAction, magicLinkAction } from "@/lib/auth/actions";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="text-3xl font-semibold">Welcome back</h1>
      <p className="mt-1 text-ink-soft">Sign in to your Mission Giving account.</p>
      {error === "link" && (
        <p role="alert" className="mt-5 rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">
          That link is invalid or expired. Please request a new one.
        </p>
      )}
      <div className="mt-7">
        <AuthForm action={signInAction} submitLabel="Sign in">
          <input type="hidden" name="next" value={next ?? ""} />
          <Field label="Email" name="email" type="email" autoComplete="email" placeholder="you@example.com" />
          <div>
            <Field label="Password" name="password" type="password" autoComplete="current-password" />
            <p className="mt-2 text-right text-sm">
              <Link className="font-semibold text-teal-600 hover:underline" href="/reset-password">Forgot your password?</Link>
            </p>
          </div>
        </AuthForm>
      </div>

      <div className="my-8 flex items-center gap-4 text-sm text-ink-soft" role="separator">
        <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
      </div>

      <h2 className="text-lg font-semibold">Email me a sign-in link</h2>
      <p className="mb-4 text-sm text-ink-soft">No password needed. We&rsquo;ll send a link that signs you straight in.</p>
      <AuthForm action={magicLinkAction} submitLabel="Send link" variant="outline">
        <Field label="Email" name="email" id="f-magic-email" type="email" autoComplete="email" placeholder="you@example.com" />
      </AuthForm>

      <p className="mt-8 text-center text-sm text-ink-soft">
        New here? <Link className="font-semibold text-ink underline underline-offset-4 hover:text-teal-600" href="/register">Create an account</Link>
      </p>
    </>
  );
}
