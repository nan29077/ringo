$ErrorActionPreference = "Stop"

$requiredNode = [Version]"22.13.0"
$pnpmSpec = "pnpm@11.25.0"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

# Corepack을 전역 활성화(corepack enable)하면 C:\Program Files\nodejs에 쓰기 권한(관리자)이 필요합니다.
# 관리자 권한 없이도 동작하도록 "corepack pnpm ..." 형태로 프로젝트에 지정된 pnpm을 바로 실행합니다.
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
$env:COREPACK_ENABLE_STRICT = "0"
# 일부 네트워크에서 IPv6 연결 지연으로 패키지 다운로드가 매우 느려지는 문제를 피합니다.
if (-not $env:NODE_OPTIONS) { $env:NODE_OPTIONS = "--dns-result-order=ipv4first" }

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
  # 이전 버전의 node_modules는 삭제에 오래 걸리거나 멈출 수 있어, 이름만 바꿔 치워두고 바로 새로 설치합니다.
  $oldName = "node_modules_old_" + (Get-Date -Format "yyyyMMddHHmmss")
  Write-Host "이전 버전의 node_modules를 $oldName 으로 옮기고 새로 설치합니다." -ForegroundColor Yellow
  Rename-Item -LiteralPath "node_modules" -NewName $oldName
  Write-Host "(옮겨둔 $oldName 폴더는 나중에 직접 지워도 됩니다.)"
}

Write-Host "패키지를 설치합니다. 네트워크 상태에 따라 수 분 걸릴 수 있으며, 중간에 멈춰도 다시 실행하면 이어서 설치합니다." -ForegroundColor Cyan
Invoke-Pnpm -PnpmArgs @("install", "--frozen-lockfile", "--reporter=append-only")

Write-Host ""
Write-Host "Ringo 로컬 환경 준비가 완료되었습니다." -ForegroundColor Green
Write-Host "실행: start-ringo-preview.bat 더블클릭 (또는 corepack pnpm dev)"
Write-Host "주소: http://localhost:3031"
