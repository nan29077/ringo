import { getT } from "@/lib/server/i18n-server";
import { ActionForm } from "@/components/common/action-form";
import { AuthCard, AuthInput, SubmitButton } from "../auth-card";
import { resetPassword } from "../actions";

export const metadata = { title: "New password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const { t } = await getT();
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
