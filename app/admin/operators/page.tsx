import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ShieldAlert } from "lucide-react";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { formatDate } from "@/lib/i18n";
import { userStatus } from "@/lib/status";
import { PageHeader, Panel, DataTable, EmptyState, Badge, Notice, Field } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionButton, ActionForm } from "@/components/common/action-form";
import { createOperator, demoteOperator, promoteOperator } from "./actions";

export const metadata = { title: "Admin staff" };

export default async function AdminOperators() {
  const viewer = await requireAdmin();
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const admins = await db.select().from(s.users).where(eq(s.users.role, "admin")).orderBy(desc(s.users.createdAt));
  const activeCount = admins.filter((a) => a.status === "active").length;

  return (
    <>
      <PageHeader title={t("Admin staff", "관리자 계정")} description={t("People with super-admin access to this console.", "이 관리자 콘솔에 접근할 수 있는 최고 관리자 계정입니다.")} />
      <div className="mb-4">
        <Notice tone="warn">
          <span className="inline-flex items-start gap-2"><ShieldAlert className="mt-0.5 size-4 shrink-0" />{t("Operators have full access: orders, refunds, payouts, member data and settings. Grant access only to trusted staff, remove it as soon as it is no longer needed, and review the audit log regularly.", "운영자는 주문·환불·정산·회원 정보·설정 등 모든 기능에 접근할 수 있습니다. 신뢰할 수 있는 담당자에게만 부여하고, 필요가 없어지면 즉시 해제하며, 관리자 작업 기록를 주기적으로 확인하세요.")}</span>
        </Notice>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Panel title={<>{t("Operators", "운영자")} <span className="ml-1 text-[#8a8d96]">{admins.length}</span></>} bodyClass="p-0" actions={<Link href="/admin/logs" className="rc-btn rc-btn-outline rc-btn-sm">{t("Admin activity", "관리자 작업 기록")}</Link>}>
          <DataTable head={[t("Name", "이름"), t("Status", "상태"), t("Last login", "최근 로그인"), t("Created", "등록일"), ""]} empty={<EmptyState title={t("No operators", "운영자가 없습니다")} />}>
            {admins.map((a) => (
              <tr key={a.id}>
                <td>
                  <Link href={`/admin/members/${a.id}`} className="font-semibold hover:underline">{a.name}</Link>
                  {a.id === viewer.user.id && <span className="ml-1.5"><Badge tone="blue">{t("You", "나")}</Badge></span>}
                  <div className="text-[11px] text-[#8a8d96]">{a.email}</div>
                </td>
                <td><StatusBadge map={userStatus} value={a.status} lang={lang} /></td>
                <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(a.lastLoginAt, lang, true)}</td>
                <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(a.createdAt, lang)}</td>
                <td className="text-right">
                  {a.id !== viewer.user.id && !(a.status === "active" && activeCount <= 1) && (
                    <ActionButton variant="outline" action={demoteOperator.bind(null, a.id)} confirm={t(`Remove operator access from ${a.email}? They will be signed out.`, `${a.email}의 운영자 권한을 해제할까요? 해당 계정은 로그아웃됩니다.`)}>
                      {t("Remove access", "권한 해제")}
                    </ActionButton>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </Panel>

        <div className="grid content-start gap-4">
          <Panel title={t("Promote an existing member", "기존 회원을 운영자로 지정")}>
            <ActionForm action={promoteOperator} resetOnSuccess className="grid gap-3" confirm={t("Give this member full operator access?", "이 회원에게 운영자 전체 권한을 부여할까요?")}>
              <Field label={t("Member email", "회원 이메일")} required>
                <input name="email" type="email" required maxLength={200} className="rc-input" placeholder="name@example.com" />
              </Field>
              <button className="rc-btn rc-btn-primary justify-self-start">{t("Promote to operator", "운영자로 지정")}</button>
            </ActionForm>
          </Panel>
          <Panel title={t("Create a new operator account", "새 운영자 계정 생성")}>
            <ActionForm action={createOperator} resetOnSuccess className="grid gap-3" confirm={t("Create a new operator account with full access?", "전체 권한을 가진 운영자 계정을 생성할까요?")}>
              <Field label={t("Name", "이름")} required><input name="name" required maxLength={80} className="rc-input" /></Field>
              <Field label={t("Email", "이메일")} required><input name="email" type="email" required maxLength={200} className="rc-input" autoComplete="off" /></Field>
              <Field label={t("Temporary password", "임시 비밀번호")} required hint={t("8+ characters with letters and numbers. Share it securely and ask the operator to change it after the first login.", "영문과 숫자를 포함해 8자 이상. 안전하게 전달하고 첫 로그인 후 변경하도록 안내하세요.")}>
                <input name="password" type="password" required minLength={8} maxLength={128} className="rc-input" autoComplete="new-password" />
              </Field>
              <button className="rc-btn rc-btn-primary justify-self-start">{t("Create operator", "운영자 생성")}</button>
            </ActionForm>
          </Panel>
        </div>
      </div>
    </>
  );
}
