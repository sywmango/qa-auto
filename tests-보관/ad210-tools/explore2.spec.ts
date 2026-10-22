import { test, Page, Frame } from '@playwright/test';
import fs from 'fs';
import { openMenu, settle, Grid, clickButton } from '../../support/dream';
import { listFields, put, dateAfter } from '../../support/form';

// 정기점검계획 2차 탐색 (읽기만: 팝업은 열고 저장 없이 닫음). EXPLORE=1 일 때만
test.skip(!process.env.EXPLORE, '탐색용');

async function dumpFrame(f: Frame) {
  const buttons = await f.locator('a:visible').evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLElement).innerText.trim()).filter((t) => t && t.length < 20 && !/^\d+$/.test(t)))]).catch(() => []);
  const fields = await listFields(f).catch(() => []);
  const grids = await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('div.gridbox')].filter((g) => g.offsetWidth > 0)
    .map((g) => [...g.querySelectorAll<HTMLElement>('.xhdr .hdrcell')].map((h) => h.innerText.trim()).filter(Boolean).join(','))).catch(() => []);
  const text = await f.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 600)).catch(() => '');
  return { name: f.name(), buttons, fields: fields.map((x) => `${x.label}[${x.id}${x.readonly ? ',ro' : ''}${x.required ? ',req' : ''},${x.kind}]`), grids, text };
}
const live = async (page: Page) => (await Promise.all(page.frames().filter((f) => f.url() !== 'about:blank').map(dumpFrame))).filter((d) => d.buttons.length || d.fields.length || d.grids.length);
const out: Record<string, unknown> = {};
const save = () => fs.writeFileSync('playwright/.data/pmplan-explore2.json', JSON.stringify(out, null, 1));

test('정기점검계획 탐색 2', async ({ page }) => {
  test.setTimeout(420_000);
  page.on('dialog', async (d) => { (out.dialogs ??= [] as string[]) && (out.dialogs as string[]).push(d.message()); await d.dismiss(); });
  await openMenu(page, ['132', '372', '358']);
  out.mainText = (await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))).slice(0, 800);
  const tabNames = ['카렌다(연간)', '카렌다(월간)', '목록(위치)', '목록(종류)', '목록(조건)'];
  for (const t of tabNames) {
    const el = page.getByText(t, { exact: true }).first();
    if (!(await el.count())) { out[`tab:${t}`] = '없음'; continue; }
    await el.click(); await settle(page, 2500);
    out[`tab:${t}`] = await live(page); save();
  }
  // 연간: 일정추가하기 팝업 열고 닫기
  await page.getByText('카렌다(연간)', { exact: true }).first().click(); await settle(page, 2000);
  const yf = page.frames().find((x) => /workCalPmRInsYearList_/.test(x.name()))!;
  const before = page.frames().length;
  const pop = page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null);
  await clickButton(yf, '일정추가하기'); await settle(page, 3000);
  const np = await pop;
  out.addSched = np ? { newWindow: true, url: np.url(), frames: await live(np) } : { newWindow: false, frames: (await live(page)).slice(0), framesAdded: page.frames().length - before };
  save();
  if (np) await np.close();
  // Edit 모드 들어갔다가 확인만
  await openMenu(page, ['132', '372', '358']);
  const yf2 = page.frames().find((x) => /workCalPmRInsYearList_/.test(x.name()))!;
  await clickButton(yf2, 'Edit'); await settle(page, 2000);
  out.edit = await dumpFrame(yf2); save();
  // 목록(조건): 작업계획 상태 행 상세
  await openMenu(page, ['132', '372', '358']);
  await page.getByText('목록(조건)', { exact: true }).first().click(); await settle(page, 2000);
  const f = page.frames().find((x) => /workCalPmRInsPeriodList_/.test(x.name()))!;
  await put(f.locator('[id$="filterStartDate"]').first(), dateAfter(-60));
  await put(f.locator('[id$="filterEndDate"]').first(), dateAfter(400));
  await f.locator('[id$="filterPmDesc"]').first().fill('[sychoi]');
  await f.locator('a.b_search:visible').first().click(); await settle(page, 3000);
  const rows = await new Grid(f, '예방작업번호').rows();
  out.statusCount = rows.reduce((a, r) => ((a[r['일정상태']] = (a[r['일정상태']] ?? 0) + 1), a), {} as Record<string, number>);
  const idx = rows.findIndex((r) => r['일정상태'] === '작업계획');
  if (idx >= 0) {
    out.planRow = rows[idx];
    await f.locator('div.gridbox:visible .objbox tr:visible').filter({ has: f.locator('td') }).nth(idx).locator('td:visible').nth(3).click();
    await settle(page, 3000);
    out.planDetail = await live(page);
  }
  save();
});
