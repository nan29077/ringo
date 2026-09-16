import Link from "next/link";
import { ChevronRight, Inbox } from "lucide-react";

export function PageHeader({ title, description, actions, crumbs }: { title: string; description?: string; actions?: React.ReactNode; crumbs?: { href?: string; label: string }[] }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {crumbs && (
          <div className="mb-2 flex items-center gap-1 text-xs text-[#8a8d96]">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3" />}
                {c.href ? <Link className="hover:text-[#1c1d22]" href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
              </span>
            ))}
          </div>
        )}
        <h1 className="text-[26px] font-bold tracking-tight text-[#16171b]">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-[#6b6e78]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, description, actions, children, className = "", bodyClass = "" }: { title?: React.ReactNode; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`rc-panel ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef0f3] px-5 py-4">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-[#1c1d22]">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-[#8a8d96]">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClass || "p-5"}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, tone = "default", href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "default" | "warn" | "good" | "info"; href?: string }) {
  const tones = { default: "", warn: "rc-stat-warn", good: "rc-stat-good", info: "rc-stat-info" };
  const body = (
    <div className={`rc-stat ${tones[tone]}`}>
      <span className="text-xs font-medium text-[#6b6e78]">{label}</span>
      <strong className="mt-2 block text-[26px] font-bold tracking-tight text-[#16171b]">{value}</strong>
      {hint && <span className="mt-1 block text-xs text-[#8a8d96]">{hint}</span>}
    </div>
  );
  return href ? <Link href={href} className="block transition hover:-translate-y-0.5">{body}</Link> : body;
}

const toneClass: Record<string, string> = {
  green: "bg-[#e7f7ee] text-[#16794a]",
  red: "bg-[#fdecec] text-[#c0362c]",
  amber: "bg-[#fff4e0] text-[#a45c00]",
  blue: "bg-[#e8efff] text-[#2f55c7]",
  gray: "bg-[#f0f1f4] text-[#5b5e68]",
  violet: "bg-[#f1ebff] text-[#6a3fc9]",
};

export function Badge({ tone = "gray", children }: { tone?: keyof typeof toneClass | string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass[tone] ?? toneClass.gray}`}>{children}</span>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <Inbox className="size-9 text-[#c3c5cc]" />
      <p className="text-sm font-semibold text-[#3b3d46]">{title}</p>
      {description && <p className="max-w-sm text-xs text-[#8a8d96]">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function DataTable({ head, children, empty, footer }: { head: React.ReactNode[]; children: React.ReactNode; empty?: React.ReactNode; footer?: React.ReactNode }) {
  const rows = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : [];
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="rc-table">
          <thead>
            <tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
          <tbody>{rows.length ? children : <tr><td colSpan={head.length}>{empty}</td></tr>}</tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

export function DetailList({ items }: { items: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,160px)_1fr] gap-x-4 gap-y-2.5 text-sm">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-[#8a8d96]">{k}</dt>
          <dd className="min-w-0 break-words text-[#1c1d22]">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Field({ label, hint, children, required, className = "" }: { label: string; hint?: string; children: React.ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={`grid gap-1.5 text-sm ${className}`}>
      <span className="font-medium text-[#3b3d46]">{label}{required && <span className="ml-0.5 text-[#e5484d]">*</span>}</span>
      {children}
      {hint && <span className="text-xs text-[#8a8d96]">{hint}</span>}
    </label>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger" | "success"; children: React.ReactNode }) {
  const c = { info: "border-[#d7e3ff] bg-[#f3f7ff] text-[#2f4a8a]", warn: "border-[#ffe2b3] bg-[#fff8ec] text-[#8a5300]", danger: "border-[#f7c9c7] bg-[#fff3f2] text-[#a3302a]", success: "border-[#c6ecd6] bg-[#f0fbf5] text-[#17663f]" }[tone];
  return <div className={`rounded-lg border px-4 py-3 text-[13px] leading-relaxed ${c}`}>{children}</div>;
}
