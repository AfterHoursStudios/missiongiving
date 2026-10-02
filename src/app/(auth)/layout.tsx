import { Logo } from "@/components/site/logo";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/* Split screen on wide displays: a brand panel in the home page's teal-to-green gradient (with the logo), and the form on
   the right. On phones only the form column shows, so the logo moves above the form there. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh w-full lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside
        className="mg-gradient relative hidden overflow-hidden bg-[linear-gradient(120deg,var(--teal-800),var(--teal-600),var(--brand-800),var(--teal-800))] text-white lg:flex lg:flex-col">
        <span aria-hidden="true" className="mg-blob -left-16 top-16 h-72 w-72 bg-gold" />
        <span aria-hidden="true" className="mg-blob bottom-24 right-0 h-80 w-80 bg-brand-500 [animation-delay:-6s]" />
        <div className="relative flex flex-1 flex-col justify-center p-12 xl:p-16">
          {/* The logo's navy lettering would vanish on the gradient, so it is shown in solid white here. */}
          <div className="mg-enter mb-10">
            <Logo className="h-20 xl:h-24 brightness-0 invert" priority />
          </div>
          <p className="mg-enter font-sans text-5xl font-black uppercase leading-[0.9] tracking-tight xl:text-6xl [--mg-delay:100ms]">
            Your generosity.<br />Their opportunity.
          </p>
          <p className="mg-enter mt-6 max-w-sm text-white/85 [--mg-delay:250ms]">
            See your giving history, manage recurring gifts and download receipts, all in one place.
          </p>
        </div>
      </aside>

      <main id="main" className="flex flex-col bg-paper px-4 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-md lg:hidden">
          <Logo className="h-11" priority />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <div className="mg-enter rounded-[var(--radius-lg)] border border-line bg-white p-6 shadow-[var(--shadow-md)] sm:p-10 [--mg-delay:100ms]">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
