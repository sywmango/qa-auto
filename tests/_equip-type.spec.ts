import { test, expect, Page, Frame } from '@playwright/test';
import { openMenu, settle, Grid, waitFrame } from './support/dream';
import { listFields, chooseInLov, saveForm } from './support/form';

// 설비자산 > 설비: 100302AG13 의 설비종류를 '믹서'로 (TC_039 표준항목선택 확인용, 사용자 허락 2026-10-19)
const EQ = '100302AG13';
const note = (t: string) => test.info().annotations.push({ type: '실제결과', description: t });

async function openEquip(page: Page): Promise<Frame> {
  await openMenu(page, ['114', '447']);
  await settle(page, 1500);
  const cond = page.getByText('목록(조건)', { exact: true }).first();
  if (await cond.isVisible().catch(() => false)) { await cond.click(); await settle(page, 1500); }
  for (const f of page.frames()) {
    const inp = f.locator('div.field', { has: f.locator('label', { hasText: /^\s*설비번호\s*$/ }) }).locator('input:visible').first();
    if (!(await inp.isVisible().catch(() => false))) continue;
    await inp.fill(EQ);
    await f.locator('a.b_search:visible').first().click();
    await settle(page, 2500);
    await new Grid(f, '설비번호').clickCell('설비번호', EQ);
    await settle(page, 3000);
    for (const fr of page.frames()) {
      const fs = await listFields(fr).catch(() => []);
      if (fs.some((x) => x.label === '설비종류' && !x.readonly) && /Detail/.test(fr.name())) return fr;
    }
  }
  throw new Error('설비 상세를 찾지 못함');
}

test('100302AG13 설비종류 믹서', async ({ page }) => {
  test.setTimeout(240_000);
  const d = await openEquip(page);
  const fld = (await listFields(d)).find((x) => x.label === '설비종류' && !x.readonly)!;
  const before = await d.locator(`[id="${fld.id}"]`).inputValue();
  if (before !== '믹서') await chooseInLov(page, d, fld.id, '믹서');
  const msg = await saveForm(page, d);
  const d2 = await openEquip(page);
  const after = await d2.locator(`[id="${fld.id}"]`).inputValue();
  note(`${EQ} 설비종류 "${before}" → "${after}" (저장 안내 "${msg || '없음'}")`);
  console.log(`${EQ} 설비종류 "${before}" → "${after}" (${d.name()})`);
  expect(after).toBe('믹서');
});
