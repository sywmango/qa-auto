// 단위테스트 결과 보고서(PDF) 만들기 (메뉴 공통: 제목·메뉴 경로는 추가정보.json 의 title·menuPath)
// 사용: node scripts/make-report.js <결과.json> <추가정보.json> <출력.pdf>
//  - 결과.json: write-results.py 가 만든 <새파일>_결과.json
//  - 추가정보.json: { env: {...}, data: [{no, name, note}], extra: [{title, text}], shots: [{title, path}] }
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const [resFile, infoFile, outFile] = process.argv.slice(2);
const cases = JSON.parse(fs.readFileSync(resFile, 'utf8'));
const info = infoFile && fs.existsSync(infoFile) ? JSON.parse(fs.readFileSync(infoFile, 'utf8')) : {};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const br = (s) => esc(s).replace(/\n/g, '<br>');

// 병합 칸이라 비어 있는 화면명은 위 행 값을 이어 씀
let lastScreen = '';
let lastFunc = '';
for (const c of cases) {
  if (c.screen) lastScreen = c.screen; else c.screen = lastScreen;
  if (c.func) lastFunc = c.func; else c.func = lastFunc;
}

const count = (r) => cases.filter((c) => c.result === r).length;
const sum = { total: cases.length, ok: count('정상'), ng: count('오류'), check: count('개선'), skip: count('미수행'), none: count('미실행') };
const badge = (r) => `<span class="b ${{ 정상: 'ok', 오류: 'ng', 개선: 'ck', 미수행: 'sk' }[r] || 'no'}">${esc(r)}</span>`;
const img = (p) => (fs.existsSync(p) ? `data:image/png;base64,${fs.readFileSync(p).toString('base64')}` : '');

const issues = cases.filter((c) => c.result === '오류' || c.result === '개선');
const skipped = cases.filter((c) => c.result === '미수행' || c.result === '미실행');

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 14mm 12mm; }
body { font-family: 'Malgun Gothic', 'Noto Sans KR', sans-serif; font-size: 10px; color: #1d2433; }
h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 2px solid #1d4ed8; padding-bottom: 3px; }
.sub { color: #555; margin-bottom: 12px; }
table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #c9ced8; padding: 4px 5px; vertical-align: top; text-align: left; }
th { background: #eef2f8; } tr { page-break-inside: avoid; }
.kpi { display: flex; gap: 8px; } .kpi div { flex: 1; border: 1px solid #c9ced8; border-radius: 6px; padding: 8px; text-align: center; }
.kpi b { display: block; font-size: 20px; }
.b { padding: 1px 6px; border-radius: 8px; font-weight: bold; white-space: nowrap; }
.ok { background: #dcfce7; color: #166534; } .ng { background: #fee2e2; color: #991b1b; } .ck { background: #fef3c7; color: #92400e; } .sk, .no { background: #e5e7eb; color: #374151; }
.shot { page-break-inside: avoid; margin: 8px 0; } .shot img { max-width: 100%; border: 1px solid #c9ced8; }
td.t { font-size: 9px; word-break: break-all; }
table.fix { table-layout: fixed; }
</style></head><body>
<h1>${esc(info.title || '정기점검주기(AD230)')} 단위테스트 결과 보고서</h1>
<div class="sub">Dream 4.1 (QA) · ${esc(info.menuPath || '작업관리 > 정기점검작업 > 정기점검주기')} · 작성 ${esc(info.date || new Date().toISOString().slice(0, 10))} · 테스트 ${esc(info.tester || '최신영')}</div>

<h2>1. 요약</h2>
<div class="kpi"><div>전체<b>${sum.total}</b></div><div>정상<b>${sum.ok}</b></div><div>오류<b>${sum.ng}</b></div><div>개선<b>${sum.check}</b></div><div>미수행·미실행<b>${sum.skip + sum.none}</b></div></div>
${info.summary ? `<p>${br(info.summary)}</p>` : ''}

<h2>2. 환경과 범위</h2>
<table>${Object.entries(info.env || {}).map(([k, v]) => `<tr><th style="width:22%">${esc(k)}</th><td>${br(v)}</td></tr>`).join('')}</table>

<h2>3. 오류·개선 항목</h2>
${issues.length ? `<table class="fix"><tr><th style="width:13%">ID</th><th style="width:20%">케이스</th><th style="width:25%">기대결과</th><th>실제결과</th></tr>${issues.map((c) => `<tr><td>${esc(c.id)}<br>${badge(c.result)}</td><td>${br(c.case)}</td><td>${br(c.expected)}</td><td class="t">${br(c.text)}</td></tr>`).join('')}</table>` : '<p>없음</p>'}
${(info.shots || []).map((s) => (img(s.path) ? `<div class="shot"><b>${esc(s.title)}</b><br><img src="${img(s.path)}"></div>` : '')).join('')}

<h2>4. 케이스별 결과</h2>
<table class="fix"><tr><th style="width:13%">ID</th><th style="width:9%">기능</th><th style="width:24%">케이스</th><th style="width:9%">결과</th><th>실제결과</th></tr>
${cases.map((c) => `<tr><td>${esc(c.id)}</td><td>${esc(c.func)}</td><td>${br(c.case)}</td><td>${badge(c.result)}</td><td class="t">${br(c.text)}</td></tr>`).join('')}</table>

${(info.extra || []).length ? `<h2>5. 추가 확인 (테스트 데이터 정리)</h2><table>${info.extra.map((e) => `<tr><th style="width:22%">${esc(e.title)}</th><td class="t" style="width:auto">${br(e.text)}</td></tr>`).join('')}</table>` : ''}

<h2>6. 테스트가 만든 데이터 (삭제하지 않음)</h2>
<table><tr><th>예방작업번호</th><th>작업명</th><th>비고</th></tr>${(info.data || []).map((d) => `<tr><td>${esc(d.no)}</td><td>${esc(d.name)}</td><td>${br(d.note)}</td></tr>`).join('')}</table>

<h2>7. 미수행 사유 (이번 차수 추가 실행 가능 여부)</h2>
${skipped.length ? `<table><tr><th style="width:14%">ID</th><th>케이스</th><th>사유</th></tr>${skipped.map((c) => `<tr><td>${esc(c.id)}</td><td>${br(c.case)}</td><td>${br(c.text || '자동화 대상 아님')}</td></tr>`).join('')}</table>` : '<p>없음</p>'}
</body></html>`;

(async () => {
  const htmlFile = outFile.replace(/\.pdf$/i, '.html');
  fs.writeFileSync(htmlFile, html);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file:///' + path.resolve(htmlFile).replace(/\\/g, '/'));
  await page.pdf({ path: outFile, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#777"><span class="pageNumber"></span> / <span class="totalPages"></span></div>', margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' } });
  await browser.close();
  fs.unlinkSync(htmlFile); // PDF 만들고 나면 중간 HTML 은 지움
  console.log('보고서 →', outFile);
})();
