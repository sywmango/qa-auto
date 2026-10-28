import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { settle, Grid } from '../support/dream';
import { DATA_DIR } from '../support/site';
import { openMenuByPath, listFrame } from '../support/approval';

// 증적: 결재완료된 [sychoi] 변경접수 상세의 하위 탭 목록
test('증적 변경접수 하위 탭', async ({ page }) => {
  test.setTimeout(180_000);
  await openMenuByPath(page, ['변경관리', '변경접수']);
  for (const f of page.frames()) { const t = f.getByText('목록(조건)', { exact: true }).first(); if (await t.isVisible().catch(() => false)) { await t.click(); await settle(page, 2500); break; } }
  const list = await listFrame(page);
  const row = (await new Grid(list, '변경작업명').rows()).find((r) => r['변경작업명'].startsWith('[sychoi]') && r['결재진행상태'] === '결재완료')!;
  await list.locator('div.gridbox:visible .objbox tr:visible', { hasText: row['변경요청#'] }).first().locator('td:visible').nth(3).dblclick();
  await settle(page, 3500);
  const det = page.frames().find((f) => /mocRecDetail/.test(f.name()) && f.url() !== 'about:blank')!;
  const tabs = await det.evaluate(() => [...document.querySelectorAll<HTMLElement>('.ac_menu')].map((e) => `${e.innerText.trim()}${e.offsetWidth > 0 ? '' : '(숨김)'}`));
  await det.locator('.ac_menu').last().scrollIntoViewIfNeeded().catch(() => {});
  fs.mkdirSync(path.join(DATA_DIR, 'evidence'), { recursive: true });
  await page.screenshot({ path: path.join(DATA_DIR, 'evidence', 'az303-MOCREC-tabs.png') });
  fs.writeFileSync(path.join(DATA_DIR, 'evidence', 'az303-MOCREC-tabs.txt'), `#${row['변경요청#']} 하위 탭: ${tabs.join(', ')}`);
});
