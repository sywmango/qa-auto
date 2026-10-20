# 정기점검주기(AD230) 단위테스트를 단계별로 실행하고, 결과 엑셀·PDF 보고서를 만듭니다.
#
# 사용법 (D:\qa-auto, PowerShell)
#   .\run-ad230.ps1                      전체 (새 주기로 처음부터) → 엑셀·보고서까지, 약 3시간
#   .\run-ad230.ps1 view                 조회 케이스만 (데이터 안 바뀜, 약 6분)
#   .\run-ad230.ps1 data extra           원하는 단계만
#   .\run-ad230.ps1 report               이미 돌린 결과로 엑셀·보고서만 다시
#
# 단계: view(조회) data(생성·수정·하위목록·일정) extra(주기구분·표시형식) complete(작업완료 후 재조정)
#       delete(삭제) evidence(오류 캡처) report(엑셀·보고서)
# 주의: view 를 뺀 단계는 [sychoi] 주기를 새로 만들고, 작업을 완료 처리하고, 삭제합니다.
#       준비 데이터(가동/사용달력, 표준작업, 설비종류 점검항목)는 docs\AD230_handoff.md 의 "준비" 참고.

param([string[]]$Steps = @('view', 'data', 'extra', 'complete', 'delete', 'evidence', 'report'))

Set-Location $PSScriptRoot
$env:RUN_AD230 = '1'          # AD230 테스트는 이 값이 있을 때만 실행됨 (playwright.config.ts)
$env:QA_DEBUG = '1'
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$results = "playwright\.data\results-ad230"
$logs = "playwright\.data\logs-ad230"
New-Item -ItemType Directory -Force -Path $results, $logs, 'playwright\.data\evidence' | Out-Null

function Run-Step($name, $spec, $grep) {
    Write-Host "[$(Get-Date -Format HH:mm)] 시작 $name"
    $env:PLAYWRIGHT_JSON_OUTPUT_NAME = "$results\$name.json"
    if ($grep) { npx playwright test $spec -g $grep --reporter=line,json *> "$logs\$name.log" }
    else { npx playwright test $spec --reporter=line,json *> "$logs\$name.log" }
    $sum = (Select-String -Path "$logs\$name.log" -Pattern '^\s+\d+ (passed|failed|skipped)' | ForEach-Object { $_.Line.Trim() }) -join ', '
    Write-Host "[$(Get-Date -Format HH:mm)] 끝 $name : $sum"
}

# 전체 실행이면 이전 실행의 주기 번호 기록을 치워서 새 주기로 시작
if ($Steps -contains 'data' -and $Steps -contains 'complete') {
    $bak = "playwright\.data\backup-$stamp"
    New-Item -ItemType Directory -Force -Path $bak | Out-Null
    foreach ($f in 'pmi-state.json', 'pmi-extra-state.json', 'pmi-complete-state.json', 'pmi-delete-state.json') {
        if (Test-Path "playwright\.data\$f") { Move-Item "playwright\.data\$f" $bak }
    }
    Get-ChildItem $results -Filter *.json -ErrorAction SilentlyContinue | Move-Item -Destination $bak
}

foreach ($s in $Steps) {
    switch ($s) {
        'view'     { Run-Step 'view' 'ad230/pmi-cycle.spec' }
        'data'     {
            # 순서가 필요한 흐름이라 묶음으로 나눠 위에서부터 차례대로
            Run-Step 'data1' 'ad230/pmi-cycle-data' 'TC_018|TC_020|TC_019|TC_021|TC_022'
            Run-Step 'data2' 'ad230/pmi-cycle-data' 'TC_032|TC_033|EC_014|TC_034|TC_038|TC_039|TC_040|TC_041'
            Run-Step 'data3' 'ad230/pmi-cycle-data' 'TC_042|TC_037|TC_035'
            Run-Step 'data4' 'ad230/pmi-cycle-data' 'TC_027|EC_009|EC_015|TC_028'
            Run-Step 'data5' 'ad230/pmi-cycle-data' 'EC_011|EC_013|EC_008|TC_024'
        }
        'extra'    { Run-Step 'extra' 'ad230/pmi-cycle-extra' }
        'complete' { Run-Step 'complete' 'ad230/pmi-cycle-complete' }
        'delete'   { Run-Step 'delete' 'ad230/pmi-cycle-delete' }
        'evidence' { Run-Step 'evidence' 'ad230/evidence' }
        'report'   {
            # 테스트 데이터 목록 → 보고서 정보, 결과 엑셀(회사 양식) → PDF
            Run-Step 'list' 'ad230/tools/list-sychoi'
            $xlsx = "docs\AD230_UT_정기점검주기_$stamp.xlsx"
            python -X utf8 scripts\write-results.py docs\AD230_UT_정기점검주기_양식.xlsx $xlsx $results docs\report\판정기준.json
            python -X utf8 scripts\report-info.py docs\report\보고서정보.json playwright\.data\sychoi-list.json playwright\.data\report-info-$stamp.json
            $json = $xlsx -replace '\.xlsx$', '_결과.json'
            node scripts\make-report.js $json "playwright\.data\report-info-$stamp.json" "docs\report\AD230_정기점검주기_테스트결과보고서_$stamp.pdf"
            Write-Host "엑셀: $xlsx"
            Write-Host "보고서: docs\report\AD230_정기점검주기_테스트결과보고서_$stamp.pdf"
        }
    }
}
