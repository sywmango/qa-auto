import { test, expect, Page, Frame } from '@playwright/test';
import fs from 'fs';
import { openMenu, settle, clickButton, waitFrame, Grid, lovContentFrame, escapeRe } from '../../support/dream';
import { fillAllFields, listFields, saveForm, popupMessage, chooseInLov, put } from '../../support/form';

// 표준작업설정: 테스트용 표준작업(믹서)에 하위 목록을 모두 채우고 확정 → 정기점검주기 [표준항목선택] 팝업에 나오게 함
// 만든 표준작업은 삭제하지 않음. 이름은 [sychoi] 로 시작.

const STD = JSON.parse(fs.readFileSync('playwright/.data/stdwork.json', 'utf8')) as { no: string; confirmed?: boolean };
const F_CTG = 'tabFrameTAB.maStdPointHdrCtg_maStdPointHdr';
const F_HDR = 'tabFrameTAB.maStdPointHdrDetail_maStdPointHdrCtg';
const note = (t: string) => test.info().annotations.push({ type: '실제결과', description: t });
const log = (s: string) => { if (process.env.QA_DEBUG) console.log('[std]', new Date().toISOString().slice(11, 19), s); };

async function openStd(page: Page) {
  await openMenu(page, ['769', '1049']);
  await settle(page, 2000);
  // 목록(조건) 탭에서 표준작업번호로 찾기, 없으면 종류 트리의 '믹서'
  const cond = page.getByText('목록(조건)', { exact: true }).first();
  if (await cond.isVisible().catch(() => false)) {
    await cond.click();
    await settle(page, 1500);
  }
  for (const f of page.frames()) {
    const inp = f.locator('div.field', { has: f.locator('label', { hasText: /^\s*표준작업번호\s*$/ }) }).locator('input:visible').first();
    if (await inp.isVisible().catch(() => false)) {
      await inp.fill(STD.no);
      await f.locator('a.b_search:visible').first().click();
      await settle(page, 2000);
      await new Grid(f, '표준작업번호').clickCell('표준작업번호', STD.no);
      await settle(page, 2500);
      // 목록(조건) 탭에서 연 상세는 프레임 이름이 다름 → 표준작업번호 칸 값으로 찾음
      for (const fr of page.frames()) {
        const v = await fr.evaluate(() => (document.getElementById('maStdPointHdrDetailDTO.stWrkNo') as HTMLInputElement | null)?.value ?? '').catch(() => '');
        if (v === STD.no && /Detail/.test(fr.name())) return fr;
      }
      return waitFrame(page, F_HDR);
    }
  }
  throw new Error('표준작업 목록(조건) 검색칸을 찾지 못함');
}

async function byLabel(scope: Frame, values: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const f of await listFields(scope)) if (!f.readonly && f.label in values) out[f.id] = values[f.label];
  return out;
}

/** 하위 목록에 한 건 추가: 생성 → (Lov 가 뜨면 pick 행 선택) → 상세 칸 채움 → 저장 */
async function addSub(page: Page, list: string, values: Record<string, string>, pick?: RegExp) {
  const lf = await waitFrame(page, list);
  const before = await lf.evaluate(() => (document.body.innerText.match(/Total\s*:\s*(\d+)/) || [])[1] ?? '?');
  await clickButton(lf, '생성');
  await settle(page, 2000);
  let picked = '';
  const pop = page.frames().find((x) => x.name() === 'popupIframe1');
  if (pop && (await pop.locator('div.b_pwin_close').isVisible().catch(() => false))) {
    const lov = await lovContentFrame(page);
    const cells = lov.locator('div.gridbox:visible .objbox tr:visible td:visible');
    const cell = pick ? cells.filter({ hasText: pick }).first() : cells.filter({ hasText: /[가-힣A-Za-z]/ }).first();
    picked = (await cell.innerText()).trim();
    await cell.click();
    const chk = lov.locator('div.gridbox:visible .objbox tr.rowselected img[src*="item_chk"], div.gridbox:visible .objbox tr[class*="selected"] img[src*="item_chk0"]').first();
    if (await chk.isVisible().catch(() => false)) await chk.click();
    await clickButton(lov, '선택');
    await settle(page, 2000);
    const m = await popupMessage(page);
    const ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
    if (await ok.isVisible().catch(() => false)) { await ok.click(); await settle(page, 1500); }
    if (m) picked += ` (안내 "${m}")`;
  }
  // 상세 프레임 이름: tabFrameTAB.<무엇>Detail_<목록이름> (예: maStdWoTypeDetail_maStdWoTypeList)
  const listKey = list.replace('tabFrameTAB.', '').split('_')[0];
  const re = new RegExp(`Detail_${escapeRe(listKey)}$`);
  let d: Frame | undefined;
  for (let i = 0; i < 10 && !d; i++) {
    for (const f of page.frames()) {
      if (!re.test(f.name())) continue;
      if ((await listFields(f).catch(() => [])).some((x) => !x.readonly)) { d = f; break; }
    }
    if (!d) await page.waitForTimeout(1000);
  }
  log(`${listKey} 상세 프레임 ${d ? d.name() : '없음'}`);
  let entered = '', msg = '';
  if (d) {
    const e = await fillAllFields(page, d, await byLabel(d, values));
    entered = Object.values(e).map((x) => `${x.label}=${x.value}`).join(', ');
    msg = await saveForm(page, d);
  }
  const lf2 = await waitFrame(page, list);
  const after = await lf2.evaluate(() => (document.body.innerText.match(/Total\s*:\s*(\d+)/) || [])[1] ?? '?');
  const line = `${list.replace(/^tabFrameTAB\.(\w+?)List_.*/, '$1')}: ${picked ? `Lov "${picked}", ` : ''}${entered ? `입력 ${entered}, ` : ''}저장 "${msg || '없음'}" → ${before} → ${after}건`;
  log(line);
  return line;
}

