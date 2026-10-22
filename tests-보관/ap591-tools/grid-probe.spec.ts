import { test, Page, Frame } from '@playwright/test';
import fs from 'fs';
import { settle } from '../../support/dream';
import { openSetting, settingRow } from '../../support/setting';
import { searchCond } from '../../support/pmexec';

// Setting 목록 그리드의 칸 종류(편집 가능 여부) 살펴보기 (저장하지 않음). EXPLORE=1 일 때만 실행
test.skip(!process.env.EXPLORE, '탐색용');

const gridInfo = (f: Frame) => f.evaluate(() => {
  const w = window as any;
  const g = Object.keys(w).map((k) => { try { return w[k]; } catch { return null; } }).find((o) => o && typeof o.getColType === 'function' && typeof o.getRowsNum === 'function');
  if (!g) return 'grid 없음';
  return [...Array(g.getColumnsNum())].map((_, i) => `${i}:${g.getColLabel(i)}:${g.getColType(i)}:${g.getColumnId?.(i) ?? ''}`).join(' | ');
});

test('Setting 그리드 칸 종류', async ({ page }) => {
  test.setTimeout(240_000);
  const out: Record<string, unknown> = {};
  const f = await searchCond(page, { pmNo: '8007' });
  const cf = await openSetting(page, f, 'list');
  out.colGrid = await gridInfo(cf);
  await settingRow(cf, 'PMIDESC').locator('img[src*="item_chk"]').click();
  await cf.locator('a:visible', { hasText: /^\s*Edit\s*$/ }).first().click();
  await settle(page, 1500);
  out.colGridEdit = await gridInfo(cf);
  const c7 = settingRow(cf, 'PMIDESC').locator('td').nth(7);
  await c7.dblclick(); await page.waitForTimeout(800);
  out.c7html = await c7.evaluate((e) => e.innerHTML.slice(0, 300));
  out.anySelect = await cf.evaluate(() => [...document.querySelectorAll<HTMLElement>('select, .dhx_combo_select, div.dhx_combo_box')].map((e) => `${e.tagName}.${e.className} vis=${e.offsetWidth}`));
  await c7.press('F2').catch(() => {}); await page.waitForTimeout(500);
  out.c7f2 = await c7.evaluate((e) => e.innerHTML.slice(0, 300));
  const pages = page.context().pages().map((p) => p.url());
  out.pages = pages;
  const sf = await (async () => { await page.goto('/dream/index.do'); return openSetting(page, await searchCond(page, { pmNo: '8007' }), 'search'); })();
  out.fieldGrid = await gridInfo(sf);
  fs.writeFileSync('playwright/.data/ap591-grid-probe.json', JSON.stringify(out, null, 1));
});
