import Link from "next/link";
import { Logo } from "./logo";

const nav = [
  { href: "/projects", label: "Projects" },
  { href: "/sponsor", label: "Sponsor a woman" },
  { href: "/about", label: "About" },
];
const utility = [
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/dashboard", label: "My giving" },
  { href: "/sign-in", label: "Sign in" },
];

/** Public site header, Nike-style: a thin utility bar, then logo left, main links centred, Donate pill on the right. */
export function SiteHeader() {
  return (
    // Sticky: stays pinned to the top of the window while the page scrolls.
    <header className="no-print sticky top-0 z-40 shadow-sm">
      <div className="bg-paper-2 text-xs">
        <nav aria-label="Account and help" className="mx-auto flex max-w-[90rem] justify-end gap-x-1 px-4 sm:px-8">
          {utility.map((u, i) => (
            <span key={u.href + u.label} className="flex items-center">
              {i > 0 && <span aria-hidden="true" className="px-1 text-ink-soft">|</span>}
              <Link href={u.href} className="inline-flex min-h-9 items-center px-1 font-medium hover:text-ink-soft">{u.label}</Link>
            </span>
          ))}
        </nav>
      </div>
      <div className="border-b border-line bg-white">
        <div className="mx-auto grid max-w-[90rem] grid-cols-[1fr_auto] items-center gap-4 px-4 py-2 sm:px-8 md:grid-cols-[1fr_auto_1fr]">
          <Logo priority className="h-10 sm:h-12" />
          <nav aria-label="Main" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {nav.map((n) => (
                <li key={n.href}><Link href={n.href} className="inline-flex min-h-11 items-center px-3 font-semibold hover:underline hover:underline-offset-8">{n.label}</Link></li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center justify-end gap-2">
            <Link href="/projects" className="inline-flex min-h-11 items-center px-2 font-semibold md:hidden">Projects</Link>
            <Link href="/donate" className="inline-flex min-h-11 items-center rounded-full bg-ink px-6 font-semibold text-white hover:bg-ink/85">Donate now</Link>
          </div>
        </div>
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
