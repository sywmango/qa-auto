import { test } from '@playwright/test';
import fs from 'fs';
import { settle, clickButton } from '../support/dream';
import { closePopups } from '../support/setting';
import { openMenuByPath, listFrame } from '../support/approval';

test('탐색11 계측기 Revision 팝업 HTML', async ({ page }) => {
  test.setTimeout(120_000);
  await openMenuByPath(page, ['설비자산', '계측기']);
  await clickButton(await listFrame(page), '생성');
  await settle(page, 3000);
  const pop = page.frames().find((f) => f.url().includes('RevRegislate'))!;
  fs.writeFileSync('playwright/.data/az303-explore/rev-popup.html', await pop.content());
  fs.writeFileSync('playwright/.data/az303-explore/rev-main.html', await page.content());
  await closePopups(page);
});
