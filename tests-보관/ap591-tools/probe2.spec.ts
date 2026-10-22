import { test, Page, Frame } from '@playwright/test';
import fs from 'fs';
import { openMenu, clickTab, settle, waitFrame, Grid } from '../../support/dream';

// 정기점검실행(AP591) Setting 팝업 칸 구조 살펴보기 (저장하지 않음). EXPLORE=1 일 때만 실행
test.skip(!process.env.EXPLORE, '탐색용');

const out: Record<string, unknown> = {};
const save = () => fs.writeFileSync('playwright/.data/ap591-probe2.json', JSON.stringify(out, null, 1));
const rowsOf = (f: Frame) => f.evaluate(() => {
  const heads = [...document.querySelectorAll<HTMLElement>('.xhdr table.hdr tr')].find((t) => t.querySelector('.hdrcell'));
  const h = heads ? [...heads.querySelectorAll<HTMLElement>('td')].map((td, i) => `${i}:${td.innerText.trim()}${td.offsetWidth > 0 ? '' : '(숨김)'}`) : [];
  const rows = [...document.querySelectorAll<HTMLTableRowElement>('div.gridbox .objbox tr')].filter((tr) => tr.offsetHeight > 0 && tr.querySelector('td'))
    .map((tr) => [...tr.querySelectorAll<HTMLElement>('td')].map((td, i) => `${i}:${td.innerText.trim()}${td.offsetWidth > 0 ? '' : '(숨김)'}`).join(' | '));
  return { h, rows, buttons: [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.offsetWidth > 0).map((a) => a.innerText.trim()).filter(Boolean) };
}).catch((e) => ({ err: String(e) }));
async function closePopups(page: Page) {
  for (let i = 0; i < 3; i++) {
    const pops = page.frames().filter((f) => /popupIframe/.test(f.name()) && f.url() !== 'about:blank').reverse();
    let closed = false;
    for (const f of pops) {
      const x = f.locator('div.b_pwin_close:visible').first();
      if (await x.isVisible().catch(() => false)) { await x.click().catch(() => {}); closed = true; await settle(page, 800); break; }
    }
    if (!closed) break;
  }
}
const popFrames = (page: Page) => page.frames().filter((f) => f.url() !== 'about:blank' && /persPriv|maGrdUsr/.test(f.url()));

test('Setting 칸 구조', async ({ page }) => {
  test.setTimeout(300_000);
  try {
    await openMenu(page, ['132', '372', '944']);
    const cal = await waitFrame(page, /workCalPmRInsMonthList_workPmiListView/);
    // 카렌다(월간) 검색 Setting → Field, Tab
    await cal.locator('a:visible', { hasText: /^\s*Setting\s*$/ }).first().click();
    await settle(page, 2500);
    for (const f of popFrames(page)) out[`calSearch_${f.name()}`] = await rowsOf(f);
    await page.frames().find((x) => x.name() === 'popupIframe1')!.locator('a', { hasText: 'Tab 설정' }).click();
    await settle(page, 2500);
    for (const f of popFrames(page)) out[`calTab_${f.name()}`] = await rowsOf(f);
    await closePopups(page);
    save();
    await clickTab(page, '목록(조건)');
    const lf = await waitFrame(page, 'tabFrameTAB.workPmiList_workPmiListView');
    await lf.locator('a:visible', { hasText: /^\s*Setting\s*$/ }).first().click();
    await settle(page, 2500);
    await page.frames().find((x) => x.name() === 'popupIframe1')!.locator('a', { hasText: 'Tab 설정' }).click();
    await settle(page, 2500);
    for (const f of popFrames(page)) out[`condTab_${f.name()}`] = await rowsOf(f);
    await closePopups(page);
    // 목록 Setting 칼럼
    await lf.locator('a:visible', { hasText: /^\s*Setting\s*$/ }).nth(1).click();
    await settle(page, 2500);
    for (const f of popFrames(page)) out[`condList_${f.name()}`] = await rowsOf(f);
    await page.screenshot({ path: 'playwright/.data/ap591-collist.png' });
    await closePopups(page);
    save();
    // 상세 Setting
    await lf.locator('a.b_search:visible').first().click();
    await settle(page, 3000);
    const g = new Grid(lf, '점검명');
    await g.clickCell('점검명', (await g.rows())[0]['점검명']);
    await settle(page, 3000);
    const d = await waitFrame(page, 'tabFrameTAB.workPmiDetail_workPmiList');
    await d.locator('a:visible', { hasText: /^\s*Setting\s*$/ }).first().click();
    await settle(page, 2500);
    for (const f of popFrames(page)) out[`detail_${f.name()}`] = await rowsOf(f);
    await page.frames().find((x) => x.name() === 'popupIframe1')!.locator('a', { hasText: 'Tab 설정' }).click();
    await settle(page, 2500);
    for (const f of popFrames(page)) out[`detailTab_${f.name()}`] = await rowsOf(f);
    await closePopups(page);
    save();
    // 점검값 상세 Setting
    const pl = await waitFrame(page, 'tabFrameTAB.workPmiPointList_workPmiDetail');
    await settle(page, 1500);
    const pg = new Grid(pl, '점검항목');
    await pg.clickCell('점검항목', (await pg.rows())[0]['점검항목']);
    await settle(page, 2500);
    const pd = await waitFrame(page, 'tabFrameTAB.workPmiPointValueDetail_workPmiPointList');
    out.pdFields = await pd.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('input[id*="DTO"], textarea[id*="DTO"]')].filter((e) => e.offsetWidth > 0).map((e) => `${e.id}|ro=${e.readOnly}|${e.value}`));
    out.pdClose = await pd.evaluate(() => [...document.querySelectorAll<HTMLElement>('[class*="close"]')].filter((e) => e.offsetWidth > 0).map((e) => e.className));
    await pd.locator('a:visible', { hasText: /^\s*Setting\s*$/ }).first().click();
    await settle(page, 2500);
    for (const f of popFrames(page)) out[`pd_${f.name()}`] = await rowsOf(f);
    await closePopups(page);
    // 점검결과 Lov
    const lovBtn = pd.locator('[id$="pmPointRsltStatusDesc"]').locator('xpath=..').locator('p.open_spop').first();
    if (await lovBtn.isVisible().catch(() => false)) {
      await lovBtn.click(); await settle(page, 2000);
      for (const f of page.frames().filter((x) => /popupIframe/.test(x.name()) && x.url() !== 'about:blank')) out[`rsltLov_${f.name()}`] = await rowsOf(f);
      await closePopups(page);
    }
  } finally { save(); }
});
