import type { notices } from "@/db/schema";
import type { T } from "@/lib/i18n";
import { ActionForm } from "@/components/common/action-form";
import { Field, Panel } from "@/components/console/ui";
import { saveNotice } from "./actions";

type Notice = typeof notices.$inferSelect;

export function NoticeForm({ notice, t }: { notice?: Notice; t: T }) {
  return (
    <ActionForm action={saveNotice} className="grid gap-4">
      {notice && <input type="hidden" name="id" value={notice.id} />}
      <Panel>
        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <Field label={t("Title", "제목")} required><input name="title" className="rc-input" required maxLength={160} defaultValue={notice?.title ?? ""} /></Field>
            <Field label={t("Audience", "공개 대상")} required>
              <select name="audience" className="rc-select" defaultValue={notice?.audience ?? "all"}>
                <option value="all">{t("Everyone", "전체")}</option>
                <option value="sellers">{t("Sellers (seller center)", "판매자 (판매자센터)")}</option>
                <option value="buyers">{t("Buyers (store)", "구매자 (스토어)")}</option>
              </select>
            </Field>
          </div>
          <Field label={t("Body", "내용")} required hint={t("Plain text. Line breaks are kept.", "일반 텍스트이며 줄바꿈이 유지됩니다.")}>
            <textarea name="body" className="rc-textarea !min-h-[280px]" required maxLength={20000} defaultValue={notice?.body ?? ""} />
          </Field>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={notice?.published ?? true} /><span className="font-medium">{t("Published", "게시")}</span></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pinned" defaultChecked={notice?.pinned ?? false} /><span className="font-medium">{t("Pin to top", "상단 고정")}</span></label>
          </div>
        </div>
      </Panel>
      <div className="flex justify-end">
        <button className="rc-btn rc-btn-primary min-w-[140px]">{notice ? t("Save changes", "변경사항 저장") : t("Publish notice", "공지 등록")}</button>
      </div>
    </ActionForm>
  );
}
