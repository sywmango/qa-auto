import { test } from '@playwright/test';
import fs from 'fs';
import { settle, clickButton } from '../support/dream';
import { openApproval, setApprover, confirmOk } from '../support/approval';
import { state, openDayLog, createDayLog } from '../support/az303-data';

// MSSQL: 결재자 목록 [저장] 이 저장되지 않는 원인 (요청·응답 기록), 새 문서 [승인요청] 팝업이 안 뜨는 원인
test('탐색17 결재자 저장 요청·응답', async ({ page }) => {
  test.setTimeout(300_000);
  const log: string[] = [];
  page.on('response', async (r) => { if (/\.do/.test(r.url()) && r.request().method() === 'POST') log.push(`${r.status()} ${r.url().split('/').pop()?.slice(0, 80)} :: ${(r.request().postData() || '').slice(0, 300)} => ${(await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)}`); });
  page.on('dialog', (d) => { log.push('DIALOG ' + d.message()); d.accept(); });
  const det = await openDayLog(page, state.A);
  const { grid } = await openApproval(page, det);
  log.push('---- set approver');
  await setApprover(page, grid, '2', 1, '최신영');
  log.push('---- click 저장');
  await clickButton(grid, '저장');
  await settle(page, 1000);
  await confirmOk(page);
  await settle(page, 3000);
  await page.screenshot({ path: 'playwright/.data/az303-explore/ms-save.png' });
  log.push('---- new doc popup');
  const t = await createDayLog(page);
  const d2 = await openDayLog(page, t);
  await d2.locator('a.b_approval:visible').click();
  await settle(page, 15000);
  await page.screenshot({ path: 'playwright/.data/az303-explore/ms-newpop.png' });
  fs.writeFileSync('playwright/.data/az303-explore/ms-save.txt', log.join('\n'));
});
