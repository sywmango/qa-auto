import { test } from '@playwright/test';
import fs from 'fs';
import { settle, Grid } from '../support/dream';
import { openMenuByPath, listFrame } from '../support/approval';

// 데이터 준비가 어려운 메뉴: 목록의 행과 상세의 (숨은 것 포함) 결재 버튼을 봄. 읽기만.
const OUT = 'playwright/.data/az303-explore/survey6';
const dumpDetail = (f: any) => f.evaluate(() => ({
  url: location.pathname,
  buttons: [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.innerText.trim() && /b_/.test(a.className)).map((a) => `${a.innerText.trim()} .${a.className.split(' ')[0]}${a.offsetWidth > 0 ? '' : ' (숨김)'}`),
  status: [...document.querySelectorAll<HTMLInputElement>('input')].filter((i) => /status|Status/.test(i.id) && i.offsetWidth > 0).map((i) => `${i.id}=${i.value}`),
})).catch((e: any) => String(e));

async function firstRows(page: any, path: string[], header: string, tab?: string) {
  await openMenuByPath(page, path);
  if (tab) for (const f of page.frames()) { const t = f.getByText(tab, { exact: true }).first(); if (await t.isVisible().catch(() => false)) { await t.click(); await settle(page, 2500); break; } }
  const list = await listFrame(page);
  const g = new Grid(list, header);
  return { list, g, rows: await g.rows().catch(() => []) };
}

const CASES: [string, string[], string, string | undefined][] = [
  ['WOPLAN', ['작업관리', '정기수리작업', '정기수리계획'], '작업명', '기간(조건)'],
  ['PMIGRPRSLT', ['작업관리', '점검Group', '점검Group실행'], '점검명', undefined],
  ['PTRLRESULT', ['작업관리', '순회점검작업', '순회점검실행'], '점검명', '목록'],
  ['INVTLIST', ['설비도입', '도입목록'], '도입명', undefined],
  ['MOCCMTEE', ['변경관리', '변경위원회'], '변경작업명', undefined],
  ['MOCWORK', ['변경관리', '변경작업'], '변경작업명', undefined],
];

for (const [code, path, header, tab] of CASES) {
  test(`탐색6 ${code}`, async ({ page }) => {
    test.setTimeout(240_000);
    fs.mkdirSync(OUT, { recursive: true });
    const out: any = {};
    page.on('dialog', (d) => { (out.dialogs ||= []).push(d.message()); d.dismiss(); });
    const { list, g, rows } = await firstRows(page, path, header, tab);
    out.total = rows.length;
    out.rows = rows.slice(0, 8);
    const mine = rows.find((r) => Object.values(r).some((v) => /sychoi|최신영/.test(v)));
    out.mine = mine ?? null;
    const pick = mine ?? rows[0];
    if (pick) {
      await g.clickCell(header, pick[header], { dbl: true }).catch((e) => (out.openErr = String(e).slice(0, 200)));
      await settle(page, 3500);
      out.details = [];
      for (const f of page.frames()) if (/detail\.do/i.test(f.url())) out.details.push({ name: f.name(), ...(await dumpDetail(f)) });
    }
    await page.screenshot({ path: `${OUT}/${code}.png` });
    fs.writeFileSync(`${OUT}/${code}.json`, JSON.stringify(out, null, 1));
  });
}

test('탐색6 PMINSRSLT 작업발행 점검작업', async ({ page }) => {
  test.setTimeout(180_000);
  const { openWork, myWorks } = await import('../support/pmexec-data');
  const out: any = {};
  const { mine } = await myWorks(page);
  out.mine = mine.map((r: any) => `${r['점검일자']} ${r['점검작업상태']}`);
  const issued = mine.find((r: any) => r['점검작업상태'] === '작업발행');
  if (issued) {
    const { d } = await openWork(page, issued['점검일자']);
    out.detail = await dumpDetail(d);
    await page.screenshot({ path: `${OUT}/PMINSRSLT.png` });
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/PMINSRSLT.json`, JSON.stringify(out, null, 1));
});
