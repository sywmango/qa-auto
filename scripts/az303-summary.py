# playwright json 결과를 한 줄씩 요약 (AZ303 작업 확인용)
import json,sys,io
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
r=json.load(open(sys.argv[1],encoding='utf8'))
def walk(s):
    for x in s.get('suites',[]): yield from walk(x)
    for sp in s.get('specs',[]): yield sp
for top in r['suites']:
    for sp in walk(top):
        for t in sp['tests']:
            if not t['results']: continue
            res=t['results'][-1]
            notes=list(dict.fromkeys(a.get('description','') for a in t.get('annotations',[])+res.get('annotations',[])))
            err=(res.get('error') or {}).get('message','')
            import re; err=re.sub(r'\x1b\[[0-9;]*m','',err)
            print('##',sp['title'][:14],res['status'],'\n  ', ' ;; '.join(notes)[:900].replace('\n',' | '),'\n  ERR:',err.replace('\n',' ')[:500] if err else '')
