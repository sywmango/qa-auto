# 정기점검계획(AD210) 단위테스트를 단계별로 실행하고, 결과 엑셀·PDF 보고서를 만듭니다.
#
# 사용법 (D:\qa-auto, PowerShell)
#   .\run-ad210.ps1                      전체 → 엑셀·보고서까지, 약 1시간
#   .\run-ad210.ps1 view                 조회 케이스만 (데이터 안 바뀜, 약 20분)
#   .\run-ad210.ps1 data work            원하는 단계만
#   .\run-ad210.ps1 report               이미 돌린 결과로 엑셀·보고서만 다시
#
# 단계: view(조회) setting(Setting 상세, 바꾼 값은 되돌림) data(일정추가·수정·Edit·일정확정·삭제)
#       work(점검작업 수정·점검값·첨부·Linked·완료처리) evidence(오류 캡처) report(엑셀·보고서)
# 주의: data·work 는 [sychoi] 주기 8007 / 설비 100302AG13 에 일정을 추가하고 확정·완료합니다.
#       확정·완료한 계획은 지울 수 없어 남습니다 (작업계획으로 남은 것은 data 마지막에 지움).
#       로그인은 따로 씁니다 (playwright\.auth\user-ad210.json). 같은 계정으로 다른 테스트가 돌면 세션이 끊길 수 있습니다.

param([string[]]$Steps = @('view', 'setting', 'data', 'work', 'evidence', 'report'))

Set-Location $PSScriptRoot
$env:RUN_AD210 = '1'          # AD210 테스트는 이 값이 있을 때만 실행됨 (playwright.config.ts)
$env:QA_DEBUG = '1'
$env:QA_AUTH = 'playwright\.auth\user-ad210.json'
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$results = "playwright\.data\ad210-results"
$logs = "playwright\.data\ad210-logs"
New-Item -ItemType Directory -Force -Path $results, $logs, 'playwright\.data\evidence' | Out-Null

function Run-Step($name, $spec, $grep) {
    Write-Host "[$(Get-Date -Format HH:mm)] 시작 $name"
    $env:PLAYWRIGHT_JSON_OUTPUT_NAME = "$results\$name.json"
    $a = @('playwright', 'test', $spec, "--output=test-results-ad210-$name", '--reporter=line,json')
    if ($grep) { $a += @('-g', $grep) }
    & npx @a *> "$logs\$name.log"
    $sum = (Select-String -Path "$logs\$name.log" -Pattern '^\s+\d+ (passed|failed|skipped)' | ForEach-Object { $_.Line.Trim() }) -join ', '
    Write-Host "[$(Get-Date -Format HH:mm)] 끝 $name : $sum"
}

# 전체 실행이면 이전 결과·일정 기록을 치워서 새로 시작
if ($Steps -contains 'data' -and $Steps -contains 'work') {
    $bak = "playwright\.data\backup-ad210-$stamp"
    New-Item -ItemType Directory -Force -Path $bak | Out-Null
    if (Test-Path 'playwright\.data\ad210-state.json') { Move-Item 'playwright\.data\ad210-state.json' $bak }
    Get-ChildItem $results -Filter *.json -ErrorAction SilentlyContinue | Move-Item -Destination $bak
}

foreach ($s in $Steps) {
    switch ($s) {
        'view'     { Run-Step 'view' 'ad210/plan-view' }
        'setting'  { Run-Step 'setting' 'ad210/plan-setting' }
        'data'     { Run-Step 'data' 'ad210/plan-data' }
        'work'     { Run-Step 'work' 'ad210/plan-work' }
        'evidence' { Run-Step 'evidence' 'ad210/evidence' }
        'report'   {
            $xlsx = "docs\AD210\AD210_UT_정기점검계획_$stamp.xlsx"
            python -X utf8 scripts\write-results.py docs\AD210\AD210_UT_정기점검계획_양식.xlsx $xlsx $results docs\AD210\report\판정기준.json
            $json = $xlsx -replace '\.xlsx$', '_결과.json'
            node scripts\make-report.js $json docs\AD210\report\보고서정보.json "docs\AD210\report\AD210_정기점검계획_테스트결과보고서_$stamp.pdf"
            Write-Host "엑셀: $xlsx"
            Write-Host "보고서: docs\AD210\report\AD210_정기점검계획_테스트결과보고서_$stamp.pdf"
        }
    }
}
