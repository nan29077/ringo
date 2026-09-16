"use client";
import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/server/action";

type Props = Omit<React.ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (fd: FormData) => Promise<ActionResult>;
  success?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (r: ActionResult) => void;
  confirm?: string;
};

/** Form bound to a server action: pending state, toast feedback, refresh on success. */
export function ActionForm({ action, success, resetOnSuccess, onSuccess, confirm, children, ...rest }: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      {...rest}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget);
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.name) fd.set(submitter.name, submitter.value);
        start(async () => {
          const r = await action(fd);
          if (r.ok) {
            if (r.message || success) toast.success(r.message || success);
            if (resetOnSuccess) ref.current?.reset();
            onSuccess?.(r);
            if (r.redirect) router.push(r.redirect);
            else router.refresh();
          } else {
            toast.error(r.error);
          }
        });
      }}
    >
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
          const r = await action();
          if (r.ok) {
            if (r.message || success) toast.success(r.message || success);
            if (r.redirect) router.push(r.redirect);
            else router.refresh();
          } else toast.error(r.error);
        });
      }}
    >
      {children}
    </button>
  );
}
