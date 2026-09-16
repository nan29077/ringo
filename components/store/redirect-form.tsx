"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/server/action";

/**
 * Form bound to a server action that usually ends in a redirect (checkout, payment).
 * Stays in the busy state while navigating; supports absolute payment-provider URLs.
 */
export function RedirectForm({ action, children, className, confirm }: { action: (fd: FormData) => Promise<ActionResult>; children: React.ReactNode; className?: string; confirm?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [navigating, setNavigating] = useState(false);
  const busy = pending || navigating;
  return (
    <form
      className={className}
      aria-busy={busy}
      data-busy={busy ? "true" : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget);
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.name) fd.set(submitter.name, submitter.value);
        start(async () => {
          const r = await action(fd);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          if (r.message) toast.success(r.message);
          if (r.redirect) {
            setNavigating(true);
            if (/^https?:\/\//i.test(r.redirect) && !r.redirect.startsWith(window.location.origin)) window.location.assign(r.redirect);
            else router.push(r.redirect.startsWith(window.location.origin) ? r.redirect.slice(window.location.origin.length) : r.redirect);
          } else router.refresh();
        });
      }}
    >
      <fieldset disabled={busy} className="contents">{children}</fieldset>
    </form>
  );
}

/** Submit button that shows a busy label while its RedirectForm is working. */
export function BusyButton({ children, busyLabel, className, name, value }: { children: React.ReactNode; busyLabel: string; className?: string; name?: string; value?: string }) {
  return (
    <button type="submit" name={name} value={value} className={`sf-busy-btn ${className ?? ""}`}>
      <span className="sf-busy-idle">{children}</span>
      <span className="sf-busy-active" aria-live="polite">{busyLabel}</span>
    </button>
  );
}
