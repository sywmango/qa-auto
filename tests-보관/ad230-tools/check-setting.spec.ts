import { test } from '@playwright/test';
import { openMenu, waitFrame, clickTab, settle, Grid } from '../../support/dream';
import { openSetting, openTabSetting, settingRowTexts, resetSetting, gridHeaders, searchLabels, listLength } from '../../support/setting';

// Setting 이 원래 값인지 확인 (탭이 숨겨져 있으면 초기화)
test('check setting', async ({ page }) => {
  test.setTimeout(180_000);
  const open = async () => { await openMenu(page, ['132', '372', '454']); await clickTab(page, '목록(조건)'); return waitFrame(page, 'tabFrameTAB.workPmListInsList_workPmiMstr'); };
  let f = await open();
  console.log('HEAD', (await gridHeaders(f)).join(','));
  console.log('LABELS', (await searchLabels(f)).join(','));
  await openSetting(page, f, 'list');
  console.log('LEN', await listLength(page));
  f = await open();
  await openSetting(page, f, 'search');
  let tf = await openTabSetting(page);
  const row = await settingRowTexts(tf, 'workPmListRInsDetail');
  console.log('TAB', row.join('|'));
  if (row.includes('N')) { await resetSetting(page, tf); console.log('TAB after reset', (await settingRowTexts(tf, 'workPmListRInsDetail')).join('|')); }
  f = await open();
  const g = new Grid(f, '예방작업번호');
  const name = (await g.rows())[0]['작업명'];
  await g.clickCell('작업명', name);
  await settle(page, 4000);
  console.log('DETAIL', page.frames().some((x) => x.name() === 'tabFrameTAB.workPmListRInsDetail_workPmListInsList'));
  await page.screenshot({ path: 'playwright/.data/setting-check.png' });
});
