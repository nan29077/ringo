import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireSeller } from "@/lib/server/auth";
import { getT } from "@/lib/server/i18n-server";
import { appOrigin } from "@/lib/server/request";
import { mediaUrl } from "@/lib/server/storage";
import { formatDate } from "@/lib/i18n";
import { sellerStatus } from "@/lib/status";
import { PageHeader, Panel, Field, DetailList } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionForm } from "@/components/common/action-form";
import { ImageUploadField } from "@/components/common/uploader";
import { CopyButton } from "@/components/console/copy-button";
import { sellerUpdateProfile } from "./actions";

export const metadata = { title: "Store profile" };

export default async function SellerSettings() {
  const { seller, user } = await requireSeller();
  const { t, lang } = await getT("ko");
  const storeUrl = `${await appOrigin()}/s/${seller.slug}`;
  return (
    <>
      <PageHeader
        title={t("Store profile", "스토어 프로필")}
        description={t("How your store appears to buyers.", "구매자에게 보이는 스토어 정보를 관리하세요.")}
        actions={<Link href={`/s/${seller.slug}`} target="_blank" className="rc-btn rc-btn-outline"><ExternalLink />{t("View store", "스토어 보기")}</Link>}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <ActionForm action={sellerUpdateProfile} className="grid gap-4">
          <Panel title={t("Profile", "프로필")}>
            <div className="grid gap-5">
              <div className="grid gap-1.5 text-sm">
                <span className="font-medium text-[#3b3d46]">{t("Store image", "스토어 이미지")}</span>
                <ImageUploadField name="avatarKey" kind="avatar" defaultKey={seller.avatarKey} defaultUrl={seller.avatarKey ? mediaUrl(seller.avatarKey) : "/favicon.svg"} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field className="content-start" label={t("Store name", "스토어 이름")} required>
                  <input name="displayName" className="rc-input" required minLength={2} maxLength={60} defaultValue={seller.displayName} />
                </Field>
                <Field className="content-start" label={t("Store address", "스토어 주소")} required hint={t("Lowercase letters, numbers and hyphens (3–40). Changing it breaks old store links.", "영문 소문자, 숫자, 하이픈 3–40자. 변경하면 기존 스토어 링크가 동작하지 않습니다.")}>
                  <div className="flex items-center gap-2"><span className="text-xs text-[#8a8d96]">/s/</span><input name="slug" className="rc-input" required minLength={3} maxLength={40} pattern="[a-z0-9\-]+" defaultValue={seller.slug} /></div>
                </Field>
                <Field className="content-start md:col-span-2" label={t("Website or portfolio", "웹사이트 · 포트폴리오")}>
                  <input name="website" className="rc-input" maxLength={200} defaultValue={seller.website ?? ""} placeholder="https://" />
                </Field>
                <Field className="content-start md:col-span-2" label={t("Bio", "소개")} hint={t("Up to 1,000 characters.", "최대 1,000자.")}>
                  <textarea name="bio" className="rc-textarea !min-h-[140px]" maxLength={1000} defaultValue={seller.bio ?? ""} />
                </Field>
              </div>
            </div>
          </Panel>
          <div className="flex justify-end"><button type="submit" className="rc-btn rc-btn-primary min-w-[140px]">{t("Save profile", "프로필 저장")}</button></div>
        </ActionForm>
        <div className="grid content-start gap-4">
          <Panel title={t("Public store link", "스토어 링크")}>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-[#f3f4f7] px-3 py-2 text-xs">{storeUrl}</code>
              <CopyButton value={storeUrl} />
            </div>
          </Panel>
          <Panel title={t("Account", "계정 정보")}>
            <DetailList
              items={[
                [t("Status", "상태"), <StatusBadge key="s" map={sellerStatus} value={seller.status} lang={lang} />],
                [t("Login email", "로그인 이메일"), user.email],
                [t("Commission", "판매 수수료"), seller.commissionBps != null ? `${(seller.commissionBps / 100).toFixed(1)}%` : t("Marketplace default", "기본 수수료")],
                [t("Approved", "입점 승인일"), formatDate(seller.reviewedAt, lang)],
              ]}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
