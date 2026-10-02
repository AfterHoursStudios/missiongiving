import { getOrgSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { buildStatement, statementYears } from "@/lib/statements";
import { loadStatementRows } from "@/lib/donor/statement-data";
import { Empty, Panel } from "@/components/donor/ui";
import { Download } from "lucide-react";

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
        <Panel className="mt-6" flush>
          <ul className="divide-y divide-line">
            {years.map((y) => (
              <li key={y} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-paper">
                <span className="text-lg"><strong>{y}</strong> <span className="text-ink-soft">·</span> {formatMoney(buildStatement(rows, y, settings.timezone).totalCents, settings.currency)}</span>
                <a href={`/dashboard/statements/${y}/pdf`} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800">
                  <Download aria-hidden="true" size={16} />Download PDF<span className="sr-only"> for {y}</span>
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
