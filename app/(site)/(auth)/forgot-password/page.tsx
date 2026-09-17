import Link from "next/link";
import { getT } from "@/lib/server/i18n-server";
import { ActionForm } from "@/components/common/action-form";
import { AuthCard, AuthInput, SubmitButton } from "../auth-card";
import { requestPasswordReset } from "../actions";

export const metadata = { title: "Reset password", robots: { index: false } };

export default async function ForgotPasswordPage() {
  const { t } = await getT();
  return (
    <AuthCard title={t("Reset your password", "비밀번호 재설정")} subtitle={t("Enter your account email and we'll send you a reset link.", "가입한 이메일로 재설정 링크를 보내드립니다.")} footer={<Link href="/login" className="font-semibold text-[#ed4b2e]">{t("Back to log in", "로그인으로 돌아가기")}</Link>}>
      <ActionForm action={requestPasswordReset} className="grid gap-4" resetOnSuccess>
        <AuthInput label={t("Email", "이메일")} name="email" type="email" required />
        <SubmitButton>{t("Send reset link", "재설정 링크 보내기")}</SubmitButton>
      </ActionForm>
    </AuthCard>
  );
}
