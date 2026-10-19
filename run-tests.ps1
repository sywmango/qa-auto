# Run Playwright tests, then keep a copy of the HTML report.
# Usage:  .\run-tests.ps1            (background)
#         .\run-tests.ps1 --headed   (show browser)

Set-Location $PSScriptRoot

npx playwright test @args
$exitCode = $LASTEXITCODE

$reportRoot = "D:\qa-reports"
$dest = Join-Path $reportRoot ("report-" + (Get-Date -Format "yyyyMMdd-HHmm"))

New-Item -ItemType Directory -Force -Path $reportRoot | Out-Null
if (Test-Path "playwright-report") {
    Copy-Item "playwright-report" $dest -Recurse -Force
    Write-Host ""
    Write-Host "Report saved: $dest\index.html"
}

exit $exitCode
