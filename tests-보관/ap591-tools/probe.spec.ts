import { test, Page, Frame } from '@playwright/test';
import fs from 'fs';
import { openMenu, clickTab, settle, Grid, waitFrame } from '../../support/dream';

// 정기점검실행(AP591) 버튼·팝업 동작 살펴보기 (저장하지 않음). EXPLORE=1 일 때만 실행
test.skip(!process.env.EXPLORE, '탐색용');

const out: Record<string, unknown> = {};
const save = () => fs.writeFileSync('playwright/.data/ap591-probe.json', JSON.stringify(out, null, 1));
const texts = (f: Frame) => f.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1500)).catch(() => '');
const popupDump = async (page: Page) => Promise.all(page.frames().filter((f) => /popupIframe/.test(f.name()) && f.url() !== 'about:blank').map(async (f) => ({
  name: f.name(), url: f.url().replace(/^.*\/dream/, '').slice(0, 80), text: await texts(f),
  heads: await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('.hdrcell')].filter((h) => h.offsetWidth > 0).map((h) => h.innerText.trim())).catch(() => []),
  firstRow: await f.evaluate(() => { const tr = [...document.querySelectorAll<HTMLElement>('.objbox tr')].find((t) => t.offsetHeight > 0 && t.querySelector('td')); return tr ? [...tr.querySelectorAll<HTMLElement>('td')].map((td, i) => `${i}:${td.offsetWidth > 0 ? '' : '(숨김)'}${td.innerText.trim()}`) : []; }).catch(() => []),
})));
async function closePopups(page: Page) {
  // 팝업 닫기(X)는 팝업 프레임 안에 있음 → 나중에 열린 팝업부터
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

test('정기점검실행 동작', async ({ page }) => {
  test.setTimeout(480_000);
  try {
    await openMenu(page, ['132', '372', '944']);
    const cal = await waitFrame(page, /workCalPmRInsMonthList_workPmiListView/);
    // 카렌다 칸 구조
    out.calCell = await cal.evaluate(() => {
      const a = [...document.querySelectorAll<HTMLAnchorElement>('a')].find((x) => x.offsetWidth > 0 && /^\d+$/.test(x.innerText.trim()));
      let box: HTMLElement | null = a!;
      for (let i = 0; i < 4 && box; i++) box = box.parentElement;
      return { a: a?.outerHTML, box: box?.outerHTML.slice(0, 1500) };
    });
    out.calLegend = (await texts(cal)).match(/T\s*:.{0,40}/)?.[0];
    // 오늘 칸 첫 숫자(T) 클릭 → 아래 목록
    const firstNum = cal.locator('a:visible', { hasText: /^\s*\d+\s*$/ });
    out.calNums = await firstNum.evaluateAll((as) => as.slice(0, 9).map((a) => ({ t: a.textContent?.trim(), cls: (a.parentElement as HTMLElement).className, href: a.getAttribute('href') })));
    const idx = (await firstNum.allInnerTexts()).findIndex((t) => Number(t) > 0);
    if (!process.env.SKIP_CAL) await firstNum.nth(idx).click();
    await settle(page, 3000);
    out.afterCalClick = { frames: page.frames().filter((f) => f.url() !== 'about:blank' && f.name()).map((f) => f.name()) };
    const g = new Grid(cal, '점검명');
    out.calList = { total: await g.total().catch(() => null), rows: (await g.rows().catch(() => [])).slice(0, 3) };
    await page.screenshot({ path: 'playwright/.data/ap591-calclick.png', fullPage: true });
    save();

    // 목록(조건): 행 클릭 → 상세, 상세보기, 닫기
    await clickTab(page, '목록(조건)');
    const lf = await waitFrame(page, 'tabFrameTAB.workPmiList_workPmiListView');
    out.condDefaults = await lf.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('input[id^="workPmiCommonDTO."]')].filter((e) => e.offsetWidth > 0).map((e) => `${e.id.split('.')[1]}=${e.value}`));
    out.requiredLabels = await lf.evaluate(() => [...document.querySelectorAll<HTMLElement>('label')].filter((l) => l.offsetWidth > 0).map((l) => `${l.innerText.trim()}|${l.className}`));
    await lf.locator('a.b_search:visible').first().click();
    await settle(page, 3000);
    const lg = new Grid(lf, '점검명');
    const rows = await lg.rows();
    await lg.clickCell('점검명', rows[0]['점검명']);
    await settle(page, 3000);
    const d = await waitFrame(page, 'tabFrameTAB.workPmiDetail_workPmiList');
    out.detailTitle = (await texts(d)).slice(0, 200);
    out.closeCandidates = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[class*="close"], [class*="Close"]')].filter((e) => e.offsetWidth > 0).map((e) => `${e.tagName}.${e.className}`)).catch(() => []);
    out.closeInList = await lf.evaluate(() => [...document.querySelectorAll<HTMLElement>('[class*="close"], [class*="Close"]')].filter((e) => e.offsetWidth > 0).map((e) => `${e.tagName}.${e.className}`)).catch(() => []);
    out.closeInDetail = await d.evaluate(() => [...document.querySelectorAll<HTMLElement>('[class*="close"], [class*="Close"]')].filter((e) => e.offsetWidth > 0).map((e) => `${e.tagName}.${e.className}`)).catch(() => []);
    // 상세보기 (목록)
    const winP = page.context().waitForEvent('page', { timeout: 10_000 }).catch(() => null);
    await lf.locator('a:visible', { hasText: /^\s*상세보기\s*$/ }).first().click();
    const win = await winP;
    await settle(win ?? page, 3000);
    out.detailView = win ? { newWindow: true, url: win.url(), frames: win.frames().map((f) => f.name()), text: (await win.evaluate(() => document.body.innerText.slice(0, 300)).catch(() => '')) } : { newWindow: false, popups: await popupDump(page) };
    if (win) { await win.screenshot({ path: 'playwright/.data/ap591-detailview.png' }); await win.close(); } else await closePopups(page);
    save();

    // 상세 Setting
    await d.locator('a:visible', { hasText: /^\s*Setting\s*$/ }).first().click();
    await settle(page, 2500);
    out.detailSetting = await popupDump(page);
    await closePopups(page);
    // 상세 Linked
    await d.locator('a:visible', { hasText: /^\s*Linked\s*$/ }).first().click();
    await settle(page, 1000);
    out.linked = await d.locator('a:visible').evaluateAll((as) => as.map((a) => (a as HTMLElement).innerText.trim()).filter(Boolean));
    await page.keyboard.press('Escape');
    // 목록 Setting (조건 목록, 두 번째 Setting)
    await lf.locator('a:visible', { hasText: /^\s*Setting\s*$/ }).nth(1).click();
    await settle(page, 2500);
    out.listSetting = await popupDump(page);
    await page.screenshot({ path: 'playwright/.data/ap591-listsetting.png' });
    await closePopups(page);
    save();

    // 점검항목 탭 목록: Edit, Setting
    const pl = await waitFrame(page, 'tabFrameTAB.workPmiPointList_workPmiDetail');
    await settle(page, 1500);
    out.pointRows = (await new Grid(pl, '점검항목').rows().catch(() => [])).slice(0, 3);
    out.pointTotal = await new Grid(pl, '점검항목').total().catch(() => null);
    await pl.locator('a:visible', { hasText: /^\s*Setting\s*$/ }).first().click();
    await settle(page, 2500);
    out.pointSetting = await popupDump(page);
    await closePopups(page);
    await pl.locator('a:visible', { hasText: /^\s*Edit\s*$/ }).first().click();
    await settle(page, 1500);
    out.pointEditButtons = await pl.locator('a:visible').evaluateAll((as) => as.map((a) => (a as HTMLElement).innerText.trim()).filter(Boolean));
    out.pointEditMsg = await page.evaluate(() => document.body.innerText.match(/[^\n]*(수정|Edit)[^\n]*모드[^\n]*/)?.[0] ?? '');
    await page.screenshot({ path: 'playwright/.data/ap591-pointedit.png', fullPage: true });
    const cancel = pl.locator('a:visible', { hasText: /^\s*취소\s*$/ }).first();
    if (await cancel.isVisible().catch(() => false)) { await cancel.click(); await settle(page, 1500); out.afterCancel = await pl.locator('a:visible').evaluateAll((as) => as.map((a) => (a as HTMLElement).innerText.trim()).filter(Boolean)); }
    const ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
    if (await ok.isVisible().catch(() => false)) await ok.click();
    // 점검항목 행 클릭 → 점검값 상세
    if ((out.pointRows as unknown[]).length) {
      await new Grid(pl, '점검항목').clickCell('점검항목', (out.pointRows as Record<string, string>[])[0]['점검항목']);
      await settle(page, 2500);
      out.pointDetailFrames = page.frames().filter((f) => /Point.*Detail/.test(f.name()) && f.url() !== 'about:blank').map((f) => f.name());
      for (const f of page.frames().filter((f) => /Point.*Detail/.test(f.name()) && f.url() !== 'about:blank')) {
        out[`pd_${f.name()}`] = { text: (await texts(f)).slice(0, 400), buttons: await f.locator('a:visible').evaluateAll((as) => as.map((a) => (a as HTMLElement).innerText.trim()).filter(Boolean)) };
      }
    }
  } finally {
    save();
  }
});
