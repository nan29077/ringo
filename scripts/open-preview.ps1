$ErrorActionPreference = "SilentlyContinue"
$previewUrl = "http://localhost:3031"
$deadline = (Get-Date).AddSeconds(90)

while ((Get-Date) -lt $deadline) {
  try {
    $response = Invoke-WebRequest -Uri $previewUrl -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
      Start-Process $previewUrl
      exit 0
    }
  }
  catch {
    Start-Sleep -Seconds 1
  }
}

exit 1
