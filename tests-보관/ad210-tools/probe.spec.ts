import { test } from '@playwright/test';
import fs from 'fs';
import { openMenu, settle, clickTab } from '../../support/dream';

// 카렌다 칸 구조, 목록(조건) 기본값 확인 (읽기만). EXPLORE=1 일 때만
test.skip(!process.env.EXPLORE, '탐색용');
test('카렌다 구조', async ({ page }) => {
  test.setTimeout(240_000);
  const out: Record<string, unknown> = {};
  await openMenu(page, ['132', '372', '358']);
  const y = page.frames().find((x) => /workCalPmRInsYearList_/.test(x.name()))!;
  out.yearDefaults = await y.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('input[id*="DTO"]')].filter((e) => e.offsetWidth).map((e) => `${e.id}=${e.value}`));
  out.yearCal = await y.evaluate(() => {
    const el = [...document.querySelectorAll<HTMLElement>('*')].find((e) => e.children.length < 3 && /^\s*1월\s*$/.test(e.innerText || ''));
    let x: HTMLElement | null = el ?? null;
    for (let i = 0; i < 6 && x && !/2월[\s\S]*12월/.test(x.innerText); i++) x = x.parentElement;
    return x ? x.outerHTML.slice(0, 5000) : 'not found';
  });
  out.yearListTotal = await y.evaluate(() => (document.body.innerText.match(/Total\s*:\s*[\d,]+\s*\/\s*[\d,]+/g) || []).join(' | '));
  // 10월 숫자 클릭
  const oct = y.locator('a:visible, span:visible, td:visible', { hasText: /^\s*1323\s*$/ }).first();
  out.octCount = await oct.count();
  if (await oct.count()) { await oct.click().catch((e) => (out.octErr = String(e))); await settle(page, 2500); }
  out.afterOct = await y.evaluate(() => (document.body.innerText.match(/Total\s*:\s*[\d,]+\s*\/\s*[\d,]+/g) || []).join(' | '));
  out.afterOctRows = await y.evaluate(() => [...document.querySelectorAll('div.gridbox .objbox tr')].slice(1, 4).map((tr) => (tr as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 120)));
  await clickTab(page, '카렌다(월간)');
  const m = page.frames().find((x) => /workCalPmRInsMonthSchedList_/.test(x.name()))!;
  out.monthDefaults = await m.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('input[id*="DTO"]')].filter((e) => e.offsetWidth).map((e) => `${e.id}=${e.value}`));
  out.monthCal = await m.evaluate(() => {
    const el = [...document.querySelectorAll<HTMLElement>('*')].find((e) => e.children.length < 3 && /^\s*수\s*$/.test(e.innerText || ''));
    let x: HTMLElement | null = el ?? null;
    for (let i = 0; i < 6 && x && !/토[\s\S]*\d+\s*\/\s*\d+/.test(x.innerText); i++) x = x.parentElement;
    return x ? x.outerHTML.slice(0, 4000) : 'not found';
  });
  out.monthListTotal = await m.evaluate(() => (document.body.innerText.match(/Total\s*:\s*[\d,]+\s*\/\s*[\d,]+/g) || []).join(' | '));
  await clickTab(page, '목록(조건)');
  const p = page.frames().find((x) => /workCalPmRInsPeriodList_/.test(x.name()))!;
  out.periodDefaults = await p.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('input[id*="DTO"]')].filter((e) => e.offsetWidth).map((e) => `${e.id}=${e.value}`));
  out.periodTotal = await p.evaluate(() => (document.body.innerText.match(/Total\s*:\s*[\d,]+\s*\/\s*[\d,]+/g) || []).join(' | '));
  fs.writeFileSync('playwright/.data/pmplan-probe.json', JSON.stringify(out, null, 1));
});
