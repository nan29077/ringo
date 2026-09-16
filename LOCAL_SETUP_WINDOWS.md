# Ringo 로컬 개발 환경 (Windows)

로컬 작업 경로: `E:\프로젝트\링고`

원격 저장소: `https://github.com/nan29077/ringo.git`

## 1. 처음 내려받기

PowerShell을 열고 다음 명령을 실행합니다.

```powershell
New-Item -ItemType Directory -Force -Path "E:\프로젝트" | Out-Null
Set-Location "E:\프로젝트"
git clone https://github.com/nan29077/ringo.git "링고"
Set-Location "E:\프로젝트\링고"
```

`E:\프로젝트\링고` 폴더가 이미 있고 비어 있지 않다면 새로 clone하지 말고, 먼저 그 폴더의 파일을 확인합니다.

## 2. 필수 버전 확인과 설치

- Node.js `22.13.0` 이상
- Git
- pnpm `11.25.0` (Corepack 사용 권장)

```powershell
node --version
git --version
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm --version
pnpm install --frozen-lockfile
```

`corepack` 명령을 찾을 수 없다면 Node.js 22 LTS 이상을 다시 설치한 뒤 PowerShell을 새로 엽니다.

## 3. 로컬 실행

```powershell
Set-Location "E:\프로젝트\링고"
pnpm dev
```

개발 서버는 로컬 PC에서만 접근 가능한 `127.0.0.1:3031`에 실행됩니다. 브라우저에서 `http://localhost:3031`을 엽니다. 종료할 때는 실행 중인 PowerShell에서 `Ctrl+C`를 누릅니다.

## 4. 이후 원격 작업 흐름

작업 시작 전:

```powershell
Set-Location "E:\프로젝트\링고"
git pull --rebase origin main
pnpm install --frozen-lockfile
```

작업 완료 후:

```powershell
git status
git add .
git commit -m "작업 내용을 간단히 설명"
git push origin main
```

GitHub 인증 창이 열리면 `nan29077` 계정으로 로그인합니다. 비밀번호나 토큰은 프로젝트 파일이나 `.env`에 기록하지 않습니다.

## 5. Codex에서 열기

ChatGPT 데스크톱/Codex에서 작업 폴더로 `E:\프로젝트\링고`를 선택합니다. 터미널에서 시작할 때는 다음처럼 이동합니다.

```powershell
Set-Location "E:\프로젝트\링고"
codex --no-alt-screen
```

## 현재 데모 경계

현재 상품·주문·딥 링크와 테스트 계정은 브라우저 로컬 저장소를 사용합니다. PostgreSQL 스키마는 준비되어 있지만 AWS DB, Google/Facebook/이메일 실제 인증, 결제, 공용 파일 저장소는 아직 연결되지 않았습니다.
