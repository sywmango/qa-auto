import { test, expect, Page, Frame } from '@playwright/test';
import fs from 'fs';
import { openMenu, waitFrame, clickButton, fieldValue, settle, Grid, openLov, lovTotal, pickInLov, visibleTreeNodes } from '../support/dream';
import { put, dateAfter, closeLov } from '../support/form';
import { TAB, TabKey, openTab, listGrid, search, searchPeriod, loadAll, clickRow, detailOf, findPlan, isDate, note, pmiDetailFrame } from '../support/pmplan';

// 작업관리 > 정기점검작업 > 정기점검계획 (AD210) — 조회만 하는 케이스 (데이터를 만들거나 바꾸지 않음)
// 테스트 제목 앞 번호 = docs\AD210\AD210_UT_정기점검계획_양식.xlsx 의 테스트ID
// 비교용 데이터는 [sychoi] 주기의 계획 (작업명 검색 '[sychoi]')

const SY = '[sychoi]';
const today = () => dateAfter(0);
const ym = (d: string) => d.slice(0, 7);

/** 카렌다 칸의 P/S/C 숫자와 링크 인자. 연간은 월 13칸(마지막 = 계), 월간은 날짜 칸 */
async function calendarCells(f: Frame) {
  return f.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('span.p')].filter((s) => s.offsetWidth > 0).map((p) => {
      const box = p.parentElement!;
      const num = (cls: string) => Number((box.querySelector(`span.${cls}`)?.textContent || '').replace(/[^\d]/g, '') || 0);
      const href = p.querySelector('a')?.getAttribute('href') || '';
      const day = box.parentElement?.querySelector('.date_box')?.textContent?.trim() || '';
      return { p: num('p'), s: num('s'), c: num('c'), href, day };
    }),
  );
}

