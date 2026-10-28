import { test } from '@playwright/test';
import fs from 'fs';
import { settle, Grid, clickButton, lovContentFrame } from '../support/dream';
import { closePopups } from '../support/setting';
import { openMenuByPath, listFrame } from '../support/approval';

// 투자절차 Edit: 품의 진행상태 칸을 눌렀을 때 고를 수 있는 값 (저장하지 않고 취소)
test('탐색16 투자절차 진행상태 칸', async ({ page }) => {
  test.setTimeout(180_000);
  const out: any = {};
  await openMenuByPath(page, ['설비도입', '도입목록']);
  const list = await listFrame(page);
  const g = new Grid(list, '도입명');
  const mine = (await g.rows()).find((r) => r['도입명'].startsWith('[sychoi]'))!;
  await g.clickCell('도입명', mine['도입명'], { dbl: true });
  await settle(page, 3500);
  let ph = undefined as any;
  for (let i = 0; i < 6 && !ph; i++) {
    for (const f of page.frames().filter((x) => /invtPhaseList/.test(x.name()))) if (await f.locator('a.b_edit:visible').count().catch(() => 0)) ph = f;
    if (!ph) { await page.frames().find((f) => /invtDetail_invtList/.test(f.name()))?.locator('.ac_menu:visible', { hasText: '투자절차' }).first().click().catch(() => {}); await page.waitForTimeout(1500); }
  }
  await clickButton(ph, 'Edit');
  await settle(page, 1500);
  const cell = ph.locator('.objbox tr:visible', { hasText: '품의' }).first().locator('td').nth(3);
  await cell.click();
  await cell.dblclick();
  await settle(page, 1500);
  out.cellHtml = await cell.evaluate((e: HTMLElement) => e.outerHTML.slice(0, 800));
  await page.screenshot({ path: 'playwright/.data/az303-explore/invt-cell.png' });
  const spop = cell.locator('p.open_spop');
  if (await spop.count()) {
    await spop.click();
    await settle(page, 2000);
    const lov = await lovContentFrame(page).catch(() => undefined);
    out.lov = lov ? await lov.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 800)) : 'Lov 없음';
    await page.screenshot({ path: 'playwright/.data/az303-explore/invt-lov.png' });
    await closePopups(page);
  }
  out.lists = [];
  for (const f of page.frames()) {
    const t = await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('.dhx_popup_dhx_skyblue, .dhx_combo_list, [class*=combolist]')].filter((e) => e.offsetWidth > 0).map((e) => e.innerText.replace(/\s+/g, ' '))).catch(() => []);
    if (t.length) out.lists.push({ f: f.name(), t });
  }
  await clickButton(ph, '취소').catch(() => {});
  fs.writeFileSync('playwright/.data/az303-explore/invt-cell.json', JSON.stringify(out, null, 1));
});
