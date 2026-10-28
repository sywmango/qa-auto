import { test } from '@playwright/test';
import fs from 'fs';
import { settle, clickButton } from '../support/dream';
import { openApproval } from '../support/approval';
import { state, openDayLog } from '../support/az303-data';

const OUT = 'playwright/.data/az303-explore';
const log = (s: string) => fs.appendFileSync(`${OUT}/dialogs.txt`, 'ex4: ' + s + '\n');

test('탐색4: 안내 상자 class, Excel 새 창', async ({ page, context }) => {
  test.setTimeout(300_000);
  const det = await openDayLog(page, state.A);
  const { grid } = await openApproval(page, det);
  await clickButton(grid, '기본 결재자로 저장');
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(300);
    for (const f of page.frames()) {
      const h = await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('body *')].filter((e) => e.offsetWidth > 0 && e.children.length === 0 && /저장후/.test(e.textContent || '')).map((e) => { const p = e.parentElement!, g = p.parentElement!; return `${e.tagName}.${e.className} < ${p.tagName}.${p.className} < ${g.tagName}.${g.className}`; })).catch(() => []);
      if (h.length) log(`${i} frame "${f.name()}": ${h.join(' || ')}`);
    }
  }
  const pp = context.waitForEvent('page', { timeout: 15_000 }).catch(() => null);
  await clickButton(grid, 'Excel');
  const np = await pp;
  if (np) {
    log('new page ' + np.url());
    const dl = await np.waitForEvent('download', { timeout: 20_000 }).catch((e) => String(e));
    log('download ' + (typeof dl === 'string' ? dl.slice(0, 100) : dl.suggestedFilename()));
    await np.waitForTimeout(3000);
    log('new page url after ' + np.url() + ' closed ' + np.isClosed());
  }
});
