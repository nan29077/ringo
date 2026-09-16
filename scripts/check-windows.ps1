$ErrorActionPreference = "Stop"

$requiredNode = [Version]"22.13.0"
$pnpmSpec = "pnpm@11.25.0"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

# Corepack을 전역 활성화(corepack enable)하면 C:\Program Files\nodejs에 쓰기 권한(관리자)이 필요합니다.
# 관리자 권한 없이도 동작하도록 "corepack pnpm ..." 형태로 프로젝트에 지정된 pnpm을 바로 실행합니다.
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
$env:COREPACK_ENABLE_STRICT = "0"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git을 찾을 수 없습니다. Git for Windows를 설치한 뒤 PowerShell을 다시 여세요."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js를 찾을 수 없습니다. Node.js 22 LTS 이상을 설치하세요."
}
$nodeVersion = [Version](node --version).Trim().TrimStart("v")
if ($nodeVersion -lt $requiredNode) {
  throw "Node.js $requiredNode 이상이 필요합니다. 현재 버전: $nodeVersion"
}

function Invoke-Pnpm([string[]]$PnpmArgs) {
  if (Get-Command corepack -ErrorAction SilentlyContinue) {
    & corepack pnpm @PnpmArgs
  } else {
    # Node.js 25 이상은 Corepack이 기본 포함되지 않으므로 npx로 같은 버전을 실행합니다.
    & npx --yes $pnpmSpec @PnpmArgs
  }
  if ($LASTEXITCODE -ne 0) {
    throw "pnpm $($PnpmArgs -join ' ') 실행에 실패했습니다 (종료 코드 $LASTEXITCODE)."
  }
}

$pnpmVersion = (Invoke-Pnpm -PnpmArgs @("--version") | Select-Object -Last 1).ToString().Trim()
Write-Host "Node.js $nodeVersion / pnpm $pnpmVersion"

if ((Test-Path -LiteralPath "node_modules") -and -not (Test-Path -LiteralPath "node_modules\@electric-sql\pglite")) {
  Write-Host "이전 버전(Codex Sites)의 node_modules를 정리하고 다시 설치합니다." -ForegroundColor Yellow
  cmd /c rmdir /s /q node_modules
  if (Test-Path -LiteralPath "node_modules") {
    throw "node_modules 폴더를 지우지 못했습니다. 실행 중인 미리보기 창이나 편집기를 닫고 다시 시도하세요."
  }
}

Invoke-Pnpm -PnpmArgs @("install", "--frozen-lockfile")

Write-Host ""
Write-Host "Ringo 로컬 환경 준비가 완료되었습니다." -ForegroundColor Green
Write-Host "실행: start-ringo-preview.bat 더블클릭 (또는 corepack pnpm dev)"
Write-Host "주소: http://localhost:3031"
