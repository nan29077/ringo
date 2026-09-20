import type { Metadata } from "next";
import { and, count, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { unreadForBuyer } from "@/lib/server/inquiries";
import { getT } from "@/lib/server/i18n-server";
import { AccountNav } from "./account-nav";

export const metadata: Metadata = { title: { default: "My account", template: "%s · My account · Ringo" }, robots: { index: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer("/account");
  const { t } = await getT();
  const role = viewer.user.role === "admin" ? "admin" : viewer.seller?.status === "active" ? "seller" : viewer.seller ? "applicant" : "buyer";
  // "Unread" means the other side wrote after the buyer last opened the thread.
  const db = await getDb();
  const [unread] = await db.select({ v: count() }).from(s.inquiries).where(and(eq(s.inquiries.userId, viewer.user.id), unreadForBuyer));
  return (
    <main className="shell sf-page">
      <div className="sf-account">
        <aside aria-label={t("Account", "계정 메뉴")}>
          <AccountNav name={viewer.user.name} email={viewer.user.email} role={role} unreadInquiries={unread?.v ?? 0} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
