"use client";
import { useEffect } from "react";

/**
 * Opens the <details> an anchor points at (`/notices#<id>`), so a link to a collapsed item lands on its
 * content instead of on a closed row. Browsers scroll to the element but do not expand it themselves.
 */
export function OpenHashDetails() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const target = document.getElementById(id);
      const details = target instanceof HTMLDetailsElement ? target : target?.closest("details");
      if (!details) return;
      details.open = true;
      details.scrollIntoView({ block: "start", behavior: "smooth" });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
