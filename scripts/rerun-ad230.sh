#!/usr/bin/env bash
# AD230 전체 재실행 (단계별 JSON 결과는 playwright/.data/results-v13, 로그는 $LOG_DIR)
cd "$(dirname "$0")/.."
R=playwright/.data/results-v13
LOG_DIR=${LOG_DIR:-playwright/.data/logs-v13}
mkdir -p "$R" "$LOG_DIR"
run() { # 이름, 제한(초), 스펙, -g 패턴
  local name=$1 limit=$2 spec=$3 grep=$4
  echo "[$(TZ=Asia/Seoul date +%H:%M)] 시작 $name" >> "$LOG_DIR/progress.txt"
  PLAYWRIGHT_JSON_OUTPUT_NAME="$R/$name.json" QA_DEBUG=1 timeout "$limit" npx playwright test "$spec" ${grep:+-g "$grep"} --reporter=line,json > "$LOG_DIR/$name.log" 2>&1
  for d in test-results/*/; do [ -f "$d/test-failed-1.png" ] && cp "$d/test-failed-1.png" "playwright/.data/evidence/v13-$(basename "$d" | cut -c1-60).png"; done
  echo "[$(TZ=Asia/Seoul date +%H:%M)] 끝 $name: $(grep -aE '^  [0-9]+ (passed|failed)|^  [0-9]+ (skipped|flaky)' "$LOG_DIR/$name.log" | tr -s ' ' | tr '\n' ' ')" >> "$LOG_DIR/progress.txt"
}
for phase in "$@"; do
  case $phase in
    view)     run view 1500 pmi-cycle.spec ;;
    data1)    run data1 2400 pmi-cycle-data "TC_018|TC_020|TC_019|TC_021|TC_022" ;;
    data2)    run data2 2400 pmi-cycle-data "TC_032|TC_033|EC_014|TC_034|TC_038|TC_039|TC_040|TC_041" ;;
    data3)    run data3 2400 pmi-cycle-data "TC_042|TC_037|TC_035" ;;
    data4)    run data4 2400 pmi-cycle-data "TC_027|EC_009|EC_015|TC_028" ;;
    data5)    run data5 2400 pmi-cycle-data "EC_011|EC_013|EC_008|TC_024" ;;
    extra)    run extra 3600 pmi-cycle-extra ;;
    complete) run complete 3600 pmi-cycle-complete ;;
    delete)   run delete 1500 pmi-cycle-delete ;;
    evidence) run evidence 1500 _evidence ;;
  esac
done
echo "[$(TZ=Asia/Seoul date +%H:%M)] 전체 끝" >> "$LOG_DIR/progress.txt"
