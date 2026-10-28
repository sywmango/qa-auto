import { test } from '@playwright/test';
import fs from 'fs';
import { settle, Grid } from '../support/dream';
import { openMenuByPath, listFrame } from '../support/approval';

// 정기수리계획 상세의 하위 탭(작업계획서 등)과 결재 버튼 (읽기만)
test('탐색13 정기수리계획 상세 탭', async ({ page }) => {
  test.setTimeout(180_000);
  const out: any = {};
  await openMenuByPath(page, ['작업관리', '정기수리작업', '정기수리계획']);
  for (const f of page.frames()) { const t = f.getByText('기간(조건)', { exact: true }).first(); if (await t.isVisible().catch(() => false)) { await t.click(); await settle(page, 2500); break; } }
  const list = await listFrame(page);
  const g = new Grid(list, '작업명');
  const rows = await g.rows();
  out.mine = rows.filter((r) => /sychoi/.test(r['작업명'])).slice(0, 3);
  const pick = out.mine[0] ?? rows[0];
  await g.clickCell('작업명', pick['작업명'], { dbl: true });
  await settle(page, 3500);
  out.details = [];
  for (const f of page.frames()) {
    if (!/\.do/.test(f.url()) || /index\.do/.test(f.url())) continue;
    const b = await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.innerText.trim() && /b_|ac_menu/.test(a.className)).map((a) => `${a.innerText.trim()} .${a.className.split(' ')[0]}${a.offsetWidth > 0 ? '' : ' (숨김)'}`)).catch(() => []);
    if (b.length) out.details.push({ name: f.name(), url: f.url().split('?')[0], b });
  }
  fs.mkdirSync('playwright/.data/az303-explore/survey13', { recursive: true });
  await page.screenshot({ path: 'playwright/.data/az303-explore/survey13/woplan.png', fullPage: true });
  fs.writeFileSync('playwright/.data/az303-explore/survey13/woplan.json', JSON.stringify(out, null, 1));
});
