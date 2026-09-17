"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * The header's <details> menu. It closes itself when the route changes and when the visitor clicks or
 * presses Escape outside it — a plain <details> would stay open on top of the next page, because the
 * App Router keeps the layout mounted across client navigations.
 */
export function MobileMenu({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e.type === "keydown") {
        if ((e as KeyboardEvent).key === "Escape") el.open = false;
      } else if (!el.contains(e.target as Node)) {
        el.open = false;
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details ref={ref} className="site-menu">
      <summary aria-label={label} title={label}>
        {icon}
      </summary>
      {/* Closing on click covers same-page links ("/#catalog"), where the pathname never changes. */}
      <div onClick={(e) => { if ((e.target as HTMLElement).closest("a") && ref.current) ref.current.open = false; }}>{children}</div>
    </details>
  );
}
