import type { Metadata } from "next";
import { requireViewer } from "@/lib/server/auth";
import { getT } from "@/lib/server/i18n-server";
import { AccountNav } from "./account-nav";

export const metadata: Metadata = { title: { default: "My account", template: "%s · My account · Ringo" }, robots: { index: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer("/account");
  const { t } = await getT();
  const role = viewer.user.role === "admin" ? "admin" : viewer.seller?.status === "active" ? "seller" : viewer.seller ? "applicant" : "buyer";
  return (
    <main className="shell sf-page">
      <div className="sf-account">
        <aside aria-label={t("Account", "계정 메뉴")}>
          <AccountNav name={viewer.user.name} email={viewer.user.email} role={role} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
