"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="min-h-11 rounded-md border-2 border-teal-800 px-4 font-semibold text-teal-800 no-print">
      Print or save as PDF
    </button>
  );
}
