import { test } from '@playwright/test';
import { openMenu } from '../../support/dream';
test.skip(!process.env.EXPLORE, '탐색용');
test('탭 이름', async ({ page }) => {
  await openMenu(page, ['132', '372', '358']);
  const t = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('a,span,li')].filter((e) => e.offsetWidth > 0 && e.children.length === 0 && /^(목록|일정|달력|연간|월간)/.test(e.innerText.trim())).map((e) => e.innerText.trim()));
  console.log('TABS', JSON.stringify([...new Set(t)]));
});
