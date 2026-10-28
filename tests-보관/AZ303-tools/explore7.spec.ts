import { test } from '@playwright/test';
import fs from 'fs';
import { settle, Grid, clickButton, lovContentFrame } from '../support/dream';
import { closePopups } from '../support/setting';
import { openMenuByPath, listFrame } from '../support/approval';

// 변경관리 흐름, 투자목록 진행 상태, 정기수리 작업 만들기 탐색 (저장하지 않음)
const OUT = 'playwright/.data/az303-explore/survey7';
const dump = (f: any) => f.evaluate(() => ({
  url: location.pathname,
  buttons: [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.innerText.trim() && /b_|ac_menu|tb_menu/.test(a.className)).map((a) => `${a.innerText.trim()} .${a.className.split(' ')[0]}${a.offsetWidth > 0 ? '' : ' (숨김)'}`),
  status: [...document.querySelectorAll<HTMLInputElement>('input')].filter((i) => /status|Status/.test(i.id) && i.offsetWidth > 0).map((i) => `${i.id}=${i.value}`),
  heads: [...document.querySelectorAll<HTMLElement>('.hdrcell')].filter((h) => h.offsetWidth > 0).map((h) => h.innerText.trim()),
})).catch((e: any) => String(e));
const save = (n: string, o: any) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/${n}.json`, JSON.stringify(o, null, 1)); };

test('탐색7 변경접수 내 건', async ({ page }) => {
  test.setTimeout(240_000);
  const out: any = {};
  await openMenuByPath(page, ['변경관리', '변경접수']);
  for (const f of page.frames()) { const t = f.getByText('목록(조건)', { exact: true }).first(); if (await t.isVisible().catch(() => false)) { await t.click(); await settle(page, 2500); break; } }
  const list = await listFrame(page);
  const g = new Grid(list, '변경작업명');
  const rows = await g.rows();
  out.rows = rows.filter((r) => /sychoi|1942/.test(r['변경작업명']));
  const mine = rows.find((r) => /sychoi/.test(r['변경작업명']));
  if (mine) {
    await g.clickCell('변경작업명', mine['변경작업명'], { dbl: true });
    await settle(page, 3500);
    out.details = [];
    for (const f of page.frames()) if (/detail\.do|List\.do/i.test(f.url()) && f !== list) out.details.push({ name: f.name(), ...(await dump(f)) });
  }
  await page.screenshot({ path: `${OUT}/MOCREC.png`, fullPage: true });
  save('MOCREC', out);
});

test('탐색7 투자목록 투자절차', async ({ page }) => {
  test.setTimeout(240_000);
  const out: any = {};
  await openMenuByPath(page, ['설비도입', '도입목록']);
  const list = await listFrame(page);
  const g = new Grid(list, '도입명');
  await g.clickCell('도입명', '[sychoi] 도입 정기 확인 AZ303', { dbl: true });
  await settle(page, 3500);
  out.details = [];
  for (const f of page.frames()) if (/invt/i.test(f.url()) && f !== list) out.details.push({ name: f.name(), ...(await dump(f)) });
  // 투자절차 첫 행 상세보기
  const proc = page.frames().find((f) => /invtPhase|InvtPhase|invtPrc/i.test(f.url()) || /투자절차/.test(f.name()));
  out.procFrame = proc?.name();
  await page.screenshot({ path: `${OUT}/INVTLIST.png`, fullPage: true });
  save('INVTLIST', out);
});

test('탐색7 수리작업실행 정기수리 작업형태', async ({ page }) => {
  test.setTimeout(180_000);
  const out: any = {};
  await openMenuByPath(page, ['작업관리', '수리작업', '수리작업실행']);
  const list = await listFrame(page);
  await clickButton(list, '생성');
  await settle(page, 3000);
  const lov = await lovContentFrame(page);
  await lov.locator('div.gridbox:visible .objbox td:visible', { hasText: /^\s*정기수리\s*$/ }).first().click();
  await settle(page, 1500);
  out.text = await lov.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 800));
  await page.screenshot({ path: `${OUT}/WO-PM.png` });
  await closePopups(page);
  save('WO-PM', out);
});
