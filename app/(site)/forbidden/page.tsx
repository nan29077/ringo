import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getT } from "@/lib/server/i18n-server";

export default async function Forbidden() {
  const { t } = await getT();
  return (
    <main className="access">
      <ShieldAlert size={44} />
      <h1>{t("No access", "접근 권한이 없습니다")}</h1>
      <p>{t("Your account does not have permission to open this page.", "현재 계정으로는 이 페이지를 열 수 없습니다.")}</p>
      <Link href="/" className="rc-btn rc-btn-outline">{t("Back to shop", "쇼핑몰로")}</Link>
    </main>
  );
}
