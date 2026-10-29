import { test, expect, Page, Frame } from '@playwright/test';
import fs from 'fs';
import { openMenu, waitFrame, clickButton, fieldValue, settle, Grid, openLov, lovTotal, pickInLov, visibleTreeNodes } from '../support/dream';
import { put, dateAfter, closeLov } from '../support/form';
import { TAB, TabKey, openTab, listGrid, search, searchPeriod, loadAll, clickRow, detailOf, findPlan, isDate, note, pmiDetailFrame } from '../support/pmplan';
import { SY, ym, calendarCells, setReadonly, clickCalendar } from '../support/pmplan-view';

// 작업관리 > 정기점검작업 > 정기점검계획 (AD210) — 조회만 하는 케이스 (데이터를 만들거나 바꾸지 않음)
// 테스트 제목 앞 번호 = docs\AD210\AD210_UT_정기점검계획_양식.xlsx 의 테스트ID
// 비교용 데이터는 [sychoi] 주기의 계획 (작업명 검색 '[sychoi]')
// 검색·목록·상세 공통 케이스(TC_001~007, 011~013, 015, 016, 019, 025, 026)는 tests/common/screen.spec.ts (화면 정의 tests/screens/ad210.ts)

const today = () => dateAfter(0);

/** 점검작업 상세의 하위 탭 클릭 (탭 글자 예: "표준작업1"). 탭 목록 프레임이 보일 때까지 */
async function openSubTab(page: Page, d: Frame, tab: string) {
  // 하위 탭은 아코디언으로 모두 펼쳐져 있음 (탭 글자를 누르면 오히려 접힘) → 누르지 않고 기다리기만
  if (process.env.QA_DEBUG) console.log('[tab]', tab, d.name());
  await settle(page, 1000);
}

