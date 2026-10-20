import { test } from '@playwright/test';
import fs from 'fs';
import { openMenu, waitFrame, clickTab, settle, Grid } from '../../support/dream';
import { F_COND } from '../../support/pmi';

// [sychoi] 주기 목록 (보고서의 테스트 데이터 목록용, 읽기만)
test('[sychoi] 주기 목록', async ({ page }) => {
  test.setTimeout(180_000);
  await openMenu(page, ['132', '372', '454']);
  await clickTab(page, '목록(조건)');
  const f = await waitFrame(page, F_COND);
  await f.locator('[id="maPmMstrCommonDTO.filterIsActiveDesc"]').fill('');
  await f.locator('[id="maPmMstrCommonDTO.pmDesc"]').fill('[sychoi]');
  await f.locator('a.b_search:visible').first().click();
  await settle(page, 2500);
  const rows = await new Grid(f, '예방작업번호').rows();
  const by: Record<string, { name: string; equips: string[]; active: string }> = {};
  for (const r of rows) {
    const k = r['예방작업번호'];
    by[k] ??= { name: r['작업명'], equips: [], active: r['시행여부'] ?? '' };
    if (r['설비번호']) by[k].equips.push(r['설비번호']);
  }
  fs.writeFileSync('playwright/.data/sychoi-list.json', JSON.stringify(by, null, 1));
  console.log(Object.keys(by).length);
});
