# 결재요청(AZ303) 단위테스트를 실행하고, 두 사이트(oracle·mssql) 결과를 합쳐 결과 엑셀·PDF 보고서를 만듭니다.
#
# 사용법 (D:\qa-auto, PowerShell)
#   .\run-az303.ps1                        oracle 에서 팝업 기능 → 메뉴 27개
#   $env:QA_SITE="mssql"; .\run-az303.ps1  mssql 에서 같은 테스트 (끝나면 Remove-Item Env:QA_SITE)
#   .\run-az303.ps1 menus -Only WORKORDER,OHPLAN    메뉴 일부만
#   .\run-az303.ps1 report                 두 사이트 결과로 엑셀·보고서만 다시
#
# 단계: popup(일일업무일지로 팝업 기능, 기본결재자는 원래대로 되돌림) menus(결재 메뉴 30건) cleanup(끊겨서 요청만 된 [sychoi] 건 승인 마무리) report
# 주의: [sychoi] 문서를 만들어 결재요청하고 결재대기에서 본인(최신영)이 승인해 결재완료로 남깁니다 (되돌릴 수 없음).
#       같은 계정이라 다른 테스트와 동시에 돌리지 마세요. oracle → mssql 순서로 하나씩.

param([string[]]$Steps = @('popup', 'menus'), [string[]]$Only = @())

Set-Location $PSScriptRoot
$env:RUN_AZ303 = '1'
$env:QA_DEBUG = '1'
$site = $env:QA_SITE
$base = if ($site) { "playwright\.data\$site" } else { "playwright\.data" }
$env:QA_AUTH = if ($site) { "playwright\.auth\user-$site-az303.json" } else { 'playwright\.auth\user-az303.json' }
$results = "$base\az303-final"
$logs = "$base\az303-logs"
New-Item -ItemType Directory -Force -Path $results, $logs | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'

function Run-Step($name, $spec) {
    Write-Host "[$(Get-Date -Format HH:mm)] 시작 $name ($(if ($site) { $site } else { 'oracle' }))"
    $env:PLAYWRIGHT_JSON_OUTPUT_NAME = "$results\$name-$stamp.json"
    node node_modules/@playwright/test/cli.js test $spec "--output=test-results-az303-$name" --reporter=line,json *> "$logs\$name-$stamp.log"
    $sum = (Select-String -Path "$logs\$name-$stamp.log" -Pattern '^\s+\d+ (passed|failed|skipped|did not run)' | ForEach-Object { $_.Line.Trim() }) -join ', '
    Write-Host "[$(Get-Date -Format HH:mm)] 끝 $name : $sum"
}

foreach ($s in $Steps) {
    switch ($s) {
        'popup' { Run-Step 'popup' 'tests/az303/popup.spec.ts' }
        'cleanup' { Run-Step 'cleanup' 'tests/az303/cleanup.spec.ts' }
        'menus' {
            if ($Only.Count) { $env:AZ303_ONLY = $Only -join ',' } else { Remove-Item Env:AZ303_ONLY -ErrorAction SilentlyContinue }
            Run-Step 'menus' 'tests/az303/menus.spec.ts'
            Remove-Item Env:AZ303_ONLY -ErrorAction SilentlyContinue
        }
        'report' {
            # 다음 버전 = docs\AZ303 와 이전버전 폴더의 가장 큰 v 번호 + 1
            $n = 1 + (@(Get-ChildItem docs\AZ303 -Recurse -Filter 'AZ303_UT_결재요청_v*.xlsx' | ForEach-Object { if ($_.BaseName -match '_v(\d+)$') { [int]$Matches[1] } }) + 0 | Measure-Object -Maximum).Maximum
            $xlsx = "docs\AZ303\AZ303_UT_결재요청_v$n.xlsx"
            $merged = "docs\AZ303\report\두사이트결과.json"
            python -X utf8 scripts\merge-sites.py $merged "oracle=playwright\.data\az303-final,docs\AZ303\report\판정기준-oracle.json" "mssql=playwright\.data\mssql\az303-final,docs\AZ303\report\판정기준-mssql.json"
            $empty = "$base\az303-empty"
            New-Item -ItemType Directory -Force -Path $empty | Out-Null
            python -X utf8 scripts\write-results.py docs\AZ303\AZ303_UT_결재요청_양식.xlsx $xlsx $empty $merged
            $json = $xlsx -replace '\.xlsx$', '_결과.json'
            node scripts\make-report.js $json docs\AZ303\report\보고서정보.json "docs\AZ303\report\AZ303_결재요청_테스트결과보고서_v$n.pdf"
            Write-Host "엑셀: $xlsx"
            Write-Host "보고서: docs\AZ303\report\AZ303_결재요청_테스트결과보고서_v$n.pdf"
        }
    }
}
