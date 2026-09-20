import { getOrgSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { buildStatement, statementYears } from "@/lib/statements";
import { loadStatementRows } from "@/lib/donor/statement-data";
import { Empty } from "@/components/donor/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Annual statements" };

export default async function StatementsPage() {
  const settings = await getOrgSettings();
  const rows = await loadStatementRows();
  const years = statementYears(rows, settings.timezone);
  return (
    <>
      <h1 className="text-3xl font-semibold">Annual giving statements</h1>
      <p className="mt-2 max-w-prose text-ink-soft">Statements include only settled gifts, net of refunds. Pending bank payments appear in the year they settle.</p>
      {years.length === 0 ? <div className="mt-8"><Empty title="No statements yet">A statement appears once you have a settled gift.</Empty></div> : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {years.map((y) => (
            <li key={y} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <span className="text-lg"><strong>{y}</strong> · {formatMoney(buildStatement(rows, y, settings.timezone).totalCents, settings.currency)}</span>
              <a href={`/dashboard/statements/${y}/pdf`} className="min-h-11 rounded-md bg-brand-700 px-5 py-2.5 font-semibold text-white hover:bg-brand-800">
                Download PDF<span className="sr-only"> for {y}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
