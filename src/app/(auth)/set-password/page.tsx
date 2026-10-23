import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { setOwnPassword } from "@/lib/auth/actions";
import { SimpleForm, TextInput } from "@/components/donor/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set your password" };

/** Where a staff invitation link lands: the newly signed-in person chooses their password, then goes to the admin portal. */
export default async function SetPasswordPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in?error=link");
  return (
    <div className="w-full max-w-md">
      <h1 className="text-3xl font-semibold">Welcome to Mission Giving</h1>
      <p className="mt-2 text-ink-soft">Choose a password for <strong className="text-ink">{user.email}</strong>. You&apos;ll use it with your email to sign in from now on.</p>
      <div className="mt-6">
        <SimpleForm action={setOwnPassword} submit="Save password and continue">
          <TextInput label="New password" name="password" type="password" autoComplete="new-password" required hint="At least 12 characters, with upper case, lower case and a number." />
          <TextInput label="Type it again" name="confirm" type="password" autoComplete="new-password" required />
        </SimpleForm>
      </div>
    </div>
  );
}