/** 읽기전용(달력 선택) 칸에 값 넣기: 화면의 년월 선택기 대신 값과 change 이벤트 */
async function setReadonly(f: Frame, id: string, value: string) {
  await f.locator(`[id="${id}"]`).evaluate((e, v) => {
    (e as HTMLInputElement).value = v;
    e.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** 점검작업 상세의 하위 탭 클릭 (탭 글자 예: "표준작업1"). 탭 목록 프레임이 보일 때까지 */
async function openSubTab(page: Page, d: Frame, tab: string) {
  // 하위 탭은 아코디언으로 모두 펼쳐져 있음 (탭 글자를 누르면 오히려 접힘) → 누르지 않고 기다리기만
  if (process.env.QA_DEBUG) console.log('[tab]', tab, d.name());
  await settle(page, 1000);
}

/** 카렌다 칸 숫자 클릭 (cls: p/s/c, i: 몇 번째 칸) */
async function clickCalendar(page: Page, f: Frame, i: number, cls: 'p' | 's' | 'c') {
  await f.locator(`span.${cls}:visible a`).nth(i).click();
  await settle(page, 2500);
}

test.describe('AD210 정기점검계획 (조회)', () => {
  test('AD210_TC_001 검색 필드의 기본값을 확인한다.', async ({ page }) => {
    const log: string[] = [];
    for (const k of ['year', 'month', 'period'] as TabKey[]) {
      const f = await openTab(page, k);
      const vals = await f.evaluate((dto) => [...document.querySelectorAll<HTMLInputElement>(`input[id^="${dto}."]`)].filter((e) => e.offsetWidth > 0).map((e) => [e.id.split('.')[1], e.value] as [string, string]), TAB[k].dto);
      const map = Object.fromEntries(vals);
      const dateKeys = ['filterYear', 'filterYyyymm', 'filterStartDate', 'filterEndDate'];
      const filled = vals.filter(([id, v]) => v && !dateKeys.includes(id));
      log.push(`${TAB[k].name}: ${vals.filter(([id]) => dateKeys.includes(id)).map(([id, v]) => `${id}=${v}`).join(', ')}, 그 외 값 있는 칸 ${filled.length}개${filled.length ? ` (${filled.map(([i, v]) => `${i}=${v}`).join(', ')})` : ''}`);
      if (k === 'year') expect.soft(map.filterYear, '년 = 올해').toBe(today().slice(0, 4));
      if (k === 'month') expect.soft(map.filterYyyymm, '년월 = 이번 달').toBe(ym(today()));
      if (k === 'period') {
        expect.soft(isDate(map.filterStartDate) && isDate(map.filterEndDate), '일정조정 일자 기본 기간').toBe(true);
        expect.soft(map.filterEndDate >= map.filterStartDate, '기간 시작 ≤ 끝').toBe(true);
      }
      expect.soft(filled.length, `${TAB[k].name} 나머지 칸 비어 있음`).toBe(0);
    }
    note(log.join('\n'));
  });

  test('AD210_TC_002 설비 Lov 팝업의 데이터를 확인한다.', async ({ page, context }) => {
    test.setTimeout(180_000);
    const log: string[] = [];
    const p2 = await context.newPage();
    await openMenu(p2, ['114', '447']);
    const ef = await waitFrame(p2, 'tabFrameTAB.assetMstrLoc_assetMstr');
    const eqTotal = (await new Grid(ef, '설비번호').total())?.all;
    await p2.close();
    for (const k of ['year', 'period'] as TabKey[]) {
      const f = await openTab(page, k);
      const lov = await openLov(page, f, `${TAB[k].dto}.filterEquipDesc`);
      const n = await lovTotal(lov);
      log.push(`${TAB[k].name} 설비 Lov ${n}건`);
      expect.soft(n, `${TAB[k].name} 설비 Lov 건수 = 설비 메뉴 건수`).toBe(eqTotal);
    }
    note(`${log.join(', ')} / 설비 메뉴 ${eqTotal}건`);
  });

  test('AD210_TC_003 그 외 검색 필드 Lov 팝업의 데이터를 확인한다.', async ({ page }) => {
    test.setTimeout(600_000);
    const sets: [TabKey, string, string][] = [
      ['year', '공장명', 'filterPlantDesc'], ['year', '부서', 'filterDeptDesc'], ['year', '작업그룹명', 'filterWkCtrDesc'],
      ['year', '담당자', 'filterEmpDesc'], ['year', '계획거래처', 'filterPlanVendorDesc'], ['year', '설비위치', 'filterEqLocDesc'], ['year', '설비종류', 'filterEqCtgDesc'],
      ['period', '부서(실행)', 'filterExeDeptDesc'], ['period', '담당자(실행)', 'filterExeEmpDesc'], ['period', '법정설비여부', 'filterIsLawEq'],
      ['period', '관리자(정)', 'filterMainMngName'], ['period', '관리자(부)', 'filterSubMngName'], ['period', '설비유형', 'filterEqCtgTypeDesc'], ['period', '사용부서', 'filterUsageDeptDesc'],
    ];
    const log: string[] = [];
    for (const [k, label, id] of sets) {
      const f = await openTab(page, k);
      try {
        const lov = await openLov(page, f, `${TAB[k].dto}.${id}`);
        const n = await lovTotal(lov);
        const nodes = n ? 0 : (await visibleTreeNodes(lov)).length;
        log.push(`${label}: ${n ?? 0}건${nodes ? ` (트리 ${nodes}개)` : ''}`);
        expect.soft((n ?? 0) + nodes, `${label} Lov 에 데이터가 있어야 함`).toBeGreaterThan(0);
        await closeLov(page);
      } catch {
        log.push(`${label}: 팝업 열기 실패`);
        expect.soft(false, `${label} Lov 팝업이 열려야 함`).toBe(true);
      }
    }
    note(log.join(', '));
  });

  test('AD210_TC_004 조건 하나로 정기점검계획을 검색한다.', async ({ page }) => {
    test.setTimeout(300_000);
    const base = (await findPlan(page, '작업계획')).row;
    const log: string[] = [];
    const check = async (where: string, f: Frame, col: string, value: string) => {
      const rows = await loadAll(page, f);
      const t = await listGrid(f).total();
      const words = col === '작업명' ? value.split(/\s+/) : [value];
      const bad = rows.filter((r) => !words.every((w) => (r[col] || '').includes(w)));
      log.push(`${where} ${col}="${value}": ${rows.length}행, Total ${t?.loaded}/${t?.all}, 불일치 ${bad.length}`);
      expect.soft(rows.length, `${where} ${col} 결과 있음`).toBeGreaterThan(0);
      expect.soft(bad.length, `${where} ${col} 조건과 다른 행 없음`).toBe(0);
      expect.soft(t?.all, `${where} Total = 행 수`).toBe(rows.length);
    };
    // 목록(조건)
    let f = await searchPeriod(page, { pmNo: base['예방작업번호'] });
    await check('목록(조건)', f, '예방작업번호', base['예방작업번호']);
    f = await searchPeriod(page, { pmDesc: base['작업명'] });
    await check('목록(조건)', f, '작업명', base['작업명']);
    f = await openTab(page, 'period');
    await put(f.locator(`[id="${TAB.period.dto}.filterStartDate"]`), dateAfter(-60));
    await put(f.locator(`[id="${TAB.period.dto}.filterEndDate"]`), dateAfter(400));
    await pickInLov(page, await openLov(page, f, `${TAB.period.dto}.filterEquipDesc`), base['설비번호'], '설비번호');
    await search(page, f);
    await check('목록(조건)', f, '설비', base['설비']);
    // 카렌다(연간), 카렌다(월간): 예방작업번호
    for (const k of ['year', 'month'] as TabKey[]) {
      f = await openTab(page, k);
      if (k === 'month') await setReadonly(f, `${TAB.month.dto}.filterYyyymm`, ym(base['일정조정']));
      await f.locator(`[id="${TAB[k].dto}.filterPmNo"]`).fill(base['예방작업번호']);
      await search(page, f);
      const cells = await calendarCells(f);
      // 목록은 카렌다 숫자를 누르면 나옴 → 계획이 있는 첫 칸
      const i = cells.findIndex((c) => c.p > 0);
      if (i < 0) { log.push(`${TAB[k].name}: 카렌다에 계획 없음`); expect.soft(i, `${TAB[k].name} 카렌다 계획 있음`).toBeGreaterThanOrEqual(0); continue; }
      await clickCalendar(page, f, i, 'p');
      await check(TAB[k].name, f, '예방작업번호', base['예방작업번호']);
    }
    note(log.join('\n'));
  });

  test('AD210_TC_005 여러 조건을 조합하여 검색한다.', async ({ page }) => {
    test.setTimeout(240_000);
    const base = (await findPlan(page, '작업계획')).row;
    const log: string[] = [];
    // ① 작업명 + 예방작업번호
    let f = await searchPeriod(page, { pmDesc: SY, pmNo: base['예방작업번호'] });
    let rows = await loadAll(page, f);
    let bad = rows.filter((r) => r['예방작업번호'] !== base['예방작업번호'] || !r['작업명'].includes(SY));
    log.push(`① 작업명 "${SY}" + 예방작업번호 ${base['예방작업번호']}: ${rows.length}행, 불일치 ${bad.length}`);
    expect.soft(rows.length).toBeGreaterThan(0);
    expect.soft(bad.length).toBe(0);
    // ② 예방작업번호 + 설비
    f = await openTab(page, 'period');
    await put(f.locator(`[id="${TAB.period.dto}.filterStartDate"]`), dateAfter(-60));
    await put(f.locator(`[id="${TAB.period.dto}.filterEndDate"]`), dateAfter(400));
    await f.locator(`[id="${TAB.period.dto}.filterPmNo"]`).fill(base['예방작업번호']);
    await pickInLov(page, await openLov(page, f, `${TAB.period.dto}.filterEquipDesc`), base['설비번호'], '설비번호');
    await search(page, f);
    rows = await loadAll(page, f);
    bad = rows.filter((r) => r['예방작업번호'] !== base['예방작업번호'] || r['설비'] !== base['설비']);
    log.push(`② 예방작업번호 ${base['예방작업번호']} + 설비 "${base['설비']}": ${rows.length}행, 불일치 ${bad.length}`);
    expect.soft(rows.length).toBeGreaterThan(0);
    expect.soft(bad.length).toBe(0);
    note(log.join('\n'));
  });

  test('AD210_TC_006 정기점검계획 전체를 검색한다.', async ({ page }) => {
    const f1 = await searchPeriod(page, { pmDesc: SY, from: today(), to: dateAfter(30) });
    const part = await listGrid(f1).total();
    const f2 = await searchPeriod(page, { pmDesc: '', from: today(), to: dateAfter(30) });
    const all = await listGrid(f2).total();
    note(`같은 기간(${today()}~${dateAfter(30)}) 작업명 "${SY}" ${part?.all}건 → 조건 없이 ${all?.all}건`);
    expect(all?.all ?? 0).toBeGreaterThan(part?.all ?? 0);
  });

  test('AD210_TC_007 검색 결과가 없는 조건으로 검색한다.', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const f = await searchPeriod(page, { pmDesc: '존재하지않는작업명_ZZ9' });
    const rows = await listGrid(f).rows();
    const t = await listGrid(f).total();
    note(`${rows.length}행, Total ${t?.loaded}/${t?.all}, 스크립트 에러 ${errors.length}건`);
    expect(rows.length).toBe(0);
    expect(t?.all).toBe(0);
    expect(errors).toEqual([]);
  });

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

  test('AD210_TC_011 조회된 목록을 정렬한다.', async ({ page }) => {
    test.setTimeout(300_000);
    const log: string[] = [];
    for (const k of ['period', 'loc'] as TabKey[]) {
      const f = k === 'period' ? await searchPeriod(page, { pmDesc: SY }) : await openTab(page, k);
      const header = f.locator('div.gridbox:visible .hdrcell', { hasText: /^\s*예방작업번호\s*$/ }).first();
      await header.click(); await settle(page, 1500);
      const a = (await listGrid(f).rows()).map((r) => Number(r['예방작업번호']));
      await header.click(); await settle(page, 1500);
      const b = (await listGrid(f).rows()).map((r) => Number(r['예방작업번호']));
      const asc = a.every((v, i) => i === 0 || a[i - 1] <= v);
      const desc = b.every((v, i) => i === 0 || b[i - 1] >= v);
      log.push(`${TAB[k].name} 예방작업번호 1회: ${a.slice(0, 5).join(',')} (오름차순 ${asc}) / 2회: ${b.slice(0, 5).join(',')} (내림차순 ${desc})`);
      expect.soft(asc && desc, `${TAB[k].name} 오름차순 → 내림차순`).toBe(true);
    }
    note(log.join('\n'));
  });

  test('AD210_TC_012 목록 건수 표시를 확인한다.', async ({ page }) => {
    test.setTimeout(240_000);
    const f = await searchPeriod(page, { pmDesc: SY });
    const t1 = await listGrid(f).total();
    const n1 = (await listGrid(f).rows()).length;
    const all = await loadAll(page, f);
    const t2 = await listGrid(f).total();
    note(`처음 Total ${t1?.loaded}/${t1?.all} (행 ${n1}) → 끝까지 스크롤 Total ${t2?.loaded}/${t2?.all} (행 ${all.length})`);
    expect.soft(t1?.loaded).toBe(n1);
    expect.soft(t2?.loaded).toBe(t2?.all);
    expect.soft(all.length).toBe(t1?.all);
  });

  test('AD210_TC_013 (행 클릭) 작업계획 상태의 상세를 조회한다.', async ({ page }) => {
    const { f, idx, row } = await findPlan(page, '작업계획');
    expect(idx, '[sychoi] 작업계획 계획이 있어야 함').toBeGreaterThanOrEqual(0);
    await clickRow(f, idx);
    const d = await detailOf(page, 'period', 'plan');
    const text = await d.evaluate(() => document.body.innerText);
    const title = text.match(/예방작업번호\s*:\s*(\d+)\s*\/\s*([^\n]*?)\s*저장/);
    const date = await fieldValue(d, 'workCalPmRInsPeriodDetailDTO.schedDate');
    note(`행(${row['예방작업번호']}, ${row['일정조정']}, 작업계획) 클릭 → 상세 제목 "예방작업번호 : ${title?.[1]} / ${title?.[2]}", 작업일자 ${date}`);
    expect.soft(title?.[1]).toBe(row['예방작업번호']);
    expect.soft(date).toBe(row['일정조정']);
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

  test('AD210_TC_015 목록과 상세의 값이 일치하는지 확인한다.', async ({ page }) => {
    const { f, idx, row } = await findPlan(page, '작업계획');
    await clickRow(f, idx);
    const d = await detailOf(page, 'period', 'plan');
    const pairs: [string, string][] = [
      ['일정조정', 'schedDate'], ['예방작업번호', 'pmNo'], ['작업명', 'pmDesc'], ['설비', 'equipDesc'], ['부서(계획)', 'deptDesc'],
      ['담당자(계획)', 'empDesc'], ['일정생성방법', 'scheduleTypeDesc'], ['비고', 'remark'],
    ];
    const diff: string[] = [];
    for (const [col, id] of pairs) {
      const dv = await fieldValue(d, `workCalPmRInsPeriodDetailDTO.${id}`);
      if ((row[col] ?? '') !== dv) diff.push(`${col}: 목록="${row[col]}" 상세="${dv}"`);
    }
    // 주기: 목록 "2M" ↔ 상세 주기 2 + 주기구분 월
    const cyc = await fieldValue(d, 'workCalPmRInsPeriodDetailDTO.cycle');
    const pt = await fieldValue(d, 'workCalPmRInsPeriodDetailDTO.periodTypeDesc');
    const unit: Record<string, string> = { D: '일', W: '주', M: '월', Y: '년' };
    const m = (row['주기'] || '').match(/^(\d+)([A-Z])$/);
    if (!m || m[1] !== cyc || !pt.startsWith(unit[m[2]] ?? '?')) diff.push(`주기: 목록="${row['주기']}" 상세="${cyc} ${pt}"`);
    note(diff.length ? diff.join('\n') : `${pairs.length + 1}개 항목 모두 일치 (예방작업번호 ${row['예방작업번호']}, ${row['일정조정']})`);
    expect(diff).toEqual([]);
  });

  test('AD210_TC_016 (목록) 데이터 표시 형식을 확인한다.', async ({ page }) => {
    test.setTimeout(300_000);
    const log: string[] = [];
    const statusNames = /^(작업계획|작업발행|작업완료|작업중|결재요청중|임원확인중|)$/;
    const checkRows = (where: string, rows: Record<string, string>[]) => {
      const bad: string[] = [];
      for (const col of ['초기계획', '일정조정', '작업일자', '완료일자']) {
        const wrong = rows.filter((r) => r[col] && !isDate(r[col]));
        if (wrong.length) bad.push(`${col} ${wrong.length}건 (예: ${wrong[0][col]})`);
      }
      const st = rows.filter((r) => r['일정상태'] !== undefined && !statusNames.test(r['일정상태']));
      if (st.length) bad.push(`일정상태 코드로 표시 ${st.length}건 (예: ${st[0]['일정상태']})`);
      const num = rows.filter((r) => r['예상작업시간(분)'] && !/^\d{1,3}(,\d{3})*$/.test(r['예상작업시간(분)']));
      if (num.length) bad.push(`예상작업시간 숫자 형식 ${num.length}건`);
      log.push(`${where} ${rows.length}행: ${bad.join(', ') || '이상 없음'}`);
      expect.soft(bad, `${where} 표시 형식`).toEqual([]);
    };
    let f = await openTab(page, 'year');
    await f.locator(`[id="${TAB.year.dto}.filterPmDesc"]`).fill(SY);
    await search(page, f);
    const ci = (await calendarCells(f)).findIndex((c) => c.c > 0);
    await clickCalendar(page, f, ci >= 0 ? ci : 9, 'p');
    checkRows('카렌다(연간)', await listGrid(f).rows());
    f = await openTab(page, 'month');
    await f.locator(`[id="${TAB.month.dto}.filterPmDesc"]`).fill(SY);
    await search(page, f);
    const mi = (await calendarCells(f)).findIndex((c) => c.c > 0);
    await clickCalendar(page, f, mi >= 0 ? mi : (await calendarCells(f)).findIndex((c) => c.p > 0), 'p');
    checkRows('카렌다(월간)', await listGrid(f).rows());
    for (const k of ['loc', 'ctg'] as TabKey[]) {
      f = await openTab(page, k);
      await new Grid(f, k === 'loc' ? '위치명' : '종류명').clickCell(k === 'loc' ? '위치명' : '종류명', k === 'loc' ? '안성공장' : '믹서');
      await settle(page, 2500);
      checkRows(TAB[k].name, await listGrid(f).rows());
    }
    f = await searchPeriod(page, { pmDesc: SY });
    checkRows('목록(조건)', await loadAll(page, f));
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

  test('AD210_TC_019 상세를 닫는다.', async ({ page }) => {
    const p = await findPlan(page, '작업계획');
    await clickRow(p.f, p.idx);
    const d = await detailOf(page, 'period', 'plan');
    const title = d.getByText(/예방작업번호\s*:/).first();
    await expect(title).toBeVisible();
    await d.locator('[class*="close"]:visible, [class*="Close"]:visible').first().click({ timeout: 5_000 });
    await settle(page, 1000);
    await expect(title).toBeHidden();
    note('하단 일정 상세의 닫기(ⓧ) 클릭 → 상세 닫힘');
  });

  test('AD210_TC_026 목록을 Excel로 다운로드한다.', async ({ page }) => {
    test.setTimeout(300_000);
    const log: string[] = [];
    for (const k of ['year', 'month', 'period'] as TabKey[]) {
      const f = k === 'period' ? await searchPeriod(page, { pmDesc: SY }) : await openTab(page, k);
      if (k !== 'period') {
        await f.locator(`[id="${TAB[k].dto}.filterPmDesc"]`).fill(SY);
        await search(page, f);
        await clickCalendar(page, f, (await calendarCells(f)).findIndex((c) => c.p > 0), 'p');
      }
      const t = await listGrid(f).total();
      const winP = page.context().waitForEvent('page', { timeout: 15_000 }).catch(() => null);
      const dlP = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);
      await clickButton(f, 'Excel');
      const win = await winP;
      const file = win ? await win.waitForEvent('download', { timeout: 60_000 }).catch(() => null) : await dlP;
      if (!file) { log.push(`${TAB[k].name}: 파일 안 받아짐`); expect.soft(file, `${TAB[k].name} Excel`).toBeTruthy(); continue; }
      const saved = test.info().outputPath(`${k}-${file.suggestedFilename()}`);
      await file.saveAs(saved);
      log.push(`${TAB[k].name}: "${file.suggestedFilename()}" ${fs.statSync(saved).size.toLocaleString()} bytes (목록 Total ${t?.all})`);
      expect.soft(fs.statSync(saved).size).toBeGreaterThan(0);
      await win?.close();
    }
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
