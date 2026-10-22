import { test, Page, Frame } from '@playwright/test';
import fs from 'fs';
import { settle, waitFrame, Grid } from '../../support/dream';
import { openSetting, openTabSetting, checkAndClick, editSettingRow, settingRow, gridHeaders, searchLabels } from '../../support/setting';
import { F_POINT, F_POINT_VALUE, searchCond, loadAll, clickRow, detailOf, frameReady } from '../../support/pmexec';

// Setting 테스트가 중간에 멈춘 뒤 상태 확인·되돌리기 + Edit 칸 구조 살펴보기. EXPLORE=1 일 때만 실행
test.skip(!process.env.EXPLORE, '탐색용');

const out: Record<string, unknown> = {};
const save = () => fs.writeFileSync('playwright/.data/ap591-restore.json', JSON.stringify(out, null, 1));
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
async function workDetail(page: Page) {
  const f = await searchCond(page, { pmNo: '8007' });
  const rows = await loadAll(page, f);
  await clickRow(f, rows.findIndex((r) => r['설비번호'] === '100302AG13' && r['점검작업상태'] === '작업발행'));
  return detailOf(page, 'cond');
}
const tabsOf = (d: Frame) => d.evaluate(() => [...new Set([...document.querySelectorAll<HTMLElement>('a, span, li')].filter((e) => e.offsetWidth > 0 && /^(점검항목|표준작업|첨부문서)\s*\d*$/.test(e.innerText.trim())).map((e) => e.innerText.trim().replace(/\d+$/, '')))]);
const rowTexts = (f: Frame, key: string) => settingRow(f, key).locator('td').allInnerTexts();

test('Setting 되돌리기·Edit 칸 구조', async ({ page }) => {
  test.setTimeout(480_000);
  try {
    // 1) 상세 Tab 설정: 첨부문서 Y
    let d = await workDetail(page);
    out.tabsBefore = await tabsOf(d);
    await openSetting(page, d, 'search');
    let tf = await openTabSetting(page);
    out.tabRow = await rowTexts(tf, 'maPtDocLibList');
    if ((out.tabRow as string[])[3] !== 'Y') await editSettingRow(page, tf, 'maPtDocLibList', { 3: 'Y' });
    await closePopups(page);
    d = await workDetail(page);
    out.tabsAfter = await tabsOf(d);
    // 2) 상세 Field 설정: 비고 Display / 이름 / 정렬값
    const sf = await openSetting(page, d, 'search');
    out.remarkRow = await rowTexts(sf, 'workPmiDetailDTO.remark');
    // Edit 칸 구조: 화면표시명 칸
    await settingRow(sf, 'workPmiDetailDTO.remark').locator('img[src*="item_chk"]').click();
    await sf.locator('a:visible', { hasText: /^\s*Edit\s*$/ }).first().click();
    await settle(page, 1500);
    const cell3 = settingRow(sf, 'workPmiDetailDTO.remark').locator('td').nth(3);
    out.cell3Before = await cell3.evaluate((e) => e.outerHTML.slice(0, 300));
    await cell3.click(); await page.waitForTimeout(500);
    out.cell3Click = await cell3.evaluate((e) => e.outerHTML.slice(0, 400));
    await cell3.dblclick(); await page.waitForTimeout(500);
    out.cell3Dbl = await cell3.evaluate((e) => e.outerHTML.slice(0, 400));
    out.activeEl = await sf.evaluate(() => { const a = document.activeElement as HTMLElement; return a ? `${a.tagName}.${a.className}#${a.id} parent=${a.parentElement?.tagName}.${a.parentElement?.className}` : ''; });
    out.visibleInputs = await sf.evaluate(() => [...document.querySelectorAll<HTMLElement>('input, textarea, select')].filter((e) => e.offsetWidth > 0).map((e) => `${e.tagName}#${e.id}.${e.className} val=${(e as HTMLInputElement).value} in=${e.closest('td') ? 'td' : e.parentElement?.className}`));
    await page.screenshot({ path: 'playwright/.data/ap591-edit-probe.png' });
    await closePopups(page);
    d = await workDetail(page);
    const sf2 = await openSetting(page, d, 'search');
    const rr = await rowTexts(sf2, 'workPmiDetailDTO.remark');
    if (rr[5] === 'N') await checkAndClick(page, sf2, 'workPmiDetailDTO.remark', 'Show Fields');
    await closePopups(page);
    d = await workDetail(page);
    out.detailLabels = await searchLabels(d);
    save();

    // 3) 목록 Setting 정렬 칸 구조 (PMIDESC td7)
    const f = await searchCond(page, { pmNo: '8007' });
    const cf = await openSetting(page, f, 'list');
    out.pmiRow = await rowTexts(cf, 'PMIDESC');
    out.shiftRow = await rowTexts(cf, 'SHIFTTYPEDESC');
    await settingRow(cf, 'PMIDESC').locator('img[src*="item_chk"]').click();
    await cf.locator('a:visible', { hasText: /^\s*Edit\s*$/ }).first().click();
    await settle(page, 1500);
    const c7 = settingRow(cf, 'PMIDESC').locator('td').nth(7);
    await c7.click(); await page.waitForTimeout(600);
    out.c7Click = await c7.evaluate((e) => e.outerHTML.slice(0, 400));
    out.c7Inputs = await cf.evaluate(() => [...document.querySelectorAll<HTMLElement>('input, textarea, select, .dhx_combo_box, div[class*=combo]')].filter((e) => e.offsetWidth > 0).map((e) => `${e.tagName}#${e.id}.${e.className} ${e.tagName === 'SELECT' ? [...(e as HTMLSelectElement).options].map((o) => o.text).join('/') : ''}`));
    const c13 = settingRow(cf, 'PMIDESC').locator('td').nth(13);
    await c13.click(); await page.waitForTimeout(600);
    out.c13Click = await c13.evaluate((e) => e.outerHTML.slice(0, 400));
    out.c13Inputs = await cf.evaluate(() => [...document.querySelectorAll<HTMLElement>('input, textarea, select, div[class*=combo]')].filter((e) => e.offsetWidth > 0).map((e) => `${e.tagName}#${e.id}.${e.className} ${e.tagName === 'SELECT' ? [...(e as HTMLSelectElement).options].map((o) => o.text).join('/') : ''}`));
    await page.screenshot({ path: 'playwright/.data/ap591-edit-probe2.png' });
    await closePopups(page);
    save();

    // 4) 점검항목 목록 칼럼, 점검값 상세 필드 상태
    await workDetail(page);
    const pl = await waitFrame(page, F_POINT);
    await settle(page, 1500);
    out.pointHeaders = await gridHeaders(pl);
    await pl.locator('a:visible', { hasText: /^\s*Setting\s*$/ }).first().click();
    await settle(page, 2500);
    const pc = await waitFrame(page, 'tabFrameTAB.maGrdUsrColList_maGrdUsrDetail');
    out.pointColRows = await pc.evaluate(() => [...document.querySelectorAll<HTMLTableRowElement>('div.gridbox .objbox tr')].filter((tr) => tr.offsetHeight > 0 && tr.querySelector('td')).map((tr) => [...tr.querySelectorAll<HTMLElement>('td')].filter((td) => td.offsetWidth > 0).map((td) => td.innerText.trim()).join('|')));
    await closePopups(page);
    const g = new Grid(pl, '점검항목');
    await g.clickCell('점검항목', (await g.rows())[0]['점검항목']);
    const pd = await frameReady(page, F_POINT_VALUE);
    out.pdLabels = await searchLabels(pd);
  } finally { save(); }
});
