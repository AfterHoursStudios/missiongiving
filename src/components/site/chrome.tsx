import Link from "next/link";

const nav = [
  { href: "/projects", label: "Projects" },
  { href: "/about", label: "About" },
  { href: "/sign-in", label: "Sign in" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-paper no-print">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="font-display text-2xl font-semibold text-brand-800">Mission Giving</Link>
        <nav aria-label="Main" className="flex items-center gap-5">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="hidden font-medium hover:underline sm:inline">{n.label}</Link>
          ))}
          <Link href="/donate" className="min-h-11 rounded-md bg-brand-700 px-5 py-2.5 font-semibold text-white hover:bg-brand-800">
            Donate now
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-teal-800 text-white no-print">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
        <div>
          <p className="font-display text-xl">Mission Giving</p>
          <p className="mt-2 text-white/85">A giving portal for Ultimate Mission.</p>
          <p className="mt-2 text-white/85">P.O. Box 607, Gladstone OR 97027<br />971-356-6789</p>
        </div>
        <nav aria-label="Legal">
          <ul className="space-y-2">
            {[["privacy", "Privacy Policy"], ["terms", "Terms of Use"], ["refund-policy", "Donation and Refund Policy"],
              ["ach-authorization", "ACH Authorization"], ["accessibility", "Accessibility"]].map(([s, l]) => (
              <li key={s}><Link className="underline" href={`/legal/${s}`}>{l}</Link></li>
            ))}
          </ul>
        </nav>
        <div>
          <a className="underline" href="https://www.ultimatemission.org/">ultimatemission.org</a>
        </div>
      </div>
    </footer>
  );
}
