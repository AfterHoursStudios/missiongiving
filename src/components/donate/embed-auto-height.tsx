"use client";

import { useEffect } from "react";

/**
 * Tells the page hosting this frame how tall the form is, whenever it changes, so the embed code's frame can grow and
 * shrink with it (no inner scroll bar). Sends only a height number; the host's snippet listens for it.
 */
export function EmbedAutoHeight() {
  useEffect(() => {
    if (window.parent === window) return;
    const send = () => window.parent.postMessage({ type: "mission-giving:height", height: document.documentElement.scrollHeight }, "*");
    const ro = new ResizeObserver(send);
    ro.observe(document.body);
    send();
    return () => ro.disconnect();
  }, []);
  return null;
}
