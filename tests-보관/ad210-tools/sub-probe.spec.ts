import { test } from '@playwright/test';
import fs from 'fs';
import { settle, Grid, waitFrame } from '../../support/dream';
import { clickRow, detailOf } from '../../support/pmplan';
import { myPlans, rowIndex } from '../../support/pmplan-data';

// 점검작업 상세 하위 탭·점검항목 상세 구조 확인 (저장하지 않음). EXPLORE=1 일 때만
test.skip(!process.env.EXPLORE, '탐색용');
test('하위 탭', async ({ page }) => {
  test.setTimeout(180_000);
  const out: Record<string, unknown> = {};
  const { f, rows } = await myPlans(page);
  await clickRow(f, rowIndex(rows, '2026-12-18', '작업발행'));
  const d = await detailOf(page, 'period', 'pmi');
  out.tabs = await d.evaluate(() => [...document.querySelectorAll<HTMLElement>('*')].filter((e) => e.offsetWidth > 0 && /^(점검항목|표준작업|첨부문서)/.test((e.innerText || '').trim()) && (e.innerText || '').length < 20)
    .map((e) => `${e.tagName}.${e.className}#${e.id} onclick=${e.getAttribute('onclick') || ''} href=${e.getAttribute('href') || ''} [${e.innerText.replace(/\s+/g, ' ')}]`));
  out.framesVis = await Promise.all(page.frames().filter((x) => /workPmi|maPtDoc/.test(x.name())).map(async (x) => `${x.name()} vis=${await x.evaluate(() => (window.frameElement as HTMLElement | null)?.offsetWidth ?? -1).catch(() => -2)}`));
  // 점검항목 행 클릭
  const pl = await waitFrame(page, 'tabFrameTAB.workPmiPointList_workPmiDetail');
  const pts = await new Grid(pl, '점검항목').rows();
  await new Grid(pl, '점검항목').clickCell('점검항목', pts[0]['점검항목']);
  await settle(page, 2500);
  out.afterPointClick = await Promise.all(page.frames().filter((x) => /Point/.test(x.name())).map(async (x) => `${x.name()} url=${x.url().slice(-60)} inputs=${await x.locator('input[id*="DTO"]:visible').count().catch(() => -1)}`));
  const pd = page.frames().find((x) => /Point(Value)?Detail_workPmiPointList$/.test(x.name()) && x.url() !== 'about:blank');
  if (pd) out.pointFields = await pd.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('input[id*="DTO"], select, textarea')].filter((e) => e.offsetWidth > 0).map((e) => `${e.id} ro=${e.readOnly} v=${e.value}`));
  fs.writeFileSync('playwright/.data/sub-probe.json', JSON.stringify(out, null, 1));
});
