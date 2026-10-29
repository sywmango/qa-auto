# 처음 한 번: QA 사이트 계정을 물어보고 .env 를 만든 뒤, 로그인이 되는지 확인합니다.
#
# 사용법 (이 폴더에서, PowerShell)
#   .\setup-env.ps1          ID·비밀번호를 물어보고 .env 를 만듦 (이미 있으면 덮어쓸지 물어봄)
#
# .env 는 이 폴더에만 저장되고 Git 에는 올라가지 않습니다 (.gitignore).
# 사이트 주소: oracle 은 .env, mssql 은 Git 에 있는 .env.mssql (주소만, 계정은 .env 를 같이 씀).
# 테스트가 만든 데이터에는 [로그인 ID] 가 이름 앞에 붙습니다.

Set-Location $PSScriptRoot
$envFile = Join-Path $PSScriptRoot '.env'

if (Test-Path $envFile) {
    $ans = Read-Host '.env 가 이미 있습니다. 새로 만들까요? (y/N)'
    if ($ans -notmatch '^[yY]') { Write-Host '그대로 둡니다.'; exit 0 }
}

$id = Read-Host 'QA 사이트 로그인 ID (User No)'
$pwSecure = Read-Host '비밀번호' -AsSecureString
$pw = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pwSecure))
if (-not $id -or -not $pw) { Write-Host 'ID 와 비밀번호를 모두 넣어 주세요.'; exit 1 }

$url = Read-Host 'QA 사이트 주소 (엔터 = http://202.133.21.133:1220)'
if (-not $url) { $url = 'http://202.133.21.133:1220' }
$company = Read-Host '로그인 후 고를 시스템 (엔터 = Dream4.1 (QA))'
if (-not $company) { $company = 'Dream4.1 (QA)' }

$text = @"
# QA 사이트 계정 (setup-env.ps1 이 만듦, Git 에 올리지 않음)
BASE_URL=$url
QA_USER_ID=$id
QA_USER_PW=$pw
QA_COMPANY=$company
"@
[IO.File]::WriteAllText($envFile, $text, (New-Object Text.UTF8Encoding $false))
Write-Host ".env 를 만들었습니다: $envFile"

# 로그인 확인 (성공하면 playwright\.auth\user.json 에 로그인 상태가 저장됨)
Write-Host '로그인 확인 중...'
npx playwright test --project=setup --reporter=line
if ($LASTEXITCODE -eq 0) { Write-Host '로그인 성공. 이제 테스트를 돌릴 수 있습니다.' }
else { Write-Host '로그인 실패. ID·비밀번호·주소를 확인하고 .\setup-env.ps1 을 다시 실행하세요.' }
