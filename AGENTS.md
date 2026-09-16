<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 커밋 규칙 (Ringo)

- 커밋 메시지는 **한국어**로 작성합니다. 제목은 무엇을 했는지 한 줄로, 필요하면 본문에 변경 내용을 목록으로 적습니다.
  - 예) `판매자 정산 목록에 기간 필터 추가`
- 코드 식별자, 파일명, 명령어처럼 원문 그대로여야 하는 부분만 영어로 둡니다.
- 커밋 메시지 템플릿: `.gitmessage.txt` (설정: `git config commit.template .gitmessage.txt`)
