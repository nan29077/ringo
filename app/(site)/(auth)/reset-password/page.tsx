import Link from "next/link";
import { getT } from "@/lib/server/i18n-server";
import { ActionForm } from "@/components/common/action-form";
import { AuthCard, AuthInput, SubmitButton } from "../auth-card";
import { resetPassword, resetTokenValid } from "../actions";

export const metadata = { title: "New password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const { t } = await getT();
  // A link that was already used or has expired gets an explanation, not a form that cannot work.
  if (!token || !(await resetTokenValid(token))) {
    return (
      <AuthCard
        title={t("Link expired", "만료된 링크")}
        subtitle={t("This password reset link is invalid or has already been used. Request a new one.", "유효하지 않거나 이미 사용된 재설정 링크입니다. 새 링크를 요청하세요.")}
      >
        <Link href="/forgot-password" className="flex h-12 items-center justify-center rounded-lg bg-[#ed4b2e] font-semibold text-white">{t("Request a new link", "재설정 링크 다시 받기")}</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t("Choose a new password", "새 비밀번호 설정")} subtitle={t("All other sessions will be signed out.", "다른 기기의 로그인은 모두 해제됩니다.")}>
      <ActionForm action={resetPassword} className="grid gap-4">
        <input type="hidden" name="token" value={token ?? ""} />
        <AuthInput label={t("New password", "새 비밀번호")} name="password" type="password" autoComplete="new-password" minLength={8} required />
        <SubmitButton>{t("Save password", "비밀번호 저장")}</SubmitButton>
      </ActionForm>
    </AuthCard>
  );
}
