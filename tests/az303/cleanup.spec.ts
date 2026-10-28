import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { Grid, settle } from '../support/dream';
import { put } from '../support/form';
import { DATA_DIR } from '../support/site';
import { openMenuByPath, listFrame, approveInInbox } from '../support/approval';

// 결재요청(AZ303) 뒷정리: 중간에 끊겨 요청만 되고 결재하지 못한 [sychoi] 건을 결재대기에서 승인해 마무리.
// 그리고 정기수리계획(WOPLAN) 요청타입 증적 캡처 (결재요청내역을 제목으로 걸러서)
test.setTimeout(900_000);

test('AZ303 뒷정리 — 남은 [sychoi] 결재대기 승인', async ({ page }) => {
  await openMenuByPath(page, ['개인설정', '결재대기']);
  const left = (await new Grid(await listFrame(page), '요청일자').rows()).filter((r) => r['제목'].startsWith('[sychoi]')).map((r) => r['제목']);
  const done: string[] = [];
  for (const t of [...new Set(left)]) done.push(`${t}: 승인 ${await approveInInbox(page, t)}번`);
  test.info().annotations.push({ type: '실제결과', description: done.join('\n') || '남은 건 없음' });
});

test('AZ303 증적 — 정기수리계획 요청타입', async ({ page }) => {
  await openMenuByPath(page, ['개인설정', '결재요청내역']);
  const list = await listFrame(page);
  const g = new Grid(list, '제목');
  const row = (await g.rows()).find((r) => /AZ303 WOPLAN \d/.test(r['제목']));
  if (!row) return;
  await list.locator('div.gridbox:visible .objbox td:visible', { hasText: row['제목'] }).first().scrollIntoViewIfNeeded();
  await list.locator('div.gridbox:visible .objbox td:visible', { hasText: row['제목'] }).first().click();
  await settle(page, 800);
  fs.mkdirSync(path.join(DATA_DIR, 'evidence'), { recursive: true });
  await page.screenshot({ path: path.join(DATA_DIR, 'evidence', 'az303-WOPLAN-type.png') });
  void put;
});
