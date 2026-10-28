# 두 QA 사이트(oracle·mssql) 결과를 케이스마다 하나로 합칩니다. (메뉴 공통)
# 사용: python scripts/merge-sites.py <출력.json> oracle=<결과json폴더>[,<판정기준.json>] mssql=<결과json폴더>[,<판정기준.json>]
#  - 결과json 폴더: playwright --reporter=json 결과 파일들 (나중 파일이 앞 파일을 덮어씀)
#  - 판정기준.json: 그 사이트에서 사람이 정한 판정 {ID: {result, text, attach}} (자동 결과를 덮어씀)
# 출력은 write-results.py 의 "수동결과.json" 자리에 넣습니다.
#  - 결과: 한 사이트라도 오류면 오류 (오류 > 개선 > 미수행 > 정상)
#  - 내용: 두 사이트가 같으면 "[oracle·mssql] 내용" 한 번, 다르면 "[oracle] … / [mssql] …" (정상인 사이트는 "정상")
#    (사용자 기준 2026-10-26: UT 문서에 두 서버 결과를 각각 적음, 열은 추가하지 않음)
import json, os, re, sys, glob

ID_RE = r'([A-Z]{2}\d{3}_(?:TC|EC)_\d+)'
RANK = {'오류': 3, '개선': 2, '확인필요': 2, '미수행': 1, '정상': 0}


def walk(suite):
    for s in suite.get('suites', []):
        yield from walk(s)
    for spec in suite.get('specs', []):
        yield spec


def load_site(arg):
    res_dir, *rest = arg.split(',')
    out = {}
    for f in sorted(glob.glob(os.path.join(res_dir, '*.json')), key=os.path.getmtime):
        rep = json.load(open(f, encoding='utf8'))
        for top in rep.get('suites', []):
            for spec in walk(top):
                m = re.match(ID_RE, spec['title'])
                if not m:
                    continue
                for t in spec.get('tests', []):
                    if not t.get('results'):
                        continue
                    r = t['results'][-1]
                    anns = t.get('annotations', []) + r.get('annotations', [])
                    notes = list(dict.fromkeys(a.get('description', '') for a in anns if a.get('type') == '실제결과'))
                    skip = list(dict.fromkeys(a.get('description', '') for a in anns if a.get('type') in ('미수행', 'skip') and a.get('description')))
                    st = r['status']
                    err = re.sub(r'\x1b\[[0-9;]*m', '', (r.get('error') or {}).get('message', '')).split('\n')[0][:200]
                    out[m.group(1)] = {
                        'result': '정상' if st == 'passed' else '미수행' if st == 'skipped' else '오류',
                        'text': '\n'.join(skip if st == 'skipped' else notes + ([f'오류: {err}'] if st != 'passed' and err else [])),
                        'date': r.get('startTime', '')[:10],
                    }
    if rest and os.path.exists(rest[0]):
        for k, v in json.load(open(rest[0], encoding='utf8')).items():
            out[k] = {**out.get(k, {}), **v}
    return out


dst = sys.argv[1]
sites = {}
for a in sys.argv[2:]:
    name, val = a.split('=', 1)
    sites[name] = load_site(val)

merged = {}
for tid in sorted(set().union(*[s.keys() for s in sites.values()])):
    parts = {n: s.get(tid, {'result': '미수행', 'text': '결과 없음'}) for n, s in sites.items()}
    worst = max(parts.values(), key=lambda p: RANK.get(p.get('result', ''), 0))
    texts = {n: ('정상' if p.get('result') == '정상' else (f"[{p['result']}] " if p.get('result') != worst['result'] else '') + p.get('text', '').strip()) for n, p in parts.items()}
    if len(set(texts.values())) == 1 and len(parts) > 1:
        # 두 사이트가 같으면 한 번만, 앞에 [oracle·mssql] (CLAUDE.md 산출물 규칙). 정상은 그대로
        t0 = list(texts.values())[0]
        text = t0 if t0 == '정상' else f"[{'·'.join(parts)}] {t0}"
    else:
        text = '\n'.join(f'[{n}] {t}' for n, t in texts.items())
    merged[tid] = {'result': worst.get('result', '미수행'), 'text': text, 'date': max((p.get('date') or '') for p in parts.values()),
                   'attach': ', '.join(dict.fromkeys(p.get('attach', '') for p in parts.values() if p.get('attach')))}
json.dump(merged, open(dst, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print(f'{len(merged)}건 → {dst}')
