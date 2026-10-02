import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Mission Giving",
  description: "Dependable, affordable fundraising tools for nonprofits: more support for your mission, less spent on software.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-semibold">About Mission Giving</h1>
      <p className="mt-4 text-2xl font-semibold text-teal-800">More support for your mission. Less spent on software.</p>
      <div className="mt-8 space-y-5 text-lg">
        <p>Mission Giving began with a simple belief: nonprofits should have access to dependable fundraising tools at a price that makes sense.</p>
        <p>Too often, organizations pay for complicated software packages filled with features they rarely use. For nonprofits working with limited budgets and small teams, that means money spent on software that could be supporting the people and communities they serve.</p>
        <p>We wanted to create a simpler option.</p>
        <p>Mission Giving focuses on the essentials: accepting donations, managing recurring gifts, keeping donor records organized, and understanding fundraising progress. Our goal is to make everyday tasks easier without overwhelming your team with unnecessary complexity.</p>
        <p>We believe fundraising software should be straightforward, affordable, and built around the real needs of nonprofits. Whether you&rsquo;re getting started or growing your organization, you deserve tools that help you spend more time on your mission and less time managing a platform.</p>
      </div>
      <p className="mt-10 border-l-4 border-gold pl-4 text-xl font-semibold">You focus on making a difference. We help make giving easier.</p>
    </div>
  );
}