test.describe('AD210 정기점검계획 (조회)', () => {
  test('AD210_TC_008 연간 카렌다의 월별 건수를 확인한다.', async ({ page }) => {
    test.setTimeout(600_000);
    const f = await openTab(page, 'year');
    await f.locator(`[id="${TAB.year.dto}.filterPmDesc"]`).fill(SY);
    await search(page, f);
    const cells = await calendarCells(f);
    const months = cells.slice(0, 12);
    const sum = months.reduce((a, c) => ({ p: a.p + c.p, s: a.s + c.s, c: a.c + c.c }), { p: 0, s: 0, c: 0 });
    const tot = cells[12];
    const log = [`${SY} 연간: ${months.map((c, i) => `${i + 1}월 ${c.p}/${c.s}/${c.c}`).join(', ')} / 계 ${tot?.p}/${tot?.s}/${tot?.c}`];
    expect.soft(tot && [tot.p, tot.s, tot.c], '계 = 12개월 합').toEqual([sum.p, sum.s, sum.c]);
    const year = today().slice(0, 4);
    for (let i = 0; i < 12; i++) {
      if (!months[i].p) continue;
      const mm = String(i + 1).padStart(2, '0');
      // 숫자 클릭 → 아래 목록
      const fy = await openTab(page, 'year');
      await fy.locator(`[id="${TAB.year.dto}.filterPmDesc"]`).fill(SY);
      await search(page, fy);
      await clickCalendar(page, fy, i, 'p');
      const rows = await loadAll(page, fy);
      const outMonth = rows.filter((r) => !(r['작업일자'] || '').startsWith(`${year}-${mm}`));
      // 같은 달을 목록(조건)으로 검색해 상태별 건수
      const last = new Date(Number(year), i + 1, 0).getDate();
      const fp = await searchPeriod(page, { pmDesc: SY, from: `${year}-${mm}-01`, to: `${year}-${mm}-${last}` });
      const pr = await loadAll(page, fp);
      const s = pr.filter((r) => r['일정상태'] === '작업발행').length;
      const c = pr.filter((r) => r['일정상태'] === '작업완료').length;
      log.push(`${i + 1}월: 카렌다 ${months[i].p}/${months[i].s}/${months[i].c}, 숫자 클릭 목록 ${rows.length}행(다른 달 ${outMonth.length}${outMonth.length ? `, 예 ${outMonth.slice(0, 2).map((r) => r['작업일자']).join(',')}` : ''}), 목록(조건) ${pr.length}건 (작업발행 ${s}, 작업완료 ${c})`);
      expect.soft(rows.length, `${i + 1}월 숫자 클릭 목록 = Planned`).toBe(months[i].p);
      expect.soft(outMonth.length, `${i + 1}월 목록에 다른 달 없음`).toBe(0);
      expect.soft([pr.length, s, c], `${i + 1}월 P/S/C = 목록(조건) 전체/작업발행/작업완료`).toEqual([months[i].p, months[i].s, months[i].c]);
    }
    note(log.join('\n'));
  });

  test('AD210_TC_009 월간 카렌다의 일별 건수를 확인한다.', async ({ page }) => {
    test.setTimeout(600_000);
    const log: string[] = [];
    // [sychoi] 계획이 있는 달: 이번 달과 다음 달
    const now = new Date();
    for (const off of [0, 1]) {
      const d = new Date(now.getFullYear(), now.getMonth() + off, 1);
      const yyyymm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const f = await openTab(page, 'month');
      await setReadonly(f, `${TAB.month.dto}.filterYyyymm`, yyyymm);
      await f.locator(`[id="${TAB.month.dto}.filterPmDesc"]`).fill(SY);
      await search(page, f);
      const cells = await calendarCells(f);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const fp = await searchPeriod(page, { pmDesc: SY, from: `${yyyymm}-01`, to: `${yyyymm}-${last}` });
      const pr = await loadAll(page, fp);
      const bad: string[] = [];
      for (const c of cells) {
        const day = `${yyyymm}-${c.day.padStart(2, '0')}`;
        const same = pr.filter((r) => r['일정조정'] === day);
        const s = same.filter((r) => r['일정상태'] === '작업발행').length;
        const cc = same.filter((r) => r['일정상태'] === '작업완료').length;
        if (c.p !== same.length || c.s !== s || c.c !== cc) bad.push(`${day} 카렌다 ${c.p}/${c.s}/${c.c} ≠ 목록 ${same.length}/${s}/${cc}`);
      }
      // 숫자 클릭 목록: 계획이 가장 많은 날
      const top = cells.map((c, i) => ({ ...c, i })).sort((a, b) => b.p - a.p)[0];
      let clicked = '';
      if (top && top.p) {
        const f2 = await openTab(page, 'month');
        await setReadonly(f2, `${TAB.month.dto}.filterYyyymm`, yyyymm);
        await f2.locator(`[id="${TAB.month.dto}.filterPmDesc"]`).fill(SY);
        await search(page, f2);
        await clickCalendar(page, f2, top.i, 'p');
        const rows = await loadAll(page, f2);
        const day = `${yyyymm}-${top.day.padStart(2, '0')}`;
        const other = rows.filter((r) => r['일정조정'] !== day).length;
        clicked = `, ${day} 숫자 클릭 → ${rows.length}행 (다른 날 ${other})`;
        expect.soft(rows.length, `${day} 숫자 클릭 목록 = P`).toBe(top.p);
        expect.soft(other, `${day} 목록에 다른 날 없음`).toBe(0);
      }
      log.push(`${yyyymm}: 칸 ${cells.length}개, 카렌다 합 ${cells.reduce((a, c) => a + c.p, 0)}건 / 목록(조건) ${pr.length}건, 다른 날 ${bad.length}개${bad.length ? ` (${bad.slice(0, 4).join('; ')})` : ''}${clicked}`);
      expect.soft(bad, `${yyyymm} 날짜별 P/S/C = 목록(조건)`).toEqual([]);
    }
    note(log.join('\n'));
  });

  test('AD210_TC_010 트리에서 위치/종류를 선택하여 조회한다.', async ({ page }) => {
    test.setTimeout(240_000);
    const log: string[] = [];
    // 목록(위치): 안성공장
    let f = await openTab(page, 'loc');
    const tree = new Grid(f, '위치명');
    const before = await listGrid(f).total();
    await tree.clickCell('위치명', '안성공장');
    await settle(page, 2500);
    let rows = await listGrid(f).rows();
    let t = await listGrid(f).total();
    const badLoc = rows.filter((r) => !(r['설비위치'] || '').startsWith('안성공장'));
    log.push(`목록(위치) 처음 Total ${before?.all} → "안성공장" 클릭 ${t?.all}건, 불러온 ${rows.length}행 중 다른 위치 ${badLoc.length}`);
    expect.soft(rows.length, '안성공장 계획 있음').toBeGreaterThan(0);
    expect.soft(badLoc.length, '선택한 위치의 계획만').toBe(0);
    // 목록(종류): 믹서 (100302AG13 의 설비종류)
    f = await openTab(page, 'ctg');
    await new Grid(f, '종류명').clickCell('종류명', '믹서');
    await settle(page, 2500);
    rows = await loadAll(page, f);
    t = await listGrid(f).total();
    const mixers = rows.filter((r) => /Mixer|믹서/i.test(r['설비'] || ''));
    log.push(`목록(종류) "믹서" 클릭: ${t?.all}건, 설비 이름에 Mixer/믹서 ${mixers.length}행, 그 외 설비 ${[...new Set(rows.filter((r) => !mixers.includes(r)).map((r) => r['설비']))].slice(0, 5).join(', ') || '없음'}`);
    expect.soft(rows.length, '믹서 계획 있음').toBeGreaterThan(0);
    expect.soft(rows.some((r) => r['설비번호'] === '100302AG13'), '믹서 설비 100302AG13 의 계획이 보여야 함').toBe(true);
    note(log.join('\n'));
  });

  test('AD210_TC_014 (행 클릭) 작업발행·작업완료 상태의 상세를 조회한다.', async ({ page }) => {
    test.setTimeout(180_000);
    const log: string[] = [];
    for (const st of ['작업발행', '작업완료'] as const) {
      const { f, idx, row } = await findPlan(page, st);
      if (idx < 0) { log.push(`${st}: [sychoi] 계획 없음`); expect.soft(idx, `${st} 계획 있음`).toBeGreaterThanOrEqual(0); continue; }
      await clickRow(f, idx);
      const d = await detailOf(page, 'period', 'pmi');
      const v = async (id: string) => fieldValue(d, `workPmiDetailDTO.${id}`).catch(() => '');
      const tabs = await d.evaluate(() => [...document.querySelectorAll<HTMLElement>('a, span, li')].filter((e) => e.offsetWidth > 0 && /^(점검항목|표준작업|첨부문서)\s*\d*$/.test(e.innerText.trim())).map((e) => e.innerText.trim()));
      const vals = { 점검작업: await v('pminslistId'), 일정상태: await v('pmschedStatusDesc'), 설비: await v('equipDesc'), 점검명: await v('pmiDesc'), 점검일자: await v('wkorDate') };
      log.push(`${st} 행(${row['예방작업번호']}, ${row['일정조정']}) → 점검작업 상세 ${JSON.stringify(vals)}, 하위 탭 ${[...new Set(tabs)].join(', ')}`);
      expect.soft(vals.일정상태, `${st} 상세 일정상태`).toBe(st);
      expect.soft(vals.점검작업, '점검작업# 있음').not.toBe('');
      expect.soft(vals.설비, '설비 = 목록').toBe(row['설비']);
      for (const t of ['점검항목', '표준작업', '첨부문서']) expect.soft(tabs.some((x) => x.startsWith(t)), `하위 탭 ${t}`).toBe(true);
    }
    note(log.join('\n'));
  });

  test('AD210_TC_017 (상세) 데이터 표시 형식을 확인한다.', async ({ page }) => {
    test.setTimeout(180_000);
    const log: string[] = [];
    let p = await findPlan(page, '작업계획');
    await clickRow(p.f, p.idx);
    let d = await detailOf(page, 'period', 'plan');
    const sd = await fieldValue(d, 'workCalPmRInsPeriodDetailDTO.schedDate');
    log.push(`일정 상세 작업일자 "${sd}"`);
    expect.soft(isDate(sd), '작업일자 yyyy-mm-dd').toBe(true);
    p = await findPlan(page, '작업완료');
    await clickRow(p.f, p.idx);
    d = await detailOf(page, 'period', 'pmi');
    for (const id of ['wkorDate', 'startDate', 'endDate']) {
      const v = await fieldValue(d, `workPmiDetailDTO.${id}`);
      log.push(`점검작업 ${id} "${v}"`);
      if (v) expect.soft(isDate(v), `${id} yyyy-mm-dd`).toBe(true);
    }
    const wt = d.locator('[id="workPmiDetailDTO.workTime"]');
    const align = await wt.evaluate((e) => getComputedStyle(e).textAlign);
    log.push(`점검시간[분] "${await wt.inputValue()}" 정렬 ${align}`);
    expect.soft(align, '숫자 오른쪽 정렬').toBe('right');
    note(log.join(', '));
  });

  test('AD210_TC_018 읽기전용 필드를 확인한다.', async ({ page }) => {
    test.setTimeout(180_000);
    const log: string[] = [];
    let p = await findPlan(page, '작업계획');
    await clickRow(p.f, p.idx);
    let d = await detailOf(page, 'period', 'plan');
    const plan = await d.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('input[id^="workCalPmRInsPeriodDetailDTO."], textarea[id^="workCalPmRInsPeriodDetailDTO."]')].filter((e) => e.offsetWidth > 0).map((e) => [e.id.split('.')[1], e.readOnly || e.disabled] as [string, boolean]));
    const planBad = plan.filter(([id, ro]) => (id === 'schedDate' ? ro : !ro)).map(([id]) => id);
    log.push(`일정 상세 ${plan.length}칸: 수정 가능 = ${plan.filter(([, ro]) => !ro).map(([i]) => i).join(', ')}`);
    expect.soft(planBad, '작업일자만 수정 가능').toEqual([]);
    p = await findPlan(page, '작업발행');
    await clickRow(p.f, p.idx);
    d = await detailOf(page, 'period', 'pmi');
    const ids = ['pminslistId', 'pmschedStatusDesc', 'woTypeDesc', 'pmTypeDesc', 'equipDesc', 'eqLocDesc', 'workTime'];
    const pmiBad: string[] = [];
    for (const id of ids) {
      const ro = await d.locator(`[id="workPmiDetailDTO.${id}"]`).evaluate((e) => (e as HTMLInputElement).readOnly || (e as HTMLInputElement).disabled);
      if (!ro) pmiBad.push(id);
    }
    log.push(`점검작업 상세 ${ids.join(', ')} 중 수정 가능 ${pmiBad.join(', ') || '없음'}`);
    expect.soft(pmiBad, '점검작업 읽기전용').toEqual([]);
    note(log.join('\n'));
  });

  test('AD210_TC_040 점검항목 목록을 조회한다.', async ({ page }) => {
    const p = await findPlan(page, '작업발행');
    await clickRow(p.f, p.idx);
    await detailOf(page, 'period', 'pmi');
    const pl = await waitFrame(page, 'tabFrameTAB.workPmiPointList_workPmiDetail');
    await settle(page, 1500);
    const g = new Grid(pl, '점검항목');
    const rows = await g.rows();
    const t = await g.total();
    const d = page.frames().find((x) => x.name() === pmiDetailFrame('period'))!;
    const tabNum = await d.evaluate(() => (document.body.innerText.match(/점검항목\s*(\d+)/) || [])[1] || '');
    const raw = rows.map((r) => r['점검순서']);
    // 점검순서가 비어 있는 항목(주기에서 순서 없이 등록)은 순서 비교에서 빼고 기록만
    const order = raw.filter((v) => v !== '').map((v) => Number(v));
    note(`점검작업(${p.row['예방작업번호']}, ${p.row['일정조정']}): 점검항목 ${rows.length}행, Total ${t?.loaded}/${t?.all}, 탭 제목 숫자 ${tabNum}, 점검순서 ${raw.map((v) => `"${v}"`).join(', ')} (${rows.map((r) => r['점검항목']).join(' / ')})`);
    expect.soft(rows.length).toBeGreaterThan(0);
    expect.soft(t?.all).toBe(rows.length);
    expect.soft(Number(tabNum)).toBe(rows.length);
    expect.soft(order.every((v, i) => i === 0 || order[i - 1] <= v), '점검순서대로').toBe(true);
  });

  test('AD210_TC_042 (상세보기 버튼) 점검항목 상세를 조회한다.', async ({ page }) => {
    const p = await findPlan(page, '작업발행');
    await clickRow(p.f, p.idx);
    await detailOf(page, 'period', 'pmi');
    const pl = await waitFrame(page, 'tabFrameTAB.workPmiPointList_workPmiDetail');
    await settle(page, 1500);
    const first = (await new Grid(pl, '점검항목').rows())[0];
    await new Grid(pl, '점검항목').clickCell('점검항목', first['점검항목']);
    await settle(page, 2000);
    const winP = page.context().waitForEvent('page', { timeout: 15_000 }).catch(() => null);
    await clickButton(pl, '상세보기');
    const win = await winP;
    expect(win, '상세보기 새 창').toBeTruthy();
    await settle(win!, 2500);
    let shown = false;
    for (const fr of win!.frames()) {
      const vals = await fr.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('input, textarea')].map((e) => e.value)).catch(() => [] as string[]);
      if (vals.includes(first['점검항목'])) shown = true;
    }
    note(`점검항목 "${first['점검항목']}" 상세보기 → 새 창 열림, 같은 항목 ${shown ? '표시' : '안 보임'}`);
    expect(shown).toBe(true);
    await win!.close();
  });

  for (const [id, tab, frame, header] of [
    ['AD210_TC_043', '점검항목', 'tabFrameTAB.workPmiPointList_workPmiDetail', '점검항목'],
    ['AD210_TC_045', '표준작업', 'tabFrameTAB.workPmiStdPointHdrList_workPmiDetail', '표준작업명'],
  ]) {
    test(`${id} ${tab} 목록을 Excel로 다운로드한다.`, async ({ page }) => {
      const p = await findPlan(page, '작업발행');
      await clickRow(p.f, p.idx);
      const d = await detailOf(page, 'period', 'pmi');
      if (tab !== '점검항목') await openSubTab(page, d, tab);
      const f = await waitFrame(page, frame);
      await settle(page, 1500);
      const n = (await new Grid(f, header).rows()).length;
      const winP = page.context().waitForEvent('page', { timeout: 15_000 });
      await clickButton(f, 'Excel');
      const win = await winP;
      const file = await win.waitForEvent('download', { timeout: 60_000 });
      const saved = test.info().outputPath(file.suggestedFilename());
      await file.saveAs(saved);
      note(`${tab} ${n}행 → "${file.suggestedFilename()}" ${fs.statSync(saved).size.toLocaleString()} bytes`);
      expect(fs.statSync(saved).size).toBeGreaterThan(0);
      await win.close();
    });
  }

  test('AD210_TC_044 표준작업 목록을 조회한다.', async ({ page }) => {
    const p = await findPlan(page, '작업발행');
    await clickRow(p.f, p.idx);
    const d = await detailOf(page, 'period', 'pmi');
    const tabNum = await d.evaluate(() => (document.body.innerText.match(/표준작업\s*(\d+)/) || [])[1] || '');
    await openSubTab(page, d, '표준작업');
    const f = await waitFrame(page, 'tabFrameTAB.workPmiStdPointHdrList_workPmiDetail');
    const g = new Grid(f, '표준작업명');
    const rows = await g.rows();
    const t = await g.total();
    note(`표준작업 ${rows.length}행 (${rows.map((r) => r['표준작업명']).join(', ')}), Total ${t?.loaded}/${t?.all}, 탭 제목 숫자 ${tabNum}`);
    expect.soft(t?.all).toBe(rows.length);
    expect.soft(Number(tabNum)).toBe(rows.length);
  });

  test('AD210_EC_012 카렌다 숫자와 목록(조건) 건수를 맞춰 본다.', async ({ page }) => {
    const f = await openTab(page, 'month');
    await search(page, f);
    const cells = await calendarCells(f);
    const sum = cells.reduce((a, c) => a + c.p, 0);
    const now = new Date();
    const yyyymm = ym(today());
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const fp = await searchPeriod(page, { from: `${yyyymm}-01`, to: `${yyyymm}-${last}` });
    const t = await listGrid(fp).total();
    note(`${yyyymm} 전체: 카렌다(월간) 날짜 숫자 합 ${sum}건 / 목록(조건) 같은 기간 Total ${t?.all}건`);
    expect(sum).toBe(t?.all);
  });
});
