import Link from "next/link";
import { ChevronRight, Inbox } from "lucide-react";

export function AccountHeader({ title, description, crumbs, actions }: { title: string; description?: React.ReactNode; crumbs?: { href?: string; label: string }[]; actions?: React.ReactNode }) {
  return (
    <div className="sf-head">
      <div className="min-w-0">
        {crumbs && (
          <nav className="sf-crumbs" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight size={13} aria-hidden />}
                {c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <h1 className="break-words">{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ title, body, action, icon: Icon = Inbox }: { title: string; body?: string; action?: React.ReactNode; icon?: typeof Inbox }) {
  return (
    <div className="sf-empty">
      <Icon aria-hidden />
      <h3>{title}</h3>
      {body && <p className="max-w-sm text-sm">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "", pad = true, id }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean; id?: string }) {
  return (
    <section className={`sf-card ${className}`} aria-labelledby={title && id ? id : undefined}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#efefeb] px-5 py-4">
          {title && <h2 id={id} className="text-[16px] font-semibold text-[#20211f]">{title}</h2>}
          {actions}
        </div>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function Pager({ page, pages, href, t }: { page: number; pages: number; href: (p: number) => string; t: (en: string, ko: string) => string }) {
  if (pages <= 1) return null;
  return (
    <nav className="sf-pager" aria-label={t("Pagination", "페이지")}>
      {page > 1 ? <Link href={href(page - 1)} className="sf-btn sf-btn-outline sf-btn-sm">{t("Previous", "이전")}</Link> : <span />}
      <span>{t(`Page ${page} of ${pages}`, `${pages}페이지 중 ${page}페이지`)}</span>
      {page < pages ? <Link href={href(page + 1)} className="sf-btn sf-btn-outline sf-btn-sm">{t("Next", "다음")}</Link> : <span />}
    </nav>
  );
}
