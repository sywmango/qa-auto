# 보고서 정보(보고서정보.json)에 이번 실행의 테스트 데이터 목록을 넣어 새 파일로 저장합니다.
# 사용: python scripts/report-info.py <보고서정보.json> <sychoi-list.json> <출력.json>
#  - sychoi-list.json: tests/ad230/tools/list-sychoi.spec.ts 가 만든 [sychoi] 주기 목록
import json, sys, datetime

info_path, list_path, out_path = sys.argv[1:4]
info = json.load(open(info_path, encoding='utf8'))
rows = json.load(open(list_path, encoding='utf8'))
info['date'] = datetime.date.today().isoformat()
fixed = [d for d in info.get('data', []) if not str(d.get('no', '')).isdigit()]  # 기준 데이터 등 번호가 아닌 줄은 유지
info['data'] = [
    {'no': no, 'name': r['name'], 'note': f"설비 {', '.join(r['equips']) or '-'}, 시행여부 {r.get('active') or '-'}"}
    for no, r in sorted(rows.items())
] + fixed
json.dump(info, open(out_path, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print(f'테스트 데이터 {len(rows)}건 → {out_path}')
