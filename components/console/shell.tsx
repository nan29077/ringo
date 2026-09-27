"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, ExternalLink, LogOut, Menu, Search, X } from "lucide-react";
import * as Icons from "lucide-react";
import { LanguageToggle } from "@/components/common/language-toggle";
import { useLang } from "@/components/common/lang-provider";
import { signOut } from "@/app/actions";

export type NavItem = { href: string; en: string; ko: string; badge?: number };
export type NavGroup = { id: string; en: string; ko: string; icon: keyof typeof Icons; href?: string; items?: NavItem[]; badge?: number };

export function ConsoleShell({ groups, workspace, user, children }: {
  groups: NavGroup[];
  workspace: { en: string; ko: string; tone: "admin" | "seller" };
  user: { name: string; email: string };
  children: React.ReactNode;
}) {
  const { t } = useLang();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const allHrefs = groups.flatMap((g) => [g.href, ...(g.items ?? []).map((i) => i.href)]).filter(Boolean) as string[];
  // Longest matching nav href wins, so /orders/refunds does not also light up /orders.
  const activeHref = allHrefs.filter((h) => h === path || (h !== "/admin" && h !== "/seller" && path.startsWith(h + "/"))).sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === activeHref;
  const q = query.trim().toLowerCase();

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!open || !mobile) return;
    const previousOverflow = document.body.style.overflow;
    const opener = openButtonRef.current;
    document.body.style.overflow = "hidden";
    // The mobile drawer has just changed from hidden to visible; focus after layout commits.
    const focusFrame = requestAnimationFrame(() => sidebarRef.current?.querySelector<HTMLButtonElement>("[data-menu-close]")?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
      if (event.key !== "Tab") return;
      const focusable = [...(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? [])];
      const first = focusable[0], last = focusable.at(-1);
      if (!first || !last) return;
      if (!sidebarRef.current?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [open, mobile]);

  const nav = (
    <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6" aria-label={t("Console navigation", "관리 메뉴")}>
      {groups.map((g) => {
        const Icon = Icons[g.icon] as React.ComponentType<{ className?: string }>;
        const items = (g.items ?? []).filter((i) => !q || (i.en + i.ko).toLowerCase().includes(q));
        if (g.href) {
          if (q && !(g.en + g.ko).toLowerCase().includes(q)) return null;
          return (
            <Link key={g.id} href={g.href} onClick={() => setOpen(false)} className={`rc-nav-link ${isActive(g.href) ? "active" : ""}`}>
              <Icon className="size-[18px]" />
              <span className="flex-1">{t(g.en, g.ko)}</span>
              {!!g.badge && <Badge n={g.badge} label={t("unread", "새 알림")} />}
            </Link>
          );
        }
        if (!items.length) return null;
        const anyActive = items.some((i) => isActive(i.href));
        const isOpen = !!q || anyActive || !collapsed.includes(g.id);
        return (
          <div key={g.id} className="mt-1">
            <button type="button" className={`rc-nav-link w-full ${anyActive ? "group-active" : ""}`} aria-expanded={isOpen} onClick={() => setCollapsed((c) => (c.includes(g.id) ? c.filter((x) => x !== g.id) : [...c, g.id]))}>
              <Icon className="size-[18px]" />
              <span className="flex-1 text-left">{t(g.en, g.ko)}</span>
              {!!g.badge && <Badge n={g.badge} label={t("unread", "새 알림")} />}
              <ChevronDown className={`size-4 transition ${isOpen ? "" : "-rotate-90"}`} />
            </button>
            {isOpen && (
              <div className="ml-[30px] mt-0.5 grid gap-0.5 border-l border-[#e7e8ec] pl-2">
                {items.map((i) => (
                  <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className={`rc-sub-link ${isActive(i.href) ? "active" : ""}`}>
                    <span className="flex-1">{t(i.en, i.ko)}</span>
                    {!!i.badge && <Badge n={i.badge} label={t("unread", "새 알림")} />}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  const mainLink = (
    <Link href="/" target="_blank" className="flex items-center justify-center gap-1.5 rounded-md border border-[#d9dbe3] px-3 py-2 text-xs font-medium text-[#3b3d46] hover:bg-[#f3f4f7]">
      <ExternalLink className="size-3.5" />{t("Home", "메인으로")}
    </Link>
  );

  const profile = (
    <div className="flex min-w-0 items-center gap-2">
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${workspace.tone === "admin" ? "bg-[#3b5bdb]" : "bg-[#ed4b2e]"}`}>{user.name.slice(0, 1).toUpperCase()}</span>
      <span className="min-w-0 flex-1 text-xs leading-tight">
        <b className="block truncate text-[#1c1d22]" title={user.name}>{user.name}</b>
        <span className="block truncate text-[#8a8d96]" title={user.email}>{user.email}</span>
      </span>
      <button className="ml-1 shrink-0 rounded-md p-2 text-[#6b6e78] hover:bg-[#f3f4f7]" disabled={pending} aria-label={t("Sign out", "로그아웃")} title={t("Sign out", "로그아웃")} onClick={() => start(() => signOut())}>
        <LogOut className="size-4" />
      </button>
    </div>
  );

  return (
    <div className="rc-root">
      <aside ref={sidebarRef} id="console-menu" className={`rc-sidebar ${open ? "open" : ""}`} role={mobile && open ? "dialog" : undefined} aria-modal={mobile && open ? true : undefined} aria-label={mobile && open ? t("Navigation menu", "관리 메뉴") : undefined} aria-hidden={mobile && !open ? true : undefined} inert={mobile && !open}>
        <div className="flex shrink-0 items-center justify-between px-5 pt-5 pb-3">
          <Link href="/" className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="size-8" />
            <span className="leading-tight">
              <span className="block text-[11px] font-semibold tracking-wide text-[#8a8d96]">{workspace.tone === "admin" ? "RINGO ADMIN" : "RINGO SELLER"}</span>
              <span className="block text-[15px] font-bold text-[#1c1d22]">{t(workspace.en, workspace.ko)}</span>
            </span>
          </Link>
          <button data-menu-close className="lg:hidden" aria-label={t("Close menu", "메뉴 닫기")} onClick={() => setOpen(false)}><X className="size-5" /></button>
        </div>
        <div className="shrink-0 px-4 pb-3">
          <label className="flex h-9 items-center gap-2 rounded-lg border border-[#e4e5ea] bg-white px-3 text-sm">
            <Search className="size-4 text-[#9a9ca5]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Find a menu", "메뉴 검색")} className="w-full bg-transparent outline-none" />
          </label>
        </div>
        {nav}
        <div className="shrink-0 space-y-3 border-t border-[#eceef2] bg-[#fbfbfc] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {mainLink}
          {profile}
        </div>
      </aside>
      {open && <div className="rc-backdrop lg:hidden" aria-hidden="true" onClick={() => setOpen(false)} />}
      <div className="rc-main" inert={mobile && open}>
        <header className="rc-topbar">
          <button ref={openButtonRef} className="lg:hidden" aria-label={t("Open menu", "메뉴 열기")} aria-controls="console-menu" aria-expanded={open} onClick={() => setOpen(true)}><Menu className="size-5" /></button>
          {/* The sidebar carries the logo on desktop, but it is off-screen on phones, so the top bar shows it there. */}
          <Link href={workspace.tone === "admin" ? "/admin" : "/seller"} className="flex min-w-0 items-center gap-2 lg:hidden">
            <img src="/favicon.svg" alt="" className="size-7 shrink-0" />
            <span className="min-w-0 leading-tight">
              <span className="block text-[10px] font-semibold tracking-wide text-[#8a8d96]">{workspace.tone === "admin" ? "RINGO ADMIN" : "RINGO SELLER"}</span>
              <span className="block truncate text-[13px] font-bold text-[#1c1d22]">{t(workspace.en, workspace.ko)}</span>
            </span>
          </Link>
          <div className="flex-1" />
          <LanguageToggle />
        </header>
        <main className="rc-content">{children}</main>
      </div>
    </div>
  );
}

function Badge({ n, label }: { n: number; label: string }) {
  return <span className="rc-new" aria-label={`${n} ${label}`} title={`${n} ${label}`}>N</span>;
}
