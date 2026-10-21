# 정기점검실행(AP591) 단위테스트를 단계별로 실행하고, 결과 엑셀·PDF 보고서를 만듭니다.
#
# 사용법 (D:\qa-auto, PowerShell)
#   .\run-ap591.ps1                      전체 → 엑셀·보고서까지
#   .\run-ap591.ps1 view                 조회 케이스만 (데이터 안 바뀜, 약 20분)
#   .\run-ap591.ps1 setting work         원하는 단계만
#   .\run-ap591.ps1 report               이미 돌린 결과로 엑셀·보고서만 다시
#
# 단계: view(조회) setting(Setting 상세, 바꾼 값은 되돌림) work(점검작업 수정·점검값·Edit·첨부·Linked·확정)
#       evidence(오류 캡처) report(엑셀·보고서)
# 주의: work 는 [sychoi] 주기 8007 / 설비 100302AG13 의 점검작업을 고치고, 오늘·어제 작업이 없으면
#       정기점검계획에서 일정을 추가·확정해서 만든 뒤 확정(작업완료)합니다. 완료한 작업은 되돌릴 수 없습니다.
#       로그인은 따로 씁니다 (playwright\.auth\user-ap591.json). 같은 계정으로 다른 테스트가 돌면 세션이 끊길 수 있습니다.

param([string[]]$Steps = @('view', 'setting', 'work', 'evidence', 'report'))

Set-Location $PSScriptRoot
$env:RUN_AP591 = '1'          # AP591 테스트는 이 값이 있을 때만 실행됨 (playwright.config.ts)
$env:QA_DEBUG = '1'
$env:QA_AUTH = 'playwright\.auth\user-ap591.json'
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$results = "playwright\.data\ap591-results"
$logs = "playwright\.data\ap591-logs"
New-Item -ItemType Directory -Force -Path $results, $logs, 'playwright\.data\evidence' | Out-Null

function Run-Step($name, $spec, $grep) {
    Write-Host "[$(Get-Date -Format HH:mm)] 시작 $name"
    $env:PLAYWRIGHT_JSON_OUTPUT_NAME = "$results\$name.json"
    $a = @('playwright', 'test', $spec, "--output=test-results-ap591-$name", '--reporter=line,json')
    if ($grep) { $a += @('-g', $grep) }
    & npx @a *> "$logs\$name.log"
    $sum = (Select-String -Path "$logs\$name.log" -Pattern '^\s+\d+ (passed|failed|skipped)' | ForEach-Object { $_.Line.Trim() }) -join ', '
    Write-Host "[$(Get-Date -Format HH:mm)] 끝 $name : $sum"
}

# 전체 실행이면 이전 결과를 치워서 새로 시작
if ($Steps -contains 'view' -and $Steps -contains 'work') {
    $bak = "playwright\.data\backup-ap591-$stamp"
    New-Item -ItemType Directory -Force -Path $bak | Out-Null
    if (Test-Path 'playwright\.data\ap591-state.json') { Move-Item 'playwright\.data\ap591-state.json' $bak }
    Get-ChildItem $results -Filter *.json -ErrorAction SilentlyContinue | Move-Item -Destination $bak
}

foreach ($s in $Steps) {
    switch ($s) {
        'view'     { Run-Step 'view' 'ap591/exec-view' }
        'setting'  { Run-Step 'setting' 'ap591/exec-setting' }
        'work'     { Run-Step 'work' 'ap591/exec-work' }
        'evidence' { Run-Step 'evidence' 'ap591/evidence' }
        'report'   {
            $xlsx = "docs\AP591\AP591_UT_정기점검실행_$stamp.xlsx"
            python -X utf8 scripts\write-results.py docs\AP591\AP591_UT_정기점검실행_양식.xlsx $xlsx $results docs\AP591\report\판정기준.json
            $json = $xlsx -replace '\.xlsx$', '_결과.json'
            node scripts\make-report.js $json docs\AP591\report\보고서정보.json "docs\AP591\report\AP591_정기점검실행_테스트결과보고서_$stamp.pdf"
            Write-Host "엑셀: $xlsx"
            Write-Host "보고서: docs\AP591\report\AP591_정기점검실행_테스트결과보고서_$stamp.pdf"
        }
    }
}
