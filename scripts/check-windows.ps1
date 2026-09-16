$ErrorActionPreference = "Stop"

$requiredNode = [Version]"22.13.0"
$projectRoot = Split-Path -Parent $PSScriptRoot

Set-Location $projectRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git을 찾을 수 없습니다. Git for Windows를 설치한 뒤 PowerShell을 다시 여세요."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js를 찾을 수 없습니다. Node.js 22 LTS 이상을 설치하세요."
}

$nodeVersionText = (node --version).Trim().TrimStart("v")
$nodeVersion = [Version]$nodeVersionText
if ($nodeVersion -lt $requiredNode) {
  throw "Node.js $requiredNode 이상이 필요합니다. 현재 버전: $nodeVersion"
}

if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) {
  throw "Corepack을 찾을 수 없습니다. Node.js 22 LTS 이상을 다시 설치하세요."
}

corepack enable
corepack prepare pnpm@11.25.0 --activate

$pnpmVersion = (pnpm --version).Trim()
if ($pnpmVersion -ne "11.25.0") {
  throw "pnpm 11.25.0이 필요합니다. 현재 버전: $pnpmVersion"
}

pnpm install --frozen-lockfile

Write-Host ""
Write-Host "Ringo 로컬 환경 준비가 완료되었습니다." -ForegroundColor Green
Write-Host "실행: pnpm dev"
Write-Host "주소: http://localhost:3031"
