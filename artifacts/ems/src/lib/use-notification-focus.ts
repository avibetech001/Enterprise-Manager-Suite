import { useEffect, useRef } from "react";
import { useSearch } from "wouter";

/**
 * Reads `?id=` from the URL (set by notification deep links) and, once the
 * page's data has rendered, scrolls the element with DOM id `focus-<id>`
 * into view and briefly highlights it.
 *
 * Usage:
 *   const focusId = useNotificationFocus(!!data);
 *   ...
 *   <TableRow id={`focus-${r.id}`} ...>
 */
export function useNotificationFocus(ready: boolean): number | null {
  const search = useSearch();
  const raw = new URLSearchParams(search).get("id");
  const parsed = raw ? Number(raw) : NaN;
  const focusId = Number.isFinite(parsed) ? parsed : null;
  const done = useRef<number | null>(null);

  useEffect(() => {
    if (!ready || focusId === null || done.current === focusId) return;
    // Let the list render first.
    const t = setTimeout(() => {
      const el = document.getElementById(`focus-${focusId}`);
      if (!el) return;
      done.current = focusId;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Background flash renders reliably on both cards and table rows
      // (ring/rounded styles are inconsistent on <tr> elements).
      const classes = ["bg-primary/10", "transition-colors", "duration-700"];
      el.classList.add(...classes);
      setTimeout(() => el.classList.remove("bg-primary/10"), 2500);
    }, 100);
    return () => clearTimeout(t);
  }, [ready, focusId]);

  return focusId;
}
