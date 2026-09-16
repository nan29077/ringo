# Ringo 로컬 개발 환경 (Windows)

- 로컬 작업 경로: `E:\프로젝트\링고`
- 원격 저장소: `https://github.com/nan29077/ringo.git`

## 1. 필수 프로그램

- Node.js `22.13.0` 이상 (LTS 권장)
- Git for Windows
- pnpm `11.25.0` (Corepack으로 설치)

PostgreSQL은 설치하지 않아도 됩니다. `DATABASE_URL`이 없으면 프로젝트 안의 내장 DB(`.data/pglite`)를 사용합니다.

## 2. 처음 준비

```powershell
Set-Location "E:\프로젝트\링고"
.\scripts\check-windows.ps1
```

스크립트가 Node/Git/pnpm 버전을 확인하고 `pnpm install --frozen-lockfile`을 실행합니다.
기존 `node_modules`가 이전 Codex Sites 방식으로 설치되어 있었다면 문제가 생길 수 있으니, 오류가 나면 `node_modules` 폴더를 지운 뒤 다시 실행하세요.

## 3. 실행

프로젝트 폴더의 `start-ringo-preview.bat`를 더블클릭하면 서버가 준비된 뒤 브라우저가 자동으로 열립니다. 실행 창은 서버 로그를 보여주며, 종료할 때는 그 창에서 `Ctrl+C`를 누릅니다.

PowerShell에서 직접 실행하려면 아래 명령을 사용합니다.

```powershell
pnpm dev
```

브라우저에서 `http://localhost:3031`을 엽니다. 예시 계정은 `README.md`를 참고하세요.
개발 모드에서는 메일이 실제로 발송되지 않고 터미널과 관리자 → 고객 지원 → 메일 발송 내역에 기록됩니다 (비밀번호 재설정 링크 확인용).

## 4. 환경 변수 (선택)

`.env.example`을 `.env.local`로 복사해 필요한 값만 채웁니다. `.env.local`은 Git에 올라가지 않습니다.

## 5. GitHub 작업 흐름

처음 한 번 (저장소가 이미 연결되어 있음):

```powershell
git push -u origin main
```

작업 시작 전:

```powershell
git pull --rebase origin main
pnpm install --frozen-lockfile
```

처음 한 번, 한글 커밋 설정:

```powershell
git config core.quotepath false
git config i18n.commitEncoding utf-8
git config i18n.logOutputEncoding utf-8
git config commit.template .gitmessage.txt
```

커밋 메시지는 한국어로 작성합니다 (예: `git commit -m "판매자 정산 목록에 기간 필터 추가"`). 한글이 깨져 보이면 PowerShell에서 `[Console]::OutputEncoding = [Text.Encoding]::UTF8`을 먼저 실행하세요.

작업 완료 후:

```powershell
git status
git add .
git commit -m "작업 내용을 한국어로 간단히 설명"
git push origin main
```

GitHub 인증 창이 열리면 `nan29077` 계정으로 로그인합니다. 비밀번호나 토큰은 프로젝트 파일에 기록하지 않습니다.

## 6. 운영 환경 흉내 내기

```powershell
pnpm build
$env:COOKIE_SECURE="false"; $env:PAYMENT_TEST_MODE="true"; pnpm start
```

프로덕션 모드는 HTTPS 전용 쿠키와 테스트 결제 차단이 기본이라, 로컬 HTTP에서 확인할 때만 위 두 변수를 켭니다.
