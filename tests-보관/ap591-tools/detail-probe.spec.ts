import { test, Page, Frame } from '@playwright/test';
import fs from 'fs';
import { settle } from '../../support/dream';
import { openSetting, settingRow } from '../../support/setting';
import { searchCond } from '../../support/pmexec';

// Setting 목록의 상세보기 폼 구조 (저장하지 않음). EXPLORE=1 일 때만 실행
test.skip(!process.env.EXPLORE, '탐색용');

const dump = (page: Page) => Promise.all(page.frames().filter((f) => f.url() !== 'about:blank' && /popup|maGrdUsr|persPriv/i.test(f.name() + f.url())).map(async (f) => ({
  name: f.name(), url: f.url().replace(/^.*\/dream/, '').slice(0, 60),
  fields: await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('input, textarea, select')].filter((e) => e.offsetWidth > 0).map((e) => {
    const lab = e.closest('.field, tr, li, div')?.querySelector('label')?.innerText.trim() ?? '';
    return `${lab}|${e.tagName}#${e.id}|ro=${(e as HTMLInputElement).readOnly}|${(e as HTMLInputElement).value}|lov=${!!e.parentElement?.querySelector('p.open_spop')}${e.tagName === 'SELECT' ? '|' + [...(e as HTMLSelectElement).options].map((o) => o.text).join('/') : ''}`;
  })).catch(() => []),
  buttons: await f.locator('a:visible').evaluateAll((as) => as.map((a) => (a as HTMLElement).innerText.trim()).filter(Boolean)).catch(() => []),
})));

test('Setting 상세보기 폼', async ({ page }) => {
  test.setTimeout(240_000);
  const out: Record<string, unknown> = {};
  const f = await searchCond(page, { pmNo: '8007' });
  const cf = await openSetting(page, f, 'list');
  await settingRow(cf, 'PMIDESC').locator('img[src*="item_chk"]').click();
  await cf.locator('a:visible', { hasText: /^\s*상세보기\s*$/ }).first().click();
  await settle(page, 2500);
  out.col = await dump(page);
  await page.screenshot({ path: 'playwright/.data/ap591-coldetail.png' });
  // 검색 Field 설정 상세보기
  await page.goto('/dream/index.do');
  const f2 = await searchCond(page, { pmNo: '8007' });
  const sf = await openSetting(page, f2, 'search');
  await settingRow(sf, 'workPmiCommonDTO.filterVendorDesc').locator('img[src*="item_chk"]').click();
  await sf.locator('a:visible', { hasText: /^\s*상세보기\s*$/ }).first().click();
  await settle(page, 2500);
  out.field = await dump(page);
  await page.screenshot({ path: 'playwright/.data/ap591-fielddetail.png' });
  fs.writeFileSync('playwright/.data/ap591-detail-probe.json', JSON.stringify(out, null, 1));
});
