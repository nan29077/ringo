-- Restore notes for demo courses created before the seed included lesson content.
-- Keep any content that a seller has subsequently entered.
UPDATE products AS p
SET lessons = (
  SELECT jsonb_agg(
    CASE
      WHEN coalesce(btrim(l.lesson->>'body'), '') = ''
        AND coalesce(btrim(l.lesson->>'videoUrl'), '') = ''
        AND coalesce(btrim(l.lesson->>'assetId'), '') = ''
        AND l.lesson->>'title' IN (
          'Introduction / 시작하기', 'Research & direction / 리서치와 방향',
          'Build the system / 시스템 만들기', 'Launch checklist / 출시 체크리스트'
        )
      THEN l.lesson || jsonb_build_object('body', CASE l.ord
        WHEN 1 THEN 'What this course covers, who it is for, and how to use the workbook.' || chr(10) || '이 강의가 다루는 내용과 워크북 사용법을 소개합니다.'
        WHEN 2 THEN 'How to gather references, interview users and pick a direction you can defend.' || chr(10) || '레퍼런스 수집, 사용자 인터뷰, 방향 정하기.'
        WHEN 3 THEN 'Turning the direction into reusable components, tokens and templates.' || chr(10) || '방향을 재사용 가능한 컴포넌트와 템플릿으로 만듭니다.'
        ELSE 'Everything to verify before you ship, and how to collect feedback afterwards.' || chr(10) || '출시 전 점검 항목과 출시 후 피드백 수집 방법.'
      END)
      ELSE l.lesson
    END ORDER BY l.ord
  )
  FROM jsonb_array_elements(p.lessons) WITH ORDINALITY AS l(lesson, ord)
)
WHERE p.slug IN ('design-your-first-brand', 'creative-workflow-masterclass')
  AND p.delivery_type = 'course'
  AND jsonb_array_length(p.lessons) = 4;
--> statement-breakpoint
-- Existing courses with empty lessons should no longer be offered for sale.
UPDATE products AS p
SET status = 'draft', updated_at = now()
WHERE p.delivery_type = 'course'
  AND p.status = 'published'
  AND (
    jsonb_array_length(p.lessons) = 0
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p.lessons) AS l(lesson)
      WHERE coalesce(btrim(l.lesson->>'body'), '') = ''
        AND coalesce(btrim(l.lesson->>'videoUrl'), '') = ''
        AND coalesce(btrim(l.lesson->>'assetId'), '') = ''
    )
  );
