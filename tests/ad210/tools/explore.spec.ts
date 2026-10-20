import { test, Page, Frame } from '@playwright/test';
import fs from 'fs';
import { openMenu, clickTab, settle, Grid } from '../../support/dream';
import { listFields, put, dateAfter } from '../../support/form';

// 정기점검계획 화면 구조 살펴보기 (읽기만, 데이터 안 바꿈). EXPLORE=1 일 때만 실행
test.skip(!process.env.EXPLORE, '탐색용');

async function dumpFrame(f: Frame) {
  const buttons = await f.locator('a:visible').evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLElement).innerText.trim()).filter((t) => t && t.length < 20))]);
  const fields = await listFields(f).catch(() => []);
  const heads = await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('div.gridbox')].filter((g) => g.offsetWidth > 0)
    .map((g) => [...g.querySelectorAll<HTMLElement>('.xhdr .hdrcell')].map((h) => h.innerText.trim()).filter(Boolean))).catch(() => []);
  const tabs = await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('li a, .tab a, [class*=tab] span')].filter((e) => e.offsetWidth > 0).map((e) => e.innerText.trim()).filter((t) => t && t.length < 20)).catch(() => []);
  return { name: f.name(), url: f.url().replace(/^.*\/dream/, ''), buttons, fields, grids: heads, tabs: [...new Set(tabs)] };
}
const dumpAll = async (page: Page) => Promise.all(page.frames().filter((f) => f.name()).map(dumpFrame));

test('정기점검계획 구조', async ({ page }) => {
  test.setTimeout(240_000);
  const out: Record<string, unknown> = {};
  await openMenu(page, ['132', '372', '358']);
  out.topTabs = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('body *')].filter((e) => e.children.length === 0 && e.offsetWidth > 0 && /^목록|^상세|^달력|^일정/.test(e.innerText?.trim() || '')).map((e) => e.innerText.trim()).slice(0, 30));
  out.first = await dumpAll(page);
  await clickTab(page, '목록(조건)');
  const f = page.frames().find((x) => /workCalPmRInsPeriodList_/.test(x.name()))!;
  await put(f.locator('[id$="filterStartDate"]').first(), dateAfter(-60));
  await put(f.locator('[id$="filterEndDate"]').first(), dateAfter(400));
  const desc = f.locator('[id$="filterPmDesc"], [id$="pmDesc"]').first();
  if (await desc.count()) await desc.fill('[sychoi]');
  await f.locator('a.b_search:visible').first().click();
  await settle(page, 3000);
  const g = new Grid(f, '예방작업번호');
  const rows = await g.rows();
  out.condRows = rows.slice(0, 15);
  out.condTotal = await g.total();
  out.afterSearch = await dumpAll(page);
  const pick = rows.find((r) => r['일정상태'] && !/완료|발행/.test(r['일정상태'])) ?? rows[0];
  if (pick) {
    out.picked = pick;
    await g.clickCell('예방작업번호', pick['예방작업번호']);
    await settle(page, 3000);
    out.detail = await dumpAll(page);
  }
  fs.writeFileSync('playwright/.data/pmplan-explore.json', JSON.stringify(out, null, 1));
});
