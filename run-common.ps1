# 메뉴 공통 테스트(tests/common)를 실행합니다.
#
# 사용법 (D:\qa-auto, PowerShell)
#   .\run-common.ps1                     전체: Setting(3개 메뉴) → 상단 공통 기능
#   .\run-common.ps1 header              상단 공통 기능만 (즐겨찾기·업무그룹·Tab설정·편집모드, 대표 메뉴 정기점검주기)
#   .\run-common.ps1 setting             Setting 만 (AD230 → AD210 → AP591 차례로)
#   .\run-common.ps1 setting -Menus AD230,AP591   Setting 을 원하는 메뉴만
#
# 결과: playwright\.data\common-results\<단계>.json, 로그는 playwright\.data\common-logs
# Setting 결과 엑셀은 각 메뉴 run-xxx.ps1 의 setting 단계(같은 공통 테스트)를 쓰세요.
# 주의: 바꾼 값(Setting, 즐겨찾기, 업무그룹, 탭·필드 순서)은 테스트 끝에 원래대로 되돌립니다.
#       같은 계정으로 다른 테스트가 돌면 세션이 끊길 수 있어 한 번에 하나씩만 실행하세요.

param([string[]]$Steps = @('setting', 'header'), [string[]]$Menus = @('AD230', 'AD210', 'AP591'))

Set-Location $PSScriptRoot
$env:QA_DEBUG = '1'
$results = "playwright\.data\common-results"
$logs = "playwright\.data\common-logs"
New-Item -ItemType Directory -Force -Path $results, $logs, 'playwright\.data\evidence' | Out-Null

# 메뉴별 로그인 파일 (메뉴 run 스크립트와 같게)
$auth = @{ 'AD230' = ''; 'AD210' = 'playwright\.auth\user-ad210.json'; 'AP591' = 'playwright\.auth\user-ap591.json' }

function Run-Step($name, $spec) {
    Write-Host "[$(Get-Date -Format HH:mm)] 시작 $name"
    $env:PLAYWRIGHT_JSON_OUTPUT_NAME = "$results\$name.json"
    npx playwright test $spec "--output=test-results-common-$name" --reporter=line,json *> "$logs\$name.log"
    $sum = (Select-String -Path "$logs\$name.log" -Pattern '^\s+\d+ (passed|failed|skipped)' | ForEach-Object { $_.Line.Trim() }) -join ', '
    Write-Host "[$(Get-Date -Format HH:mm)] 끝 $name : $sum"
}

function Clear-RunFlags {
    foreach ($m in 'AD230', 'AD210', 'AP591', 'COMMON') { Remove-Item "Env:RUN_$m" -ErrorAction SilentlyContinue }
    Remove-Item Env:QA_AUTH -ErrorAction SilentlyContinue
}

foreach ($s in $Steps) {
    switch ($s) {
        'setting' {
            foreach ($m in $Menus) {
                Clear-RunFlags
                Set-Item "Env:RUN_$m" '1'      # 공통 Setting 테스트는 RUN_<메뉴> 가 켜진 메뉴만 케이스를 만듦
                if ($auth[$m]) { $env:QA_AUTH = $auth[$m] }
                Run-Step "setting-$m" 'common/setting'
            }
        }
        'header' {
            Clear-RunFlags
            $env:RUN_COMMON = '1'
            Run-Step 'header' 'common/header'
        }
    }
}
Clear-RunFlags
