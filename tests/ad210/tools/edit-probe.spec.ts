import { test } from '@playwright/test';
import fs from 'fs';
import { clickButton, settle } from '../../support/dream';
import { openTab, TAB, search } from '../../support/pmplan';
import { okAndMessage } from '../../support/pmplan-data';

// Edit 모드 그리드 칸 구조 확인 (저장하지 않음). EXPLORE=1 일 때만
test.skip(!process.env.EXPLORE, '탐색용');
test('Edit 칸', async ({ page }) => {
  test.setTimeout(180_000);
  const f = await openTab(page, 'year');
  await f.locator(`[id="${TAB.year.dto}.filterPmNo"]`).fill('8007');
  await search(page, f);
  await f.locator('span.p:visible a').nth(11).click();
  await settle(page, 2500);
  await clickButton(f, 'Edit');
  const msg = await okAndMessage(page);
  await settle(page, 1000);
  const info = await f.evaluate(() => {
    const boxes = [...document.querySelectorAll<HTMLElement>('div.gridbox')].map((b) => ({ w: b.offsetWidth, heads: [...b.querySelectorAll<HTMLElement>('.hdrcell')].map((h) => h.innerText.trim()).slice(0, 30) }));
    const box = [...document.querySelectorAll<HTMLElement>('div.gridbox')].find((b) => b.offsetWidth > 0)!;
    const hdrRows = [...box.querySelectorAll('.xhdr table.hdr tr')].map((tr) => [...tr.querySelectorAll('td,th')].length);
    const hdr = [...box.querySelectorAll('.xhdr table.hdr tr')].find((t) => t.querySelector('.hdrcell'))!;
    const heads = [...hdr.querySelectorAll('td')].map((td) => ({ t: (td as HTMLElement).innerText.trim(), w: (td as HTMLElement).offsetWidth }));
    const rows = [...box.querySelectorAll<HTMLTableRowElement>('.objbox table.obj tr')].slice(0, 3).map((tr) => [...tr.querySelectorAll<HTMLElement>('td')].map((td) => `${td.innerText.trim().slice(0, 12)}(${td.offsetWidth})`));
    const w = window as any;
    const g = w.myGrid;
    const types = g ? [...Array(g.getColumnsNum())].map((_, i) => `${g.getColumnId(i)}:${g.getColType(i)}`) : [];
    return { boxes, hdrRows, heads, rows, types };
  });
  fs.writeFileSync('playwright/.data/edit-probe.json', JSON.stringify({ msg, info }, null, 1));
  await clickButton(f, '취소');
  await okAndMessage(page);
});
