"use client";

import { useEffect } from "react";

/**
 * Fades and lifts elements marked `data-reveal` into view as they scroll onto the screen (styles in globals.css).
 * Content is only hidden after this runs, so it's always visible without JavaScript; reduced-motion users see it still.
 */
export function ScrollReveal() {
  useEffect(() => {
    const root = document.documentElement;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!("IntersectionObserver" in window) || els.length === 0) return;
    root.classList.add("mg-reveal-ready");
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.setAttribute("data-visible", ""); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });
    const show = (el: Element) => el.setAttribute("data-visible", "");
    // Anything already on screen shows at once; the rest fades in as it scrolls into view.
    els.forEach((el) => (el.getBoundingClientRect().top < window.innerHeight ? show(el) : io.observe(el)));
    // Fail-safe: never leave content hidden, even if the observer doesn't fire (e.g. after an in-place page update).
    const failSafe = window.setTimeout(() => document.querySelectorAll("[data-reveal]").forEach(show), 2500);
    return () => { io.disconnect(); window.clearTimeout(failSafe); root.classList.remove("mg-reveal-ready"); };
  }, []);
  return null;
}
