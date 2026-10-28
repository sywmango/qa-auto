import { test } from '@playwright/test';
import fs from 'fs';
import { settle } from '../support/dream';

// 제개정 설정 Y: 기존 [sychoi] 주기 8007 에서 "개정"을 시작하는 곳 찾기 (Linked 메뉴, 우클릭 등). 저장하지 않음
test('탐색18 개정 시작 위치', async ({ page }) => {
  test.setTimeout(150_000);
  const { openPm } = await import('../support/pmi');
  const d = await openPm(page, '8007');
  const out: any = {};
  await d.locator('a.b_linked:visible').first().click().catch((e) => (out.linkedErr = String(e).slice(0, 100)));
  await settle(page, 2000);
  out.after = [];
  for (const f of page.frames()) {
    const t = await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('a, li, div, span')].filter((e) => e.offsetWidth > 0 && /개정|Revision|제정/.test(e.innerText || '') && (e.innerText || '').length < 40).map((e) => `${e.tagName}.${e.className.split(' ')[0]}: ${e.innerText.trim()}`)).catch(() => []);
    if (t.length) out.after.push({ f: f.name(), t: [...new Set(t)].slice(0, 20) });
  }
  await page.screenshot({ path: 'playwright/.data/az303-explore/rev-linked.png' });
  fs.writeFileSync('playwright/.data/az303-explore/rev-linked.json', JSON.stringify(out, null, 1));
});
