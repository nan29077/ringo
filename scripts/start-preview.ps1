param(
  [switch]$ValidateOnly,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$previewUrl = "http://localhost:3031"
$openerScript = Join-Path $PSScriptRoot "open-preview.ps1"

Set-Location -LiteralPath $projectRoot

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  throw "Node.js를 찾을 수 없습니다. Node.js 22 LTS 이상을 설치하세요."
}

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) {
  throw "npm을 찾을 수 없습니다. Node.js 22 LTS 이상을 다시 설치하세요."
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) {
  Write-Host "처음 실행을 위한 패키지를 설치합니다." -ForegroundColor Yellow
  & (Join-Path $PSScriptRoot "check-windows.ps1")
}

if (-not (Test-Path -LiteralPath $openerScript)) {
  throw "브라우저 실행 도우미를 찾을 수 없습니다: $openerScript"
}

if ($ValidateOnly) {
  Write-Host "Ringo 미리보기 실행 환경이 준비되었습니다." -ForegroundColor Green
  Write-Host "실행 파일: start-ringo-preview.bat"
  Write-Host "미리보기: $previewUrl"
  exit 0
}

if (-not $NoBrowser) {
  $powershellCommand = (Get-Command powershell.exe -ErrorAction Stop).Source
  Start-Process -FilePath $powershellCommand `
    -ArgumentList @("-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $openerScript) `
    -WindowStyle Hidden
}

Write-Host ""
Write-Host "Ringo 로컬 미리보기를 시작합니다." -ForegroundColor Cyan
Write-Host "주소: $previewUrl"
Write-Host "종료: 이 창에서 Ctrl+C"
Write-Host ""

& $npmCommand.Source run dev
exit $LASTEXITCODE
