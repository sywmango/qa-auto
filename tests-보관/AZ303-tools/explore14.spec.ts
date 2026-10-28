import { test } from '@playwright/test';
import fs from 'fs';
import { settle } from '../support/dream';

// 제개정 설정 Y 일 때 [sychoi] 주기 8007 상세·목록의 버튼 (숨은 것 포함). 읽기만
test('탐색14 주기 8007 제개정 버튼', async ({ page }) => {
  test.setTimeout(120_000);
  const { openPm } = await import('../support/pmi');
  await openPm(page, '8007');
  await settle(page, 2000);
  const out: any[] = [];
  for (const f of page.frames()) {
    if (!/\.do/.test(f.url()) || /index\.do/.test(f.url())) continue;
    const b = await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('a, button')].filter((a) => a.innerText.trim() && /b_|btn|rev/i.test(a.className + a.id)).map((a) => `${a.innerText.trim()} .${a.className.split(' ')[0]}${a.offsetWidth > 0 ? '' : ' (숨김)'}`)).catch(() => []);
    const rev = await f.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('input')].filter((i) => /rev|Rev/.test(i.id)).map((i) => `${i.id}=${i.value}`)).catch(() => []);
    if (b.length || rev.length) out.push({ name: f.name(), url: f.url().split('?')[0], b, rev });
  }
  fs.mkdirSync('playwright/.data/az303-explore/survey14', { recursive: true });
  fs.writeFileSync('playwright/.data/az303-explore/survey14/pmi.json', JSON.stringify(out, null, 1));
});
