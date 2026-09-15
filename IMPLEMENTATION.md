# Ringo / 링고 — 1차 구현 인계

## 구현 현황

- TypeScript + React 19 + Next.js App Router 구조. 검토용 배포는 Vinext/Workers 빌드.
- 브랜드 로고, 반응형 쇼핑몰, 생성형 이미지 3장으로 구성한 디지털 예시 상품 6개.
- 영어 기본, 한국어 검토 전환. USD 가격.
- 최고 관리자 / 판매자 / 구매자 비밀번호 없는 **데모 역할 전환**.
- 카테고리·검색·가격 정렬·관심 상품, 상품 상세.
- 상품 등록/수정/임시저장/공개, 판매자별 상품 필터.
- 상품 딥 링크 `/p/{slug}?seller={sellerSlug}&utm_source={campaign}` 생성/복사/미리보기.
- 테스트 구매 → 주문 기록 → 구매자 라이브러리 → 샘플 TXT 다운로드.
- 데모 주문 기반 대시보드·매출·예상 정산. 정산 수수료 10%는 설명용 가정.
- 원본 백오피스의 모든 관찰된 메뉴와 하위 메뉴 포함. 부가 관리 메뉴는 로컬 데모 항목 추가/삭제 화면이며 원 서비스의 전체 업무 기능 복제가 아님.

## 참고 확인

`sms.shopcube.kr`에 보안 로그인 후 관리자 대시보드에서 전체 내비게이션을 읽었음.
원본의 계정/비밀번호/고객 및 결제 데이터는 프로젝트에 복사하지 않음.
`ringopayments.com/lingo-shop/en/`은 검색 접근 실패 및 연결 시간 초과로 상세 화면 확인 불가. 프론트는 독자 디자인.

원본 메뉴 맵은 `lib/ringo/data.ts`의 `menuGroups` 참조:
상품(목록/등록/재고/분류/진열/기획전), 주문(전체/입금전/배송준비/배송대기/배송중/배송완료/취소/교환/반품), 운영자, 회원(리스트/등급), 메시지(알림/템플릿/SMS 과금), 게시판/게시글, 디자인(관리/업로더/보관함/다운로드 요청), 앱 제작(신청서/목록), 프로모션(쿠폰 관리/생성), 배너 팝업(목록/등록), 통계(매출/상품 품목/카테고리/데드스탁/트래픽), 설정(환경/멀티쇼핑몰/딥링크), 로그 뷰.

## 현재 데모 경계

- 상품·주문·관심 상품·부가 항목·환경설정은 이 브라우저 localStorage, 데모 역할은 sessionStorage.
- 역할 전환은 운영용 인증/권한 관리가 아님. 실제 사용자 정보·돈·비밀 파일을 처리하면 안 됨.
- 기존 예시 상품 링크는 다른 브라우저에서도 동일 상품으로 진입. 새 등록 상품은 이 브라우저에만 존재하여 다른 기기에 공유되지 않음.
- 다운로드는 실제 상품이 아닌 `public/samples/ringo-preview.txt`.
- 현재 방문자 분석/실제 결제/메일·SMS/업로드/앱 제작/환불/이체는 미연결.
- 통계의 상품/카테고리/트래픽 상세 메뉴는 첫 단계에서 공통 데모 요약 화면 사용.
- WebMCP 검색 도구 포함. 지원 브라우저에서 실동작 검증은 미실시.
- 브라우저 UI/E2E 테스트는 미실시. TypeScript 검사 및 Workers 프로덕션 빌드를 수행.

## AWS / 로컬 다음 단계

AWS 고유 DB 문법은 없으며, 목표 DB 엔진을 PostgreSQL로 선택했음.
`db/schema.postgres.sql`은 RDS PostgreSQL 또는 Aurora PostgreSQL용 시작 스키마이며 아직 실행/연동하지 않음.
스키마: users / sellers / products / product_translations / product_assets / share_links / orders / entitlements / audit_logs.
금액은 정수 cents, 통화 명시, 시간은 timestamptz, 구매 API idempotency key 포함.

실서비스 연결 순서:
1. Windows 로컬 체크아웃, 프로젝트 engines에 맞는 Node 설치, 기존 pnpm lock 유지.
2. 표준 Next.js 실행으로 로컬 서버 확인. 검토용 Workers 런타임과 AWS 실행 경로를 분리.
3. 로컬 PostgreSQL과 스키마 적용, 서버 API와 서버 권한 검사 구현. 데모 저장소 대체.
4. 서버 인증 도입, 관리자는 자기 역할을 선택할 수 없도록 전환.
5. S3 비공개 콘텐츠 업로드/다운로드. 결제 완료된 entitlement를 서버에서 확인하고 짧은 유효기간의 presigned URL 발급.
6. 결제 사업자 연동, webhook 서명/중복 처리/환불 시 권한 철회, 세금·수수료 정책 확정.
7. 딥 링크를 DB 레코드로 영구 저장. 판매자는 상품 레코드에서 결정하고 URL의 seller 값은 신뢰하지 않음.
8. 로그·정산·운영 메뉴의 업무 기능을 개별 구현. AWS 배포와 운영 접근 제어 검증.

현재 빌드는 AWS 배포/DB 연결 완료를 의미하지 않음. 사용자의 로컬 이전 지시에 따라 다음 작업을 진행.

## 이미지 제작

Built-in imagegen 사용, 각각 한 번씩 생성:
- `public/images/book.webp`: Make Good Work black hardcover / ivory type / vermilion circle / concrete plinth.
- `public/images/type.webp`: cobalt & ivory typography specimen cards / large Aa / orange accents.
- `public/images/coast.webp`: red vintage car / coastal road / golden analog light.
프로젝트 에셋으로 최적화한 WebP를 사용. 상품은 모두 허구의 데모.