test.describe('표준작업 (믹서) 준비', () => {
  test.setTimeout(900_000);

  test('하위 목록 채우기', async ({ page }) => {
    const out: string[] = [`표준작업번호 ${STD.no} "[sychoi] High Speed Mixer 정기점검 표준작업" (설비종류 믹서)`];
    const step = async (fn: () => Promise<string>) => {
      try { out.push(await fn()); } catch (e) { out.push(`실패: ${String(e).split('\n')[0].slice(0, 160)}`); await page.screenshot({ path: test.info().outputPath(`step-${out.length}.png`) }); }
    };
    await openStd(page);
    await step(() => addSub(page, 'tabFrameTAB.maStdWoTypeList_maStdPointHdrDetail', { '설명': 'High Speed Mixer 월간 정기점검', '비고': '정기점검주기에서 사용' }, /정기점검/));
    await openStd(page);
    for (const [i, t] of ['전원 차단 및 LOTO 잠금 실시', '임펠러·초퍼 체결볼트 토크 확인', '베어링 온도·이상음 확인 후 무부하 시운전'].entries()) {
      await step(() => addSub(page, 'tabFrameTAB.maStdWorkList_maStdPointHdrDetail', { '작업순서': String(i + 1), '작업내용': t, '비고': '' }));
    }
    await openStd(page);
    await step(() => addSub(page, 'tabFrameTAB.maStdPartList_maStdPointHdrDetail', { '사용수량': '1', '비고': '정기점검 시 상태 불량이면 교체' }));
    await openStd(page);
    for (const p of [
      ['1', '[sychoi] 임펠러 체결볼트 토크', '토크렌치로 체결 토크 측정', '40~45 N·m', '40', '42', '45'],
      ['2', '[sychoi] 메인 베어링 표면온도', '적외선 온도계로 운전 중 측정', '70℃ 이하', '0', '50', '70'],
    ]) {
      await step(() => addSub(page, 'tabFrameTAB.maStdPointList_maStdPointHdrDetail', { '점검순서': p[0], '점검항목': p[1], '점검방법': p[2], '적정기준': p[3], '하한값': p[4], '기준값': p[5], '상한값': p[6], '주기': '1', '예상소요시간(분)': '10', '비고': '' }, /수치값/));
    }
    await openStd(page);
    await step(() => addSub(page, 'tabFrameTAB.maPtDocLibList_maStdPointHdrDetail', { '제목': '[sychoi] High Speed Mixer 정기점검 표준서' }));
    note(out.join('\n'));
    console.log(out.join('\n'));
  });

  test('값 다듬기 (작업종류 정기점검, 점검항목 수치값·월 주기)', async ({ page }) => {
    const out: string[] = [];
    /** 라벨로 칸을 찾아 값 넣기 (Lov 는 팝업에서 고름) */
    const setByLabel = async (d: Frame, label: string, value: string) => {
      const f = (await listFields(d)).find((x) => x.label === label && !x.readonly);
      if (!f) return `${label}: 칸 없음`;
      if ((await d.locator(`[id="${f.id}"]`).inputValue()).trim() === value) return `${label}=${value}`;
      if (f.kind === 'lov') await chooseInLov(page, d, f.id, value); else await put(d.locator(`[id="${f.id}"]`), value);
      return `${label}=${(await d.locator(`[id="${f.id}"]`).inputValue()).trim()}`;
    };
    const openRow = async (list: string, header: string, key: string, value: string, detailRe: RegExp) => {
      await openStd(page);
      await new Grid(await waitFrame(page, list), header).clickCell(key, value);
      await settle(page, 2000);
      return page.frames().find((f) => detailRe.test(f.name()))!;
    };
    // 작업종류
    const wl = 'tabFrameTAB.maStdWoTypeList_maStdPointHdrDetail';
    await openStd(page);
    const wrows = await new Grid(await waitFrame(page, wl), '작업종류').rows();
    let d = await openRow(wl, '작업종류', '작업종류', wrows[0]['작업종류'], /maStdWoTypeDetail_maStdWoTypeList$/);
    const w1 = await setByLabel(d, '작업종류', '정기점검');
    const w2 = await setByLabel(d, '작업형태', '정기점검');
    out.push(`작업종류: ${w1}, ${w2} 저장 "${(await saveForm(page, d)) || '없음'}"`);
    // 점검항목
    const pl = 'tabFrameTAB.maStdPointList_maStdPointHdrDetail';
    const byId = async (d: Frame, id: string, value: string, lov = false) => {
      const loc = d.locator(`[id="maStdPointDetailDTO.${id}"]`);
      if ((await loc.inputValue()).trim() !== value) {
        if (lov) await chooseInLov(page, d, `maStdPointDetailDTO.${id}`, value); else await put(loc, value);
      }
      return `${id}=${(await d.locator(`[id="maStdPointDetailDTO.${id}"]`).inputValue()).trim()}`;
    };
    for (const [i, name, lo, base, hi, uom] of [[1, '[sychoi] 임펠러 체결볼트 토크', '40', '42', '45', 'N·m'], [2, '[sychoi] 메인 베어링 표면온도', '0', '50', '70', '℃']] as const) {
      d = await openRow(pl, '점검항목', '점검항목', name, /maStdPointDetail_maStdPointList$/);
      const r = [
        await byId(d, 'checkTypeDesc', '수치값', true), await byId(d, 'periodTypeDesc', '월 주기', true), await byId(d, 'ordNo', String(i)),
        await byId(d, 'checkMin', lo), await byId(d, 'checkBasisVal', base), await byId(d, 'checkMax', hi), await byId(d, 'uom', uom),
      ];
      out.push(`${name}: ${r.join(', ')} 저장 "${(await saveForm(page, d)) || '없음'}"`);
    }
    await openStd(page);
    const prow = await new Grid(await waitFrame(page, pl), '점검항목').rows();
    out.push(`점검항목 목록: ${prow.map((r) => `${r['점검항목']} / ${r['수치/판정']} / ${r['하한/기준/상한/단위']} / ${r['주기']}`).join(' | ')}`);
    note(out.join('\n'));
    console.log(out.join('\n'));
  });

  test('점검항목 칸 확인', async ({ page }) => {
    await openStd(page);
    await new Grid(await waitFrame(page, 'tabFrameTAB.maStdPointList_maStdPointHdrDetail'), '점검항목').clickCell('점검항목', '[sychoi] 임펠러 체결볼트 토크');
    await settle(page, 2500);
    const d = page.frames().find((f) => /maStdPointDetail_maStdPointList$/.test(f.name()))!;
    const fs2 = await listFields(d);
    console.log('FIELDS', JSON.stringify(await Promise.all(fs2.map(async (f) => `${f.id.split('.').pop()}|${f.label}|${f.kind}${f.readonly ? '(ro)' : ''}=${await d.locator(`[id="${f.id}"]`).inputValue()}`))));
    await d.locator('[id="maStdPointDetailDTO.periodTypeDesc"]').locator('xpath=..').locator('p.open_spop').click();
    await settle(page, 1500);
    const lov = await lovContentFrame(page);
    console.log('PERIOD', JSON.stringify(await lov.locator('div.gridbox:visible .objbox td:visible').allInnerTexts()));
    await page.screenshot({ path: 'test-results/std-point.png' });
  });

  test('확정', async ({ page }) => {
    const d = await openStd(page);
    const before = await d.evaluate(() => (document.getElementById('maStdPointHdrDetailDTO.stwrkStatusDesc') as HTMLInputElement).value);
    await clickButton(d, '확정');
    await settle(page, 1000);
    const ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
    if (await ok.isVisible().catch(() => false)) await ok.click();
    await settle(page, 2500);
    const msg = await popupMessage(page);
    const d2 = await openStd(page);
    const after = await d2.evaluate(() => (document.getElementById('maStdPointHdrDetailDTO.stwrkStatusDesc') as HTMLInputElement).value);
    note(`표준작업 ${STD.no} 확정: 상태 ${before} → ${after} (안내 "${msg || '없음'}")`);
    console.log(`표준작업 ${STD.no} 확정: 상태 ${before} → ${after} (안내 "${msg || '없음'}")`);
    await page.screenshot({ path: 'playwright/.data/evidence/stdwork-confirmed.png' });
    expect(after).not.toBe(before);
  });
});
