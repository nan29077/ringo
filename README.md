# Ringo / 링고

A bilingual digital-content marketplace prototype with an English storefront, Korean review mode, role-based demo workspaces, product deep links and simulated purchases.

## Windows 로컬 실행

기본 로컬 경로는 `E:\프로젝트\링고`, 원격 저장소는 `https://github.com/nan29077/ringo.git`입니다. 처음 설치하는 방법은 [`LOCAL_SETUP_WINDOWS.md`](LOCAL_SETUP_WINDOWS.md)를 따르세요.

저장소를 내려받은 다음에는 PowerShell에서 아래처럼 준비하고 실행할 수 있습니다.

```powershell
Set-Location "E:\프로젝트\링고"
.\scripts\check-windows.ps1
pnpm dev
```

로컬 미리보기 주소는 `http://localhost:3031`입니다.

## Current state

This is a browser-local demo, not a production payment or authentication system. PostgreSQL schema for the future AWS backend is in `db/schema.postgres.sql`; it is not connected yet. Full status and next steps: `IMPLEMENTATION.md`.

## Project

- `components/ringo.tsx`: storefront and role-specific interfaces
- `lib/ringo/data.ts`: sample products, types and original back-office menu map
- `app/globals.css`: responsive theme
- `public/images`: generated product artwork
- `db/schema.postgres.sql`: planned AWS PostgreSQL schema

Use the existing pnpm lockfile and the Node version required by `package.json`. The current `dev` and `build` scripts target the preview runtime. For a later Windows/AWS move, first configure the portable execution profile and follow `IMPLEMENTATION.md`; the hosted Workers output itself is not an AWS deployment package.
