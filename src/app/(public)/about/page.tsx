import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Ultimate Mission",
  description: "Ultimate Mission equips local women as community health workers serving infants in rural villages.",
  alternates: { canonical: "/about" },
};

// Wording below is drawn from ultimatemission.org and is a placeholder until the organization edits and approves it.
export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-semibold">About Ultimate Mission</h1>
      <p className="mt-6 text-lg">Ultimate Mission empowers women as community health workers, focusing on infant health in rural villages in India, Ethiopia, the Philippines and South Sudan.</p>
      <p className="mt-4 text-lg">Programs include training and supporting local women as health workers, infant health initiatives, and EveryGirl, which provides period-poverty resources and education.</p>
      <p role="note" className="mt-6 rounded-md bg-paper-2 p-3 text-sm text-ink-soft">This page is an editable placeholder. Replace it with Ultimate Mission&apos;s approved text and photography.</p>
      <p className="mt-8"><a className="font-semibold underline" href="https://www.ultimatemission.org/">Visit ultimatemission.org</a> · <Link className="font-semibold underline" href="/donate">Give</Link></p>
    </div>
  );
}
