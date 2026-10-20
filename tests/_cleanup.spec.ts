import { test, Page } from '@playwright/test';
import fs from 'fs';
import { openMenu, waitFrame, clickButton, clickTab, settle, Grid } from './support/dream';
import { put, popupMessage } from './support/form';
import { F_COND } from './support/pmi';

// 테스트가 만든 정기점검주기 정리 (사용자 지시 2026-10-20: 삭제할 수 있는 것은 삭제 후 다시 생성)
// 대상: playwright/.data/pmi-created.json 에 기록된 번호 중 작업명이 [sychoi] 로 시작하는 것만.
// 작업이 발행·완료된 계획이 있는 주기는 지우지 않고 남김. DRY=1 이면 목록만 확인.
const DRY = !!process.env.DRY;
const OUT = 'playwright/.data/cleanup-result.json';
const created: string[] = JSON.parse(fs.readFileSync('playwright/.data/pmi-created.json', 'utf8'));
const result: Record<string, string> = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const saveResult = () => fs.writeFileSync(OUT, JSON.stringify(result, null, 1));

async function listRow(page: Page, pmNo: string) {
  await openMenu(page, ['132', '372', '454']);
  await clickTab(page, '목록(조건)');
  const f = await waitFrame(page, F_COND);
  await f.locator('[id="maPmMstrCommonDTO.filterIsActiveDesc"]').fill('');
  await f.locator('[id="maPmMstrCommonDTO.pmNo"]').fill(pmNo);
  await f.locator('a.b_search:visible').first().click();
  await settle(page, 2000);
  const rows = (await new Grid(f, '예방작업번호').rows()).filter((r) => r['예방작업번호'] === pmNo);
  return { f, rows };
}

async function planFrame(page: Page, pmNo: string) {
  await openMenu(page, ['132', '372', '358']);
  await clickTab(page, '목록(조건)');
  const f = page.frames().find((x) => /workCalPmRInsPeriodList_/.test(x.name()))!;
  await put(f.locator('[id$="filterStartDate"]').first(), '2026-01-01');
  await put(f.locator('[id$="filterEndDate"]').first(), '2028-12-31');
  await f.locator('[id$="filterPmNo"]').first().fill(pmNo);
  await page.keyboard.press('Escape');
  await f.locator('a.b_search:visible').first().click({ force: true });
  await settle(page, 2500);
  const rows = (await new Grid(f, '예방작업번호').rows()).filter((r) => r['예방작업번호'] === pmNo);
  return { f, rows };
}

/** 확인창(OK) 또는 브라우저 confirm 수락 후 안내 */
async function confirm(page: Page) {
  const ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
  if (await ok.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false)) await ok.click();
  await settle(page, 2500);
  return popupMessage(page);
}

/** 보이는 모든 행 체크 (꺼져 있는 것만) */
async function checkAll(f: import('@playwright/test').Frame) {
  const imgs = f.locator('div.gridbox:visible .objbox tr:visible img[src*="item_chk0"]');
  for (let n = await imgs.count(); n > 0; n = await imgs.count()) { await imgs.first().click(); await f.waitForTimeout(150); }
}

test.describe('테스트 데이터 정리', () => {
  test.setTimeout(3_000_000);

  test('정기점검주기 삭제', async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    for (const pmNo of created) {
      if (result[pmNo]?.startsWith('삭제됨')) continue;
      const { rows } = await listRow(page, pmNo);
      if (!rows.length) { result[pmNo] = '없음 (이미 없음)'; saveResult(); continue; }
      const name = rows[0]['작업명'] ?? '';
      if (!name.startsWith('[sychoi]')) { result[pmNo] = `건너뜀: 이름이 [sychoi] 아님 (${name})`; saveResult(); continue; }
      let plans = await planFrame(page, pmNo);
      const statuses = [...new Set(plans.rows.map((r) => r['일정상태']))];
      if (plans.rows.some((r) => !/작업계획/.test(r['일정상태']))) {
        result[pmNo] = `남김: 발행·완료된 계획 있음 (${statuses.join(', ')}) — ${name}`; saveResult(); continue;
      }
      if (DRY) { result[pmNo] = `삭제 예정: 계획 ${plans.rows.length}건 (${statuses.join(', ') || '없음'}) — ${name}`; saveResult(); continue; }
      // 1) 발행 전 계획 삭제 (50건씩 보이므로 반복)
      for (let i = 0; i < 10 && plans.rows.length; i++) {
        await checkAll(plans.f);
        await clickButton(plans.f, '삭제');
        await settle(page, 800);
        const m = await confirm(page);
        if (process.env.QA_DEBUG) console.log('[clean]', pmNo, '계획 삭제', m);
        plans = await planFrame(page, pmNo);
      }
      if (plans.rows.length) { result[pmNo] = `남김: 계획 ${plans.rows.length}건 삭제 안 됨 — ${name}`; saveResult(); continue; }
      // 2) 주기 삭제: 행 선택 → 체크 → 삭제 → OK
      const { f } = await listRow(page, pmNo);
      const g = new Grid(f, '예방작업번호');
      await g.clickCell('예방작업번호', pmNo);
      await settle(page, 2000);
      await checkAll(f);
      await clickButton(f, '삭제');
      await settle(page, 800);
      const msg = await confirm(page);
      const after = (await listRow(page, pmNo)).rows.length;
      result[pmNo] = after ? `남김: 삭제 안 됨 ("${msg}") — ${name}` : `삭제됨 (계획 ${statuses.length ? '먼저 삭제' : '없음'}) — ${name}`;
      if (process.env.QA_DEBUG) console.log('[clean]', pmNo, result[pmNo]);
      saveResult();
    }
    console.log(JSON.stringify(result, null, 1));
  });
});
