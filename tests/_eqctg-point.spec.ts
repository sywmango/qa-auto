import { test, Page, Frame } from '@playwright/test';
import { openMenu, settle, clickButton, waitFrame, Grid, lovContentFrame, escapeRe } from './support/dream';
import { fillAllFields, listFields, saveForm, popupMessage } from './support/form';
import { openPm, L } from './support/pmi';

// 설비종류설정 > 믹서 에 점검항목 추가 (사용자 허락 2026-10-19). 이름 [sychoi]. 삭제하지 않음.
const note = (t: string) => test.info().annotations.push({ type: '실제결과', description: t });

async function openCtg(page: Page) {
  await openMenu(page, ['769', '120']);
  await settle(page, 2500);
  for (const f of page.frames()) {
    const cell = f.locator('div.gridbox:visible .objbox td:visible', { hasText: /^\s*믹서\s*$/ }).first();
    if (await cell.isVisible().catch(() => false)) { await cell.click(); await settle(page, 3000); return; }
  }
  throw new Error('믹서 없음');
}

async function byLabel(scope: Frame, values: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const f of await listFields(scope)) if (!f.readonly && f.label in values) out[f.id] = values[f.label];
  return out;
}

test('믹서 부위 추가 (점검항목의 점검부위 필수)', async ({ page }) => {
  test.setTimeout(400_000);
  const out: string[] = [];
  for (const [i, name, code, desc] of [[1, '[sychoi] 임펠러', 'IMP', '혼합 임펠러 및 체결볼트'], [2, '[sychoi] 메인 베어링', 'BRG', '구동축 메인 베어링']] as const) {
    await openCtg(page);
    const lf = await waitFrame(page, 'tabFrameTAB.maEqCtgAsmbList_maEqCatalogDetail');
    if ((await new Grid(lf, '부위명').rows()).some((r) => r['부위명'] === name)) { out.push(`${name}: 이미 있음`); continue; }
    await clickButton(lf, '생성');
    await settle(page, 2000);
    let d: Frame | undefined;
    for (let k = 0; k < 10 && !d; k++) {
      for (const f of page.frames()) if (/Detail_maEqCtgAsmbList$/.test(f.name()) && (await listFields(f).catch(() => [])).some((x) => !x.readonly)) { d = f; break; }
      if (!d) await page.waitForTimeout(1000);
    }
    if (!d) { out.push(`${name}: 상세 프레임 없음`); continue; }
    const e = await fillAllFields(page, d, await byLabel(d, { '부위명': name, '부위코드': `QA-${code}`, '정렬값': String(i * 10), '부위설명': desc }));
    out.push(`${name}: ${Object.values(e).map((x) => `${x.label}=${x.value}`).join(', ')} 저장 "${(await saveForm(page, d)) || '없음'}"`);
  }
  note(out.join('\n'));
  console.log(out.join('\n'));
});

test('믹서 점검항목 추가', async ({ page }) => {
  test.setTimeout(600_000);
  const out: string[] = [];
  for (const p of [
    ['1', '[sychoi] 임펠러 체결볼트 토크', '토크렌치로 체결 토크 측정', '40~45 N·m'],
    ['2', '[sychoi] 메인 베어링 표면온도', '적외선 온도계로 운전 중 측정', '70℃ 이하'],
  ]) {
    await openCtg(page);
    const lf = await waitFrame(page, 'tabFrameTAB.maEqCatalogPointList_maEqCatalogDetail');
    const rows = await new Grid(lf, '점검항목').rows();
    if (rows.some((r) => r['점검항목'] === p[1])) { out.push(`${p[1]}: 이미 있음`); continue; }
    await clickButton(lf, '생성');
    await settle(page, 2000);
    const pop = page.frames().find((x) => x.name() === 'popupIframe1');
    if (pop && (await pop.locator('div.b_pwin_close').isVisible().catch(() => false))) {
      const lov = await lovContentFrame(page);
      await lov.locator('div.gridbox:visible .objbox td:visible', { hasText: /^\s*수치값\s*$/ }).first().click();
      await clickButton(lov, '선택');
      await settle(page, 2000);
    }
    let d: Frame | undefined;
    for (let i = 0; i < 10 && !d; i++) {
      for (const f of page.frames()) if (/Detail_maEqCatalogPointList$/.test(f.name()) && (await listFields(f).catch(() => [])).some((x) => !x.readonly)) { d = f; break; }
      if (!d) await page.waitForTimeout(1000);
    }
    if (!d) { out.push(`${p[1]}: 상세 프레임 없음`); continue; }
    const fsx = await listFields(d);
    const over = await byLabel(d, { '점검순서': p[0], '점검부위': p[0] === '1' ? '[sychoi] 임펠러' : '[sychoi] 메인 베어링', '점검항목': p[1], '점검방법': p[2], '적정기준': p[3], '정렬값': String(Number(p[0]) * 10), '비고': '' });
    const num = fsx.filter((x) => /하한|기준|상한/.test(x.label) || /checkMin|checkBasis|checkMax/.test(x.id));
    const vals = p[0] === '1' ? ['40', '42', '45'] : ['0', '50', '70'];
    for (const [k, id] of [['checkMin', 0], ['checkBasisVal', 1], ['checkMax', 2]] as const) { const f = fsx.find((x) => x.id.endsWith(`.${k}`)); if (f) over[f.id] = vals[id]; }
    const uom = fsx.find((x) => x.id.endsWith('.uom')); if (uom && uom.kind !== 'lov') over[uom.id] = p[0] === '1' ? 'N·m' : '℃';
    void num;
    const e = await fillAllFields(page, d, over);
    const msg = await saveForm(page, d);
    out.push(`${p[1]}: 입력 ${Object.values(e).map((x) => `${x.label}=${x.value}`).join(', ')} 저장 "${msg || '없음'}"`);
  }
  await openCtg(page);
  const rows = await new Grid(await waitFrame(page, 'tabFrameTAB.maEqCatalogPointList_maEqCatalogDetail'), '점검항목').rows();
  out.push(`믹서 점검항목 ${rows.length}건: ${rows.map((r) => r['점검항목']).join(', ')}`);
  // 정기점검주기 8007 의 표준항목선택 팝업 다시 확인
  await openPm(page, '8007');
  await clickButton(await waitFrame(page, L.pt), '표준항목선택');
  await settle(page, 4000);
  for (const f of page.frames()) if (/popupIframe/.test(f.name())) out.push(`8007 표준항목선택 팝업 ${await f.evaluate(() => (document.body.innerText.match(/Total\s*:\s*[\d,]+\s*\/\s*[\d,]+/g) || []).join(' ')).catch(() => '')}`);
  note(out.join('\n'));
  console.log(out.join('\n'));
  void escapeRe; void popupMessage;
});
