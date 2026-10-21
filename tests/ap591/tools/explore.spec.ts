import { test, Page, Frame } from '@playwright/test';
import fs from 'fs';
import { openMenu, clickTab, settle, Grid } from '../../support/dream';
import { listFields } from '../../support/form';

// 정기점검실행(AP591) 화면 구조 살펴보기 (읽기만, 데이터 안 바꿈). EXPLORE=1 일 때만 실행
test.skip(!process.env.EXPLORE, '탐색용');

async function dumpFrame(f: Frame) {
  const buttons = await f.locator('a:visible').evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLElement).innerText.trim()).filter((t) => t && t.length < 20))]).catch(() => []);
  const fields = await listFields(f).catch(() => []);
  const heads = await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('div.gridbox')].filter((g) => g.offsetWidth > 0)
    .map((g) => [...g.querySelectorAll<HTMLElement>('.xhdr .hdrcell')].map((h) => h.innerText.trim()).filter(Boolean))).catch(() => []);
  const tabs = await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('li a, .tab a, [class*=tab] span')].filter((e) => e.offsetWidth > 0).map((e) => e.innerText.trim()).filter((t) => t && t.length < 20)).catch(() => []);
  return { name: f.name(), url: f.url().replace(/^.*\/dream/, ''), buttons, fields, grids: heads, tabs: [...new Set(tabs)] };
}
const dumpAll = async (page: Page) => Promise.all(page.frames().filter((f) => f.name()).map(dumpFrame));

test('정기점검실행 구조', async ({ page }) => {
  test.setTimeout(300_000);
  const out: Record<string, unknown> = {};
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openMenu(page, ['132', '372', '944']);
  out.topTabs = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('body *')].filter((e) => e.children.length === 0 && e.offsetWidth > 0 && /^목록|^상세|^카렌다|^달력/.test(e.innerText?.trim() || '')).map((e) => e.innerText.trim()).slice(0, 30));
  out.first = await dumpAll(page);
  await page.screenshot({ path: 'playwright/.data/ap591-first.png' });

  // 카렌다(월간): 첫 화면 그대로 검색 후 숫자 칸 하나 눌러 보기
  const cal = page.frames().find((x) => /workCalPmRInsMonthList/.test(x.name()));
  if (cal) {
    await cal.locator('a.b_search:visible').first().click().catch(() => {});
    await settle(page, 3000);
    out.calCells = await cal.evaluate(() => [...document.querySelectorAll<HTMLElement>('td, div')].filter((e) => e.children.length === 0 && /\d+\s*\/\s*\d+\s*\/\s*\d+/.test(e.innerText || '')).map((e) => ({ t: e.innerText.trim(), cls: e.className, tag: e.tagName })).slice(0, 40)).catch(() => []);
    out.calHtml = (await cal.content()).slice(0, 6000);
    await page.screenshot({ path: 'playwright/.data/ap591-cal.png' });
  }

  // 목록(조건) 탭
  const tabNames = ['목록(조건)', '목록'];
  for (const t of tabNames) {
    if (await page.getByText(t, { exact: true }).first().isVisible().catch(() => false)) { await clickTab(page, t); out.listTab = t; break; }
  }
  await settle(page, 2000);
  const lf = page.frames().find((x) => /workPmiList_/.test(x.name()));
  out.listFrame = lf?.name();
  if (lf) {
    await lf.locator('a.b_search:visible').first().click();
    await settle(page, 3000);
    const head = (await dumpFrame(lf)).grids[0]?.[1] ?? '작업명';
    const g = new Grid(lf, head);
    const rows = await g.rows().catch(() => []);
    out.rows = rows.slice(0, 15);
    out.total = await g.total().catch(() => null);
    out.afterSearch = await dumpAll(page);
    await page.screenshot({ path: 'playwright/.data/ap591-list.png' });
    if (rows[0]) {
      const col = Object.keys(rows[0]).find((k) => k && k !== '순번' && rows[0][k]) ?? head;
      await g.clickCell(col, rows[0][col]);
      await settle(page, 3000);
      out.detail = await dumpAll(page);
      await page.screenshot({ path: 'playwright/.data/ap591-detail.png', fullPage: true });
    }
  }
  out.errors = errors;
  fs.writeFileSync('playwright/.data/ap591-explore.json', JSON.stringify(out, null, 1));
});
