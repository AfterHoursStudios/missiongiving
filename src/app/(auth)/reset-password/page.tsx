import { AuthForm, Field } from "@/components/ui/form";
import { resetPasswordAction } from "@/lib/auth/actions";

export const metadata = { title: "Reset your password" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Reset your password</h1>
      <p className="mt-2 text-ink-soft">Enter your email and we will send a reset link.</p>
      <div className="mt-6">
        <AuthForm action={resetPasswordAction} submitLabel="Send reset link">
          <Field label="Email" name="email" type="email" autoComplete="email" />
        </AuthForm>
      </div>
    </>
  );
}
