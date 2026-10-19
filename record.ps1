# Refresh the saved login, then start codegen already logged in.
# Usage:  .\record.ps1

Set-Location $PSScriptRoot

# 1) Log in again with auth.setup.ts (does not overwrite the HTML report)
npx playwright test --project=setup --reporter=line
if ($LASTEXITCODE -ne 0) {
    Write-Host "Login failed. Check the values in .env"
    exit 1
}

# 2) Read BASE_URL from .env
$baseUrl = (Get-Content .env | Where-Object { $_ -match '^BASE_URL=' }) -replace '^BASE_URL=', ''

# 3) Start recording, logged in
npx playwright codegen --load-storage=playwright/.auth/user.json "$baseUrl/dream/index.do"
