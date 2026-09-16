# Ringo / 링고

필리핀 시장을 위한 디지털 콘텐츠 마켓플레이스입니다 (강의, 전자책, 디자인 리소스, 사진, 광고 제작 서비스, 기획전 패키지).
구매자 쇼핑몰은 영어가 기본이고 한국어로 전환할 수 있으며, 최고 관리자·판매자·구매자 3개 역할이 실제 서버 데이터로 동작합니다.

- 로컬 경로: `E:\프로젝트\링고`
- 저장소: https://github.com/nan29077/ringo

## 빠른 시작 (Windows)

가장 간단한 방법은 프로젝트 폴더의 `start-ringo-preview.bat`를 더블클릭하는 것입니다. 처음 한 번 필요한 패키지를 설치하고, 서버가 준비되면 브라우저를 자동으로 엽니다.

PowerShell에서 직접 실행하려면:

```powershell
Set-Location "E:\프로젝트\링고"
.\scripts\check-windows.ps1   # Node/pnpm 확인 + 의존성 설치
corepack pnpm dev             # http://localhost:3031
```

별도 DB 설치가 필요 없습니다. 처음 실행하면 `.data/pglite`에 내장 PostgreSQL(PGlite)이 만들어지고 개발용 예시 데이터가 들어갑니다.

| 역할 | 이메일 | 비밀번호 | 주소 |
|---|---|---|---|
| 최고 관리자 | admin@ringo.local | ringo1234! | /admin |
| 판매자 (Studio North) | studio@ringo.local | ringo1234! | /seller |
| 판매자 (Form & Field) | formfield@ringo.local | ringo1234! | /seller |
| 구매자 | buyer@ringo.local | ringo1234! | /account |
| 입점 심사 대기자 | applicant@ringo.local | ringo1234! | /sell/status |

예시 계정은 개발 모드(또는 `RINGO_DEMO_SEED=true`)에서 빈 DB일 때만 생성됩니다. 데이터를 초기화하려면 서버를 끄고 `.data` 폴더를 지우세요.

## 주요 기능

- **최고 관리자** `/admin`: 대시보드, 상품 목록·심사·분류·구매평, 주문·제작 주문·환불·결제 내역, 회원·운영자, 입점 심사·판매자·정산, 쿠폰·딥링크·배너, 1:1 문의·공지·메일 발송 내역, 매출·상품·유입 통계, 환경 설정·결제 연동, 관리 작업/에러 로그
- **판매자 센터** `/seller`: 대시보드, 상품 등록·파일 업로드·심사 요청, 주문·납품·환불 처리, 딥링크, 쿠폰, 정산 내역, 고객 문의, 구매평, 스토어 프로필·정산 계좌, 공지
- **구매자** : 쇼핑몰 홈·상품·판매자 스토어, 회원가입/로그인/비밀번호 재설정/이메일 인증, 결제(쿠폰·딥링크 유입 반영), 라이브러리·다운로드·강의 진도, 주문 상세·환불 요청·구매평, 위시리스트, 1:1 문의, 프로필·로그인 기기 관리, 판매자 입점 신청

## 명령어

관리자 권한으로 `corepack enable`을 한 적이 없다면 아래 명령 앞에 `corepack`을 붙여 실행하세요 (예: `corepack pnpm dev`).

| 명령 | 설명 |
|---|---|
| `pnpm dev` | 개발 서버 (127.0.0.1:3031) |
| `pnpm build` / `pnpm start` | 프로덕션 빌드 / 실행 |
| `pnpm typecheck` / `pnpm lint` | 타입 검사 / 린트 |
| `pnpm db:generate` | 스키마 변경 후 마이그레이션 SQL 생성 |
| `pnpm db:migrate` | 마이그레이션 적용 (서버 시작 시 자동 적용됨) |
| `pnpm admin:create <email> <password> [name]` | 최고 관리자 생성/승격 |
| `pnpm test:e2e` | 3개 역할 전체 흐름 브라우저 테스트 (서버 실행 중이어야 함) |

## 문서

- [`IMPLEMENTATION.md`](IMPLEMENTATION.md) — 구현 현황, 운영 전 남은 작업, AWS 배포
- [`LOCAL_SETUP_WINDOWS.md`](LOCAL_SETUP_WINDOWS.md) — Windows 개발 환경과 GitHub 작업 흐름
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — 구조와 코드 규칙
- [`.env.example`](.env.example) — 환경 변수
