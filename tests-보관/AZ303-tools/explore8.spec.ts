import { test } from '@playwright/test';
import fs from 'fs';
import { settle, Grid, clickButton } from '../support/dream';
import { openMenuByPath, listFrame } from '../support/approval';

// 점검Group·순회점검 데이터 흐름, 투자목록 투자절차 Edit 칸 (저장하지 않음)
const OUT = 'playwright/.data/az303-explore/survey8';
const save = (n: string, o: any) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/${n}.json`, JSON.stringify(o, null, 1)); };
const dump = (f: any) => f.evaluate(() => ({
  url: location.pathname,
  buttons: [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.innerText.trim() && /b_|tb_menu/.test(a.className)).map((a) => `${a.innerText.trim()} .${a.className.split(' ')[0]}${a.offsetWidth > 0 ? '' : ' (숨김)'}`),
  heads: [...document.querySelectorAll<HTMLElement>('.hdrcell')].filter((h) => h.offsetWidth > 0).map((h) => h.innerText.trim()),
  rows: [...document.querySelectorAll<HTMLElement>('.objbox tr')].filter((t) => t.offsetHeight > 0).slice(0, 6).map((t) => t.innerText.replace(/\s+/g, ' | ')),
})).catch((e: any) => String(e));

for (const path of [['작업관리', '점검Group', '점검Group주기'], ['작업관리', '점검Group', '점검Group계획'], ['작업관리', '순회점검작업', '순회점검Route설정'], ['작업관리', '순회점검작업', '순회점검계획']]) {
  test(`탐색8 ${path[2]}`, async ({ page }) => {
    test.setTimeout(120_000);
    await openMenuByPath(page, path);
    const out: any[] = [];
    for (const f of page.frames()) if (/\.do/.test(f.url()) && !/index\.do/.test(f.url())) out.push({ name: f.name(), ...(await dump(f)) });
    await page.screenshot({ path: `${OUT}/${path[2]}.png` });
    save(path[2], out);
  });
}

test('탐색8 투자절차 Edit', async ({ page }) => {
  test.setTimeout(180_000);
  const out: any = {};
  await openMenuByPath(page, ['설비도입', '도입목록']);
  const list = await listFrame(page);
  await new Grid(list, '도입명').clickCell('도입명', '[sychoi] 도입 정기 확인 AZ303', { dbl: true });
  await settle(page, 3500);
  const ph = page.frames().find((f) => /invtPhaseList/.test(f.name()))!;
  await clickButton(ph, 'Edit');
  await settle(page, 1500);
  out.cols = await ph.evaluate(() => {
    const w = window as any;
    const g = Object.keys(w).map((k) => { try { return w[k]; } catch { return null; } }).find((o) => o && typeof o.getColType === 'function' && typeof o.getRowsNum === 'function');
    if (!g) return 'grid 없음';
    return [...Array(g.getColumnsNum())].map((_, i) => `${g.getColLabel(i)}:${g.getColType(i)}`);
  });
  out.after = await dump(ph);
  await page.screenshot({ path: `${OUT}/INVT-edit.png`, fullPage: true });
  save('INVT', out);
});
