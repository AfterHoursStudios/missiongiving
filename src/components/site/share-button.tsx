"use client";

import { useState } from "react";

export function ShareButton({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    try {
      if (navigator.share) return await navigator.share({ title, url });
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch { /* user canceled or clipboard unavailable */ }
  }
  return (
    <>
      <button type="button" onClick={share} className="min-h-11 rounded-md border-2 border-teal-800 px-5 font-semibold text-teal-800">Share</button>
      <span role="status" className="ml-2 text-sm">{copied ? "Link copied" : ""}</span>
    </>
  );
}
