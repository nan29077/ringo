"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/server/action";

type Props = Omit<React.ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (fd: FormData) => Promise<ActionResult>;
  success?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (r: ActionResult) => void;
  confirm?: string;
  warnUnsaved?: boolean;
};

/** Form bound to a server action: pending state, toast feedback, refresh on success. */
export function ActionForm({ action, success, resetOnSuccess, onSuccess, confirm, warnUnsaved = false, children, ...rest }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const dirty = useRef(false);
  useEffect(() => {
    if (!warnUnsaved) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      event.preventDefault();
    };
    const checkLink = (event: MouseEvent) => {
      if (!dirty.current || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const target = event.target;
      const link = target instanceof Element ? target.closest("a[href]") as HTMLAnchorElement | null : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download") || link.href === location.href) return;
      if (!window.confirm(document.documentElement.lang === "ko" ? "저장하지 않은 변경 사항이 있습니다. 페이지를 이동할까요?" : "You have unsaved changes. Leave this page?")) event.preventDefault();
      else dirty.current = false;
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", checkLink, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", checkLink, true); };
  }, [warnUnsaved]);
  return (
    <form
      ref={ref}
      {...rest}
      aria-busy={pending}
      onInput={(event) => { rest.onInput?.(event); if (warnUnsaved) dirty.current = true; if (error) setError(""); }}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        setError("");
        const fd = new FormData(e.currentTarget);
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.name) fd.set(submitter.name, submitter.value);
        start(async () => {
          try {
            const r = await action(fd);
            if (r.ok) {
              dirty.current = false;
              if (r.message || success) toast.success(r.message || success);
              if (resetOnSuccess) ref.current?.reset();
              onSuccess?.(r);
              if (r.redirect) router.push(r.redirect);
              else router.refresh();
            } else {
              setError(r.error);
              toast.error(r.error);
              const field = r.field ? ref.current?.elements.namedItem(r.field) : null;
              if (field instanceof HTMLElement) requestAnimationFrame(() => field.focus());
              else requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("[data-form-error]")?.focus());
            }
          } catch {
            const message = document.documentElement.lang === "ko" ? "연결이 끊어졌습니다. 입력 내용은 유지됩니다. 다시 시도하세요." : "Connection lost. Your entries are still here; please try again.";
            setError(message);
            toast.error(message);
          }
        });
      }}
    >
      {error && <div data-form-error tabIndex={-1} role="alert" className="rounded-lg border border-[#f3c3c0] bg-[#fff3f2] px-3 py-2 text-sm text-[#a3302a]">{error}</div>}
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
    </form>
  );
}

/** One-click server action button (e.g. approve, toggle). */
export function ActionButton({ action, success, confirm, children, className, variant = "outline", size = "sm" }: {
  action: () => Promise<ActionResult>;
  success?: string;
  confirm?: string;
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary";
  size?: "default" | "sm" | "xs" | "icon-sm";
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const variants: Record<string, string> = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    outline: "border bg-background hover:bg-accent",
    ghost: "hover:bg-accent",
    destructive: "bg-destructive text-white hover:bg-destructive/90",
    secondary: "bg-secondary hover:bg-secondary/80",
  };
  const sizes: Record<string, string> = { default: "h-9 px-4", sm: "h-8 px-3", xs: "h-6 px-2 text-xs", "icon-sm": "size-8" };
  return (
    <button
      type="button"
      disabled={pending}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap transition disabled:opacity-50 [&_svg]:size-4 ${variants[variant]} ${sizes[size]} ${className ?? ""}`}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          try {
            const r = await action();
            if (r.ok) {
              if (r.message || success) toast.success(r.message || success);
              if (r.redirect) router.push(r.redirect);
              else router.refresh();
            } else toast.error(r.error);
          } catch {
            toast.error(document.documentElement.lang === "ko" ? "연결이 끊어졌습니다. 다시 시도하세요." : "Connection lost. Please try again.");
          }
        });
      }}
    >
      {children}
    </button>
  );
}
