import { test, expect, Page, Frame } from '@playwright/test';
import fs from 'fs';
import { openMenu, waitFrame, clickButton, settle, Grid, openLov, lovTotal, pickInLov, visibleTreeNodes } from '../support/dream';
import { put, dateAfter, closeLov, popupMessage } from '../support/form';
import {
  TAB, TabKey, DTO, P, PV, F_POINT_VALUE, F_STD, openTab, listGrid, search, setReadonly, searchCond, searchCal, calendarCells, clickCalendar,
  loadAll, clickRow, detailOf, frameReady, val, pointList, note, isDate,
} from '../support/pmexec';

// 작업관리 > 정기점검작업 > 정기점검실행 (AP591) — 조회만 하는 케이스 (데이터를 만들거나 바꾸지 않음)
// 테스트 제목 앞 번호 = docs\AP591\cases.json 의 테스트ID
// 비교용 데이터: [sychoi] 주기 8007 (설비 100302AG13) 의 점검작업

const PM = '8007';
const EQ = '100302AG13';
const today = () => dateAfter(0);
const ym = (d: string) => d.slice(0, 7);
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

/** [sychoi] 8007 점검작업 (목록(조건), 넓은 기간) 중 상태가 status 인 것 */
async function findWork(page: Page, status: '작업발행' | '작업완료') {
  const f = await searchCond(page, { pmNo: PM });
  const rows = await loadAll(page, f);
  const idx = rows.findIndex((r) => r['설비번호'] === EQ && r['점검작업상태'] === status);
  return { f, rows, idx, row: rows[idx] };
}
async function openWork(page: Page, status: '작업발행' | '작업완료' = '작업발행') {
  const w = await findWork(page, status);
  expect(w.idx, `[sychoi] ${status} 점검작업이 있어야 함`).toBeGreaterThanOrEqual(0);
  await clickRow(w.f, w.idx);
  return { ...w, d: await detailOf(page, 'cond') };
}

test.describe('AP591 정기점검실행 (조회)', () => {
  test('AP591_TC_001 검색 필드의 기본값을 확인한다.', async ({ page }) => {
    const log: string[] = [];
    for (const k of ['cal', 'cond'] as TabKey[]) {
      const f = await openTab(page, k);
      const vals = await f.evaluate((dto) => [...document.querySelectorAll<HTMLInputElement>(`input[id^="${dto}."]`)].filter((e) => e.offsetWidth > 0).map((e) => [e.id.split('.')[1], e.value] as [string, string]), DTO);
      const map = Object.fromEntries(vals);
      const dateKeys = ['filterYyyymm', 'filterStartDate', 'filterEndDate'];
      const filled = vals.filter(([id, v]) => v && !dateKeys.includes(id));
      log.push(`${TAB[k].name}: ${vals.filter(([id]) => dateKeys.includes(id)).map(([id, v]) => `${id}="${v}"`).join(', ')}, 그 외 값 있는 칸 ${filled.length}개${filled.length ? ` (${filled.map(([i, v]) => `${i}=${v}`).join(', ')})` : ''}`);
      if (k === 'cal') expect.soft(map.filterYyyymm, '년월 = 이번 달').toBe(ym(today()));
      if (k === 'cond') expect.soft(isDate(map.filterStartDate), '일정조정 일자 시작 기본값').toBe(true);
      expect.soft(filled.length, `${TAB[k].name} 나머지 칸 비어 있음`).toBe(0);
    }
    note(log.join('\n'));
  });

  test('AP591_TC_002 검색 필드의 필수값 표시를 확인한다.', async ({ page }) => {
    const log: string[] = [];
    for (const k of ['cal', 'cond'] as TabKey[]) {
      const f = await openTab(page, k);
      const req = await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('label')].filter((l) => l.offsetWidth > 0 && (/check/.test(l.className) || /[•*]/.test(l.innerText))).map((l) => l.innerText.replace(/[•*]/g, '').trim()));
      log.push(`${TAB[k].name} 필수 표시: ${req.join(', ') || '없음'}`);
      if (k === 'cal') expect.soft(req, '카렌다(월간) 년월 필수 표시').toContain('년월');
    }
    // 카렌다(월간) 년월을 비우고 검색
    const f = await openTab(page, 'cal');
    // 읽기전용 칸이라 글자로 못 지움 → 칸 옆 지우기(삭제) 버튼이 있으면 그것으로, 없으면 값을 비움
    const box = f.locator(`[id="${DTO}.filterYyyymm"]`).locator('xpath=..');
    const clear = box.locator('a, span, button, p').filter({ hasText: /^\s*삭제\s*$/ }).first();
    const how = (await clear.count()) ? '삭제 버튼' : '값 비움';
    if (how === '삭제 버튼') await clear.click({ force: true }); else await setReadonly(f, `${DTO}.filterYyyymm`, '');
    log.push(`년월 칸 ${how} → "${await f.locator(`[id="${DTO}.filterYyyymm"]`).inputValue()}"`);
    const dialogs: string[] = [];
    page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });
    await f.locator('a.b_search:visible').first().click();
    await settle(page, 1500);
    const msg = [...dialogs, await popupMessage(page)].filter(Boolean).join(' / ');
    const head = await f.evaluate(() => (document.body.innerText.match(/\n\s*(\d{4}-\d{2}|\s*)\s*\n\s*일\s*\n/) || [])[1] ?? '').catch(() => '');
    const cells = await calendarCells(f);
    log.push(`카렌다(월간) 년월 비우고 검색 → ${msg ? `안내 "${msg}"` : '안내 없음'}, 카렌다 제목 "${head.trim()}", 날짜 칸 ${cells.length}개 T 합 ${cells.reduce((a, c) => a + c.t, 0)}`);
    if (!msg) await page.screenshot({ path: 'playwright/.data/evidence/ap591-TC_002.png' });
    note(log.join('\n'));
    expect.soft(msg, '년월 필수 안내').toMatch(/필수|입력|년월/);
  });

  test('AP591_TC_003 설비 Lov 팝업의 데이터를 확인한다.', async ({ page, context }) => {
    test.setTimeout(180_000);
    const log: string[] = [];
    const p2 = await context.newPage();
    await openMenu(p2, ['114', '447']);
    const ef = await waitFrame(p2, 'tabFrameTAB.assetMstrLoc_assetMstr');
    const eqTotal = (await new Grid(ef, '설비번호').total())?.all;
    await p2.close();
    for (const k of ['cal', 'cond'] as TabKey[]) {
      const f = await openTab(page, k);
      const lov = await openLov(page, f, `${DTO}.filterEquipDesc`);
      const n = await lovTotal(lov);
      log.push(`${TAB[k].name} 설비 Lov ${n}건`);
      expect.soft(n, `${TAB[k].name} 설비 Lov 건수 = 설비 메뉴 건수`).toBe(eqTotal);
      await closeLov(page);
    }
    note(`${log.join(', ')} / 설비 메뉴 ${eqTotal}건`);
  });

  test('AP591_TC_004 그 외 검색 필드 Lov 팝업의 데이터를 확인한다.', async ({ page }) => {
    test.setTimeout(600_000);
    const sets: [TabKey, string, string][] = [
      ['cal', '공장명', 'filterPlantDesc'], ['cal', '부서', 'filterDeptDesc'], ['cal', '작업그룹명', 'filterWkCtrDesc'], ['cal', '거래처', 'filterVendorDesc'],
      ['cal', '설비위치', 'filterEqLocDesc'], ['cal', '설비종류', 'filterEqCtgDesc'],
      ['cond', '담당자', 'filterManagerDesc'], ['cond', '사용부서', 'filterUsageDeptDesc'], ['cond', '점검작업상태', 'filterPmSchedStatusDesc'],
      ['cond', '법정설비여부', 'filterIsLawEq'], ['cond', '관리자(정)', 'filterMainMngName'], ['cond', '관리자(부)', 'filterSubMngName'],
    ];
    const log: string[] = [];
    for (const [k, label, id] of sets) {
      const f = await openTab(page, k);
      try {
        const lov = await openLov(page, f, `${DTO}.${id}`);
        const n = await lovTotal(lov);
        const nodes = n ? 0 : (await visibleTreeNodes(lov)).length;
        const rows = n ? 0 : await lov.evaluate(() => [...document.querySelectorAll<HTMLElement>('div.gridbox .objbox tr')].filter((t) => t.offsetHeight > 0 && t.querySelector('td')).length);
        log.push(`${TAB[k].name} ${label}: ${n ?? rows}건${nodes ? ` (트리 ${nodes}개)` : ''}`);
        expect.soft((n ?? rows) + nodes, `${label} Lov 에 데이터가 있어야 함`).toBeGreaterThan(0);
        await closeLov(page);
      } catch {
        log.push(`${TAB[k].name} ${label}: 팝업 열기 실패`);
        expect.soft(false, `${label} Lov 팝업이 열려야 함`).toBe(true);
        await closeLov(page);
      }
    }
    // 점검Group 필드 (예전 이슈: 사용하지 않으므로 숨김 필요)
    for (const k of ['cal', 'cond'] as TabKey[]) {
      const f = await openTab(page, k);
      const labels = await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('label')].filter((l) => l.offsetWidth > 0).map((l) => l.innerText.trim()));
      const grp = labels.filter((l) => /점검\s*Group/i.test(l));
      log.push(`${TAB[k].name} 점검Group 필드 ${grp.length ? '보임' : '안 보임'}`);
      expect.soft(grp, `${TAB[k].name} 점검Group 숨김`).toEqual([]);
    }
    note(log.join('\n'));
  });

  test('AP591_TC_005 조건 하나로 정기점검실행을 검색한다.', async ({ page }) => {
    test.setTimeout(300_000);
    const base = (await findWork(page, '작업발행')).row;
    const log: string[] = [];
    const check = async (where: string, f: Frame, col: string, value: string, exact = false) => {
      const rows = await loadAll(page, f);
      const t = await listGrid(f).total();
      const bad = rows.filter((r) => (exact ? r[col] !== value : !(r[col] || '').includes(value)));
      log.push(`${where} ${col}="${value}": ${rows.length}행, Total ${t?.loaded}/${t?.all}, 다른 값 ${bad.length}${bad.length ? ` (예: ${bad[0][col]})` : ''}`);
      expect.soft(rows.length, `${where} ${col} 결과 있음`).toBeGreaterThan(0);
      expect.soft(bad.length, `${where} ${col} 조건과 다른 행 없음`).toBe(0);
      expect.soft(t?.all, `${where} Total = 행 수`).toBe(rows.length);
    };
    // 목록(조건): 설비 (Lov)
    let f = await openTab(page, 'cond');
    await put(f.locator(`[id="${DTO}.filterStartDate"]`), dateAfter(-60));
    await put(f.locator(`[id="${DTO}.filterEndDate"]`), dateAfter(400));
    await pickInLov(page, await openLov(page, f, `${DTO}.filterEquipDesc`), EQ, '설비번호');
    await search(page, f);
    await check('목록(조건)', f, '설비번호', EQ, true);
    // 목록(조건): 점검작업상태 (Lov) = 작업완료
    f = await openTab(page, 'cond');
    await put(f.locator(`[id="${DTO}.filterStartDate"]`), dateAfter(-30));
    await put(f.locator(`[id="${DTO}.filterEndDate"]`), dateAfter(0));
    await pickInLov(page, await openLov(page, f, `${DTO}.filterPmSchedStatusDesc`), '작업완료');
    await search(page, f);
    await check('목록(조건)', f, '점검작업상태', '작업완료', true);
    // 카렌다(월간): 예방작업번호 → 계획 있는 날 T 클릭
    f = await searchCal(page, { ym: ym(base['점검일자']), pmNo: PM });
    const cells = await calendarCells(f);
    const i = cells.findIndex((c) => c.t > 0);
    if (i < 0) { log.push('카렌다(월간): 예방작업번호 결과 없음'); expect.soft(i).toBeGreaterThanOrEqual(0); } else {
      await clickCalendar(page, f, i, 'T');
      const rows = await loadAll(page, f);
      const t = await listGrid(f).total();
      const mine = rows.filter((r) => r['설비번호'] === EQ || /sychoi/.test(r['점검명']));
      log.push(`카렌다(월간) 예방작업번호=${PM} ${ym(base['점검일자'])}: 날짜 ${cells[i].day}일 T ${cells[i].t} 클릭 → ${rows.length}행, Total ${t?.all}, [sychoi] 설비 행 ${mine.length}`);
      expect.soft(rows.length, '카렌다 숫자 클릭 목록 = T').toBe(cells[i].t);
      expect.soft(mine.length, '8007 점검작업만').toBe(rows.length);
    }
    note(log.join('\n'));
  });

  test('AP591_TC_006 여러 조건을 조합하여 검색한다.', async ({ page }) => {
    test.setTimeout(240_000);
    const log: string[] = [];
    // ① 예방작업번호 + 설비
    let f = await openTab(page, 'cond');
    await put(f.locator(`[id="${DTO}.filterStartDate"]`), dateAfter(-60));
    await put(f.locator(`[id="${DTO}.filterEndDate"]`), dateAfter(400));
    await f.locator(`[id="${DTO}.filterPmNo"]`).fill(PM);
    await pickInLov(page, await openLov(page, f, `${DTO}.filterEquipDesc`), EQ, '설비번호');
    await search(page, f);
    let rows = await loadAll(page, f);
    let bad = rows.filter((r) => r['설비번호'] !== EQ);
    log.push(`① 예방작업번호 ${PM} + 설비 ${EQ}: ${rows.length}행, 다른 설비 ${bad.length}`);
    expect.soft(rows.length).toBeGreaterThan(0);
    expect.soft(bad.length).toBe(0);
    // ② 예방작업번호 + 점검작업상태(작업발행)
    f = await openTab(page, 'cond');
    await put(f.locator(`[id="${DTO}.filterStartDate"]`), dateAfter(-60));
    await put(f.locator(`[id="${DTO}.filterEndDate"]`), dateAfter(400));
    await f.locator(`[id="${DTO}.filterPmNo"]`).fill(PM);
    await pickInLov(page, await openLov(page, f, `${DTO}.filterPmSchedStatusDesc`), '작업발행');
    await search(page, f);
    rows = await loadAll(page, f);
    const all = await loadAll(page, await searchCond(page, { pmNo: PM }));
    bad = rows.filter((r) => r['점검작업상태'] !== '작업발행');
    const expectN = all.filter((r) => r['점검작업상태'] === '작업발행').length;
    log.push(`② 예방작업번호 ${PM} + 점검작업상태 작업발행: ${rows.length}행 (예방작업번호만 검색한 ${all.length}행 중 작업발행 ${expectN}), 다른 상태 ${bad.length}`);
    expect.soft(rows.length).toBe(expectN);
    expect.soft(bad.length).toBe(0);
    note(log.join('\n'));
  });

  test('AP591_TC_007 정기점검실행 전체를 검색한다.', async ({ page }) => {
    const f1 = await searchCond(page, { pmNo: PM, from: today(), to: dateAfter(30) });
    const part = await listGrid(f1).total();
    const f2 = await searchCond(page, { pmNo: '', from: today(), to: dateAfter(30) });
    const all = await listGrid(f2).total();
    const n = (await listGrid(f2).rows()).length;
    note(`같은 기간(${today()}~${dateAfter(30)}) 예방작업번호 ${PM} ${part?.all}건 → 조건 없이 Total ${all?.loaded}/${all?.all} (처음 불러온 행 ${n})`);
    expect.soft(all?.loaded).toBe(n);
    expect(all?.all ?? 0).toBeGreaterThan(part?.all ?? 0);
  });

  test('AP591_TC_008 검색 결과가 없는 조건으로 검색한다.', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const f = await searchCond(page, { pmNo: '99999999' });
    const rows = await listGrid(f).rows();
    const t = await listGrid(f).total();
    note(`예방작업번호 99999999: ${rows.length}행, Total ${t?.loaded}/${t?.all}, 스크립트 에러 ${errors.length}건`);
    expect(rows.length).toBe(0);
    expect(t?.all ?? 0).toBe(0);
    expect(errors).toEqual([]);
  });

  test('AP591_TC_009 월간 카렌다의 일별 건수를 확인한다.', async ({ page }) => {
    test.setTimeout(600_000);
    const log: string[] = [];
    // [sychoi] 8007 점검작업이 있는 달: 이번 달, 12월
    for (const yyyymm of [ym(today()), '2026-12']) {
      const f = await searchCal(page, { ym: yyyymm, pmNo: PM });
      const cells = await calendarCells(f);
      const [y, m] = yyyymm.split('-').map(Number);
      const fp = await searchCond(page, { pmNo: PM, from: `${yyyymm}-01`, to: `${yyyymm}-${lastDay(y, m)}` });
      const pr = await loadAll(page, fp);
      const bad: string[] = [];
      for (const c of cells) {
        const day = `${yyyymm}-${c.day.padStart(2, '0')}`;
        const same = pr.filter((r) => r['점검일자'] === day);
        const p = same.filter((r) => r['점검작업상태'] !== '작업완료').length;
        const cc = same.filter((r) => r['점검작업상태'] === '작업완료').length;
        if (c.t !== same.length || c.p !== p || c.c !== cc) bad.push(`${day} 카렌다 ${c.t}/${c.p}/${c.c} ≠ 목록 ${same.length}/${p}/${cc}`);
      }
      log.push(`${yyyymm} (예방작업번호 ${PM}): 날짜 칸 ${cells.length}개, 카렌다 T 합 ${cells.reduce((a, c) => a + c.t, 0)} / 목록(조건) ${pr.length}건, 다른 날 ${bad.length}개${bad.length ? ` (${bad.slice(0, 4).join('; ')})` : ''}`);
      expect.soft(bad, `${yyyymm} 날짜별 T/P/C = 목록(조건)`).toEqual([]);
    }
    note(log.join('\n'));
  });

  test('AP591_TC_010 카렌다 숫자를 눌러 목록을 조회한다.', async ({ page }) => {
    test.setTimeout(300_000);
    // 이번 달 전체: 작업완료가 있는 날을 골라 T, P, C 각각 클릭
    const f = await searchCal(page, {});
    const cells = await calendarCells(f);
    let i = cells.findIndex((c) => c.c > 0 && c.p > 0);
    if (i < 0) i = cells.findIndex((c) => c.t > 0);
    const c = cells[i];
    const day = `${ym(today())}-${c.day.padStart(2, '0')}`;
    const log: string[] = [`${day} 카렌다 T/P/C = ${c.t}/${c.p}/${c.c}`];
    for (const kind of ['T', 'P', 'C'] as const) {
      const n = { T: c.t, P: c.p, C: c.c }[kind];
      const f2 = await searchCal(page, {});
      await clickCalendar(page, f2, i, kind);
      const rows = await loadAll(page, f2);
      const t = await listGrid(f2).total();
      const other = rows.filter((r) => r['점검일자'] !== day).length;
      const done = rows.filter((r) => r['점검작업상태'] === '작업완료').length;
      log.push(`${kind} 클릭 → ${rows.length}행 (Total ${t?.all}), 다른 날 ${other}, 작업완료 ${done}`);
      expect.soft(rows.length, `${kind} 클릭 행 수 = ${n}`).toBe(n);
      expect.soft(other, `${kind} 다른 날 없음`).toBe(0);
      if (kind === 'P') expect.soft(done, 'P 는 작업완료 없음').toBe(0);
      if (kind === 'C') expect.soft(done, 'C 는 작업완료만').toBe(rows.length);
    }
    note(log.join('\n'));
  });

  test('AP591_TC_011 조회된 목록을 정렬한다.', async ({ page }) => {
    test.setTimeout(300_000);
    const log: string[] = [];
    const byCode = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
    const sorted = (a: string[], dir: 1 | -1) => [byCode, (x: string, y: string) => x.localeCompare(y, 'ko')].some((cmp) => a.every((v, i) => i === 0 || dir * cmp(a[i - 1], v) <= 0));
    for (const k of ['cal', 'cond'] as TabKey[]) {
      let f: Frame;
      if (k === 'cond') f = await searchCond(page, { pmNo: PM });
      else { f = await searchCal(page, {}); await clickCalendar(page, f, (await calendarCells(f)).findIndex((c) => c.t > 0), 'T'); }
      for (const col of ['점검일자', '점검명']) {
        const header = f.locator('div.gridbox:visible .hdrcell', { hasText: new RegExp(`^\\s*${col.replace(/[[\]]/g, '\\$&')}\\s*$`) }).first();
        await header.click(); await settle(page, 1500);
        const a = (await listGrid(f).rows()).map((r) => r[col]);
        await header.click(); await settle(page, 1500);
        const b = (await listGrid(f).rows()).map((r) => r[col]);
        const asc = sorted(a, 1), desc = sorted(b, -1);
        log.push(`${TAB[k].name} ${col} 1회: ${a.slice(0, 3).join(', ')} (오름차순 ${asc}) / 2회: ${b.slice(0, 3).join(', ')} (내림차순 ${desc})`);
        expect.soft(asc && desc, `${TAB[k].name} ${col} 오름차순 → 내림차순`).toBe(true);
      }
    }
    note(log.join('\n'));
  });

  test('AP591_TC_012 목록 건수 표시를 확인한다.', async ({ page }) => {
    test.setTimeout(240_000);
    const f = await searchCond(page, { pmNo: '', from: today(), to: dateAfter(2) });
    const t1 = await listGrid(f).total();
    const n1 = (await listGrid(f).rows()).length;
    const all = await loadAll(page, f);
    const t2 = await listGrid(f).total();
    note(`${today()}~${dateAfter(2)} 전체: 처음 Total ${t1?.loaded}/${t1?.all} (행 ${n1}) → 끝까지 스크롤 Total ${t2?.loaded}/${t2?.all} (행 ${all.length})`);
    expect.soft(t1?.loaded).toBe(n1);
    expect.soft(t2?.loaded).toBe(t2?.all);
    expect.soft(all.length).toBe(t1?.all);
  });

  test('AP591_TC_013 (행 클릭) 조회된 데이터의 상세정보를 조회한다.', async ({ page }) => {
    const log: string[] = [];
    for (const k of ['cond', 'cal'] as TabKey[]) {
      let f: Frame, idx = 0;
      if (k === 'cond') { const w = await findWork(page, '작업발행'); f = w.f; idx = w.idx; } else { f = await searchCal(page, {}); await clickCalendar(page, f, (await calendarCells(f)).findIndex((c) => c.t > 0), 'T'); }
      const row = (await listGrid(f).rows())[idx];
      await clickRow(f, idx);
      const d = await detailOf(page, k);
      const title = (await d.evaluate(() => document.body.innerText)).match(/정기점검실행\s*:\s*(\d+)\s*\/\s*([^\n]*?)\s*(확정|저장|$)/m);
      const vals = { 점검작업: await val(d, 'pminslistId'), 일정상태: await val(d, 'pmschedStatusDesc'), 설비: await val(d, 'equipDesc'), 점검명: await val(d, 'pmiDesc'), 점검일자: await val(d, 'wkorDate') };
      const tabs = await d.evaluate(() => [...document.querySelectorAll<HTMLElement>('a, span, li')].filter((e) => e.offsetWidth > 0 && /^(점검항목|표준작업|첨부문서)\s*\d*$/.test(e.innerText.trim())).map((e) => e.innerText.trim().replace(/\d+$/, '')));
      log.push(`${TAB[k].name} 행(${row['점검일자']} ${row['점검명']}) → 상세 제목 "${title?.[1]} / ${title?.[2]}", ${JSON.stringify(vals)}, 하위 탭 ${[...new Set(tabs)].join(', ')}`);
      expect.soft(vals.점검작업, '점검작업#').not.toBe('');
      expect.soft(title?.[1], '제목 번호 = 점검작업#').toBe(vals.점검작업);
      expect.soft(vals.점검명, '점검명 = 목록').toBe(row['점검명']);
      expect.soft(vals.점검일자, '점검일자 = 목록').toBe(row['점검일자']);
      for (const t of ['점검항목', '표준작업', '첨부문서']) expect.soft(tabs, `하위 탭 ${t}`).toContain(t);
    }
    note(log.join('\n'));
  });

  test('AP591_TC_014 (상세보기 버튼 클릭) 조회된 데이터의 상세정보를 조회한다.', async ({ page }) => {
    const { f, d, row } = await openWork(page);
    const below = { no: await val(d, 'pminslistId'), name: await val(d, 'pmiDesc'), date: await val(d, 'wkorDate') };
    const winP = page.context().waitForEvent('page', { timeout: 15_000 });
    await clickButton(f, '상세보기');
    const win = await winP;
    await settle(win, 3000);
    const df = await expect.poll(() => win.frames().find((x) => /workPmiDetail/.test(x.name()) && x.url() !== 'about:blank') ? 1 : 0, { timeout: 15_000 }).toBe(1).then(() => win.frames().find((x) => /workPmiDetail/.test(x.name()) && x.url() !== 'about:blank')!);
    await settle(win, 1500);
    const pop = { no: await val(df, 'pminslistId'), name: await val(df, 'pmiDesc'), date: await val(df, 'wkorDate') };
    note(`행(${row['점검일자']} ${row['점검명']}) 상세보기 → 새 창 열림. 하단 상세 ${JSON.stringify(below)} / 팝업 ${JSON.stringify(pop)}`);
    expect(pop).toEqual(below);
    await win.close();
  });

  test('AP591_TC_015 목록과 상세의 값이 일치하는지 확인한다.', async ({ page }) => {
    const { d, row } = await openWork(page);
    const pairs: [string, string][] = [
      ['점검일자', 'wkorDate'], ['점검명', 'pmiDesc'], ['설비명', 'equipDesc'], ['부서', 'deptDesc'], ['담당자', 'empDesc'],
      ['점검작업상태', 'pmschedStatusDesc'], ['점검시작일자', 'startDate'], ['점검시작시간', 'startTime'], ['점검종료일자', 'endDate'],
      ['점검종료시간', 'endTime'], ['점검시간[분]', 'workTime'], ['설비위치', 'eqLocDesc'], ['작업형태', 'pmTypeDesc'], ['비고', 'remark'],
    ];
    const diff: string[] = [];
    for (const [col, id] of pairs) {
      const dv = await val(d, id);
      if ((row[col] ?? '') !== dv) diff.push(`${col}: 목록="${row[col]}" 상세="${dv}"`);
    }
    note(diff.length ? `${diff.join('\n')}` : `${pairs.length}개 항목 모두 일치 (${row['점검일자']} ${row['점검명']})`);
    expect(diff).toEqual([]);
  });

  test('AP591_TC_016 (목록) 데이터 표시 형식을 확인한다.', async ({ page }) => {
    test.setTimeout(300_000);
    const log: string[] = [];
    const codeNames = /^(작업계획|작업발행|작업완료|작업중|결재요청중|임원확인중|)$/;
    const check = async (where: string, f: Frame) => {
      const rows = await loadAll(page, f);
      const bad: string[] = [];
      const hiddenNotes: string[] = [];
      for (const col of ['점검일자', '점검시작일자', '점검종료일자']) {
        const wrong = rows.filter((r) => r[col] && !isDate(r[col]));
        if (wrong.length) bad.push(`${col} ${wrong.length}건 (예: ${wrong[0][col]})`);
      }
      for (const col of ['점검시작시간', '점검종료시간', '점검시간']) {
        const wrong = rows.filter((r) => r[col] && !/^\d{2}:\d{2}$/.test(r[col]));
        if (wrong.length) bad.push(`${col} ${wrong.length}건 (예: ${wrong[0][col]})`);
      }
      const st = rows.filter((r) => !codeNames.test(r['점검작업상태'] ?? ''));
      if (st.length) bad.push(`점검작업상태 코드로 표시 ${st.length}건 (예: ${st[0]['점검작업상태']})`);
      const pt = rows.filter((r) => r['작업형태'] && /^[A-Z]+$/.test(r['작업형태']));
      if (pt.length) bad.push(`작업형태 코드로 표시 ${pt.length}건`);
      const wt = rows.filter((r) => r['점검시간[분]'] && !/^\d{1,3}(,\d{3})*$/.test(r['점검시간[분]']));
      if (wt.length) bad.push(`점검시간[분] 숫자 형식 ${wt.length}건 (예: ${wt[0]['점검시간[분]']})`);
      const shown = await listGrid(f).headers();
      for (const col of ['수정시간', '생성시간']) {
        const wrong = rows.filter((r) => r[col] && !/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(r[col]));
        // 기본 Setting 에서 숨긴 칼럼은 화면에 안 보이므로 참고로만 남김
        if (wrong.length) (shown.includes(col) ? bad : hiddenNotes).push(`${col} ${wrong.length}건 (예: ${wrong[0][col]})`);
      }
      const align = await listGrid(f).align('점검시간[분]');
      const dateAlign = await listGrid(f).align('점검일자');
      log.push(`${where} ${rows.length}행: ${bad.join(', ') || '이상 없음'} / 정렬 점검시간[분] ${align[0] ?? '-'}, 점검일자 ${dateAlign[0] ?? '-'}${hiddenNotes.length ? ` (참고: 숨김 칼럼 ${hiddenNotes.join(', ')})` : ''}`);
      expect.soft(bad, `${where} 표시 형식`).toEqual([]);
    };
    const f = await searchCal(page, {});
    await clickCalendar(page, f, (await calendarCells(f)).findIndex((c) => c.c > 0) >= 0 ? (await calendarCells(f)).findIndex((c) => c.c > 0) : 0, 'T');
    await check('카렌다(월간)', f);
    await check('목록(조건)', await searchCond(page, { pmNo: '', from: dateAfter(-7), to: dateAfter(0) }));
    note(log.join('\n'));
  });

  test('AP591_TC_017 (상세) 데이터 표시 형식을 확인한다.', async ({ page }) => {
    const { d } = await openWork(page, '작업완료');
    const log: string[] = [];
    for (const id of ['wkorDate', 'startDate', 'endDate']) {
      const v = await val(d, id);
      log.push(`${id} "${v}"`);
      if (v) expect.soft(isDate(v), `${id} yyyy-mm-dd`).toBe(true);
    }
    for (const id of ['startTime', 'endTime']) {
      const v = await val(d, id);
      log.push(`${id} "${v}"`);
      if (v) expect.soft(v, `${id} hh:mm`).toMatch(/^\d{2}:\d{2}$/);
    }
    const wt = d.locator(`[id="${P}.workTime"]`);
    const align = await wt.evaluate((e) => getComputedStyle(e).textAlign);
    log.push(`점검시간[분] "${await wt.inputValue()}" 정렬 ${align}`);
    expect.soft(align, '숫자 오른쪽 정렬').toBe('right');
    note(log.join(', '));
  });

  test('AP591_TC_018 읽기전용 필드를 확인한다.', async ({ page }) => {
    const { d } = await openWork(page);
    const ids = ['pminslistId', 'pmschedStatusDesc', 'woTypeDesc', 'pmTypeDesc', 'equipDesc', 'eqLocDesc', 'workTime'];
    const bad: string[] = [];
    for (const id of ids) {
      const ro = await d.locator(`[id="${P}.${id}"]`).evaluate((e) => (e as HTMLInputElement).readOnly || (e as HTMLInputElement).disabled);
      if (!ro) bad.push(id);
    }
    const editable = await d.evaluate((p) => [...document.querySelectorAll<HTMLInputElement>(`input[id^="${p}."], textarea[id^="${p}."]`)].filter((e) => e.offsetWidth > 0 && !(e.readOnly || e.disabled)).map((e) => e.id.split('.')[1]), P);
    note(`읽기전용이어야 할 ${ids.length}칸 중 수정 가능 ${bad.join(', ') || '없음'} / 수정 가능한 칸: ${editable.join(', ')}`);
    expect(bad).toEqual([]);
  });

  test('AP591_TC_019 상세페이지를 닫는다.', async ({ page }) => {
    const { d } = await openWork(page);
    const title = d.getByText(/정기점검실행\s*:/).first();
    await expect(title).toBeVisible();
    await d.locator('a.b_close:visible').first().click({ timeout: 5_000 });
    await settle(page, 1000);
    const open = await title.isVisible().catch(() => false);
    note(`하단 상세의 닫기(ⓧ) 클릭 → 상세 ${open ? '그대로 보임' : '닫힘'}`);
    expect(open).toBe(false);
  });

  test('AP591_TC_020 (팝업창) 상세페이지를 닫는다.', async ({ page }) => {
    const { f } = await openWork(page);
    const winP = page.context().waitForEvent('page', { timeout: 15_000 });
    await clickButton(f, '상세보기');
    const win = await winP;
    await settle(win, 3000);
    const closeBtns = await win.evaluate(() => [...document.querySelectorAll<HTMLElement>('a, div, span')].filter((e) => e.offsetWidth > 0 && (/close/i.test(e.className) || /^(닫기|창닫기|Close)$/.test(e.innerText?.trim() || ''))).map((e) => `${e.tagName}.${e.className}`)).catch(() => []);
    let how = '';
    const btn = win.locator('a:visible, div:visible, span:visible').filter({ hasText: /^\s*(닫기|창닫기|Close)\s*$/ }).first();
    const closedP = win.waitForEvent('close', { timeout: 8_000 }).then(() => true).catch(() => false);
    if (await btn.isVisible().catch(() => false)) { how = '닫기 버튼'; await btn.click(); } else {
      // 창 안 닫기 버튼이 없으면 브라우저 창 닫기(X)
      how = '창 닫기(X)';
      await win.close();
    }
    const closed = await closedP;
    note(`상세보기 팝업 창: 닫기 버튼 후보 [${closeBtns.join(', ') || '없음'}] → ${how} → ${closed || win.isClosed() ? '닫힘' : '안 닫힘'}`);
    expect(closed || win.isClosed()).toBe(true);
  });

  test('AP591_TC_023 목록에 조회된 데이터를 Excel 다운로드한다.', async ({ page }) => {
    test.setTimeout(300_000);
    const log: string[] = [];
    const xlsx = await import('fs');
    for (const k of ['cal', 'cond'] as TabKey[]) {
      let f: Frame;
      if (k === 'cond') f = await searchCond(page, { pmNo: PM });
      else { f = await searchCal(page, { pmNo: PM }); await clickCalendar(page, f, (await calendarCells(f)).findIndex((c) => c.t > 0), 'T'); }
      const t = await listGrid(f).total();
      const winP = page.context().waitForEvent('page', { timeout: 15_000 }).catch(() => null);
      const dlP = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);
      // 카렌다(월간)은 검색 영역에 Setting, 목록 영역에 Excel 이 있음
      await clickButton(f, 'Excel');
      const win = await winP;
      const file = win ? await win.waitForEvent('download', { timeout: 60_000 }).catch(() => null) : await dlP;
      if (!file) { log.push(`${TAB[k].name}: 파일 안 받아짐`); expect.soft(file, `${TAB[k].name} Excel`).toBeTruthy(); continue; }
      const saved = test.info().outputPath(`${k}-${file.suggestedFilename()}`);
      await file.saveAs(saved);
      log.push(`${TAB[k].name}: "${file.suggestedFilename()}" ${xlsx.statSync(saved).size.toLocaleString()} bytes (목록 Total ${t?.all})`);
      expect.soft(xlsx.statSync(saved).size).toBeGreaterThan(0);
      fs.mkdirSync('playwright/.data/ap591-excel', { recursive: true });
      fs.copyFileSync(saved, `playwright/.data/ap591-excel/${k}-${file.suggestedFilename()}`);
      await win?.close();
    }
    note(log.join('\n'));
  });

  // ---- 점검항목 탭 ----
  test('AP591_TC_030 점검항목 목록 데이터 개수를 확인한다.', async ({ page }) => {
    const { d, row } = await openWork(page);
    const pl = await pointList(page);
    const g = new Grid(pl, '점검항목');
    const rows = await g.rows();
    const t = await g.total();
    const tabNum = await d.evaluate(() => (document.body.innerText.match(/점검항목\s*(\d+)/) || [])[1] || '');
    const order = rows.map((r) => r['점검순서']).filter(Boolean).map(Number);
    note(`점검작업(${row['점검일자']} ${row['점검명']}): 점검항목 ${rows.length}행, Total ${t?.loaded}/${t?.all}, 탭 제목 숫자 ${tabNum}, 점검순서 ${order.join(',')} (${rows.map((r) => r['점검항목']).join(' / ')})`);
    expect.soft(rows.length).toBeGreaterThan(0);
    expect.soft(t?.all).toBe(rows.length);
    expect.soft(Number(tabNum)).toBe(rows.length);
    expect.soft(order.every((v, i) => i === 0 || order[i - 1] <= v), '점검순서대로').toBe(true);
  });

  test('AP591_TC_031 점검항목 목록을 정렬한다.', async ({ page }) => {
    test.setTimeout(180_000);
    await openWork(page);
    const pl = await pointList(page);
    const log: string[] = [];
    for (const col of ['점검순서', '점검항목']) {
      const header = pl.locator('div.gridbox:visible .hdrcell', { hasText: new RegExp(`^\\s*${col}\\s*$`) }).first();
      await header.click(); await settle(page, 1200);
      const a = (await new Grid(pl, '점검항목').rows()).map((r) => r[col]);
      await header.click(); await settle(page, 1200);
      const b = (await new Grid(pl, '점검항목').rows()).map((r) => r[col]);
      const cmp = (x: string, y: string) => (/^\d+$/.test(x) && /^\d+$/.test(y) ? Number(x) - Number(y) : x.localeCompare(y, 'ko'));
      const na = a.filter(Boolean), nb = b.filter(Boolean); // 빈 값(점검순서 없음)은 비교에서 뺌
      const asc = na.every((v, i) => i === 0 || cmp(na[i - 1], v) <= 0), desc = nb.every((v, i) => i === 0 || cmp(nb[i - 1], v) >= 0);
      log.push(`${col} 1회: ${a.join(', ')} / 2회: ${b.join(', ')}`);
      expect.soft(asc && desc, `${col} 정렬`).toBe(true);
      if (a.length < 2) log.push(`(점검항목이 ${a.length}건이라 순서 변화는 확인 못 함)`);
    }
    note(log.join('\n'));
  });

  test('AP591_TC_032 (행 클릭) 점검항목 상세를 조회한다.', async ({ page }) => {
    await openWork(page);
    const pl = await pointList(page);
    const first = (await new Grid(pl, '점검항목').rows())[0];
    await new Grid(pl, '점검항목').clickCell('점검항목', first['점검항목']);
    const pd = await frameReady(page, F_POINT_VALUE);
    const text = await pd.evaluate(() => document.body.innerText);
    const vals = { 점검항목: await val(pd, 'checkPoint', PV), 점검부위: await val(pd, 'eqAsmbDesc', PV), 점검방법: await val(pd, 'checkMethod', PV), 적정기준: await val(pd, 'fitBasis', PV), 점검결과: await val(pd, 'pmPointRsltStatusDesc', PV), 점검값: await val(pd, 'resultValue', PV) };
    note(`점검항목 "${first['점검항목']}" 클릭 → 상세 제목 "${(text.match(/점검항목\s*:\s*[^\n]*/) || [''])[0].trim()}", ${JSON.stringify(vals)}`);
    expect.soft(vals.점검항목).toBe(first['점검항목']);
    expect.soft(vals.점검부위).toBe(first['점검부위']);
    expect.soft(vals.점검방법).toBe(first['점검방법']);
    expect.soft(vals.점검결과).toBe(first['점검결과']);
  });

  test('AP591_TC_033 (상세보기 버튼 클릭) 점검항목 상세를 조회한다.', async ({ page }) => {
    await openWork(page);
    const pl = await pointList(page);
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

  test('AP591_TC_034 점검항목 목록·상세의 표시 형식을 확인한다.', async ({ page }) => {
    await openWork(page, '작업완료');
    const pl = await pointList(page);
    const g = new Grid(pl, '점검항목');
    const rows = await g.rows();
    const log: string[] = [];
    const bad: string[] = [];
    for (const col of ['하한값', '기준값', '상한값', '점검값']) {
      const al = (await g.align(col))[0] ?? '';
      const wrong = rows.filter((r) => r[col] && !/^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(r[col]));
      log.push(`${col} 정렬 ${al || '-'}${wrong.length ? `, 숫자 형식 아님 ${wrong.map((r) => r[col]).join(',')}` : ''}`);
      if (al && al !== 'right') bad.push(`${col} 정렬 ${al}`);
      if (wrong.length) bad.push(`${col} 형식`);
    }
    const codes = rows.filter((r) => /^[A-Z]{2,}$/.test(r['수치/판정'] || '') || /^[A-Z]{2,}$/.test(r['점검결과'] || ''));
    if (codes.length) bad.push(`코드값 그대로 표시 ${codes.length}건`);
    log.push(`수치/판정·점검결과: ${rows.map((r) => `${r['수치/판정']}/${r['점검결과']}`).join(', ')}`);
    note(log.join('\n'));
    expect(bad).toEqual([]);
  });

  test('AP591_TC_035 점검항목 상세를 닫는다.', async ({ page }) => {
    test.setTimeout(180_000);
    await openWork(page);
    const pl = await pointList(page);
    const first = (await new Grid(pl, '점검항목').rows())[0];
    await new Grid(pl, '점검항목').clickCell('점검항목', first['점검항목']);
    const pd = await frameReady(page, F_POINT_VALUE);
    const title = pd.getByText(/점검항목\s*:/).first();
    await expect(title).toBeVisible();
    await pd.locator('a.b_close:visible').first().click({ timeout: 5_000 });
    await settle(page, 1000);
    const open = await title.isVisible().catch(() => false);
    // 상세보기 팝업 창 닫기
    await new Grid(pl, '점검항목').clickCell('점검항목', first['점검항목']);
    await settle(page, 1500);
    const winP = page.context().waitForEvent('page', { timeout: 15_000 }).catch(() => null);
    await clickButton(pl, '상세보기');
    const win = await winP;
    let popClosed = false;
    if (win) { await settle(win, 2000); await win.close(); popClosed = win.isClosed(); }
    note(`점검값 상세 닫기(ⓧ) → ${open ? '그대로 보임' : '닫힘'} / 상세보기 팝업 ${win ? (popClosed ? '창 닫기로 닫힘' : '안 닫힘') : '안 열림'}`);
    expect.soft(open).toBe(false);
    expect.soft(popClosed).toBe(true);
  });

  test('AP591_TC_038 점검항목 목록을 Excel로 다운로드한다.', async ({ page }) => {
    await openWork(page);
    const pl = await pointList(page);
    const n = (await new Grid(pl, '점검항목').rows()).length;
    const winP = page.context().waitForEvent('page', { timeout: 15_000 }).catch(() => null);
    const dlP = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);
    await clickButton(pl, 'Excel');
    const win = await winP;
    const file = win ? await win.waitForEvent('download', { timeout: 60_000 }).catch(() => null) : await dlP;
    expect(file, 'Excel 파일').toBeTruthy();
    const saved = test.info().outputPath(file!.suggestedFilename());
    await file!.saveAs(saved);
    note(`점검항목 ${n}행 → "${file!.suggestedFilename()}" ${fs.statSync(saved).size.toLocaleString()} bytes`);
    expect(fs.statSync(saved).size).toBeGreaterThan(0);
    await win?.close();
  });

  test('AP591_TC_042 표준작업 목록을 조회하고 Excel로 다운로드한다.', async ({ page }) => {
    const { d } = await openWork(page);
    const tabNum = await d.evaluate(() => (document.body.innerText.match(/표준작업\s*(\d+)/) || [])[1] || '');
    const f = await waitFrame(page, F_STD);
    await settle(page, 1500);
    const g = new Grid(f, '표준작업명');
    const rows = await g.rows();
    const t = await g.total();
    const winP = page.context().waitForEvent('page', { timeout: 15_000 }).catch(() => null);
    const dlP = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);
    await clickButton(f, 'Excel');
    const win = await winP;
    const file = win ? await win.waitForEvent('download', { timeout: 60_000 }).catch(() => null) : await dlP;
    let size = 0;
    if (file) { const saved = test.info().outputPath(file.suggestedFilename()); await file.saveAs(saved); size = fs.statSync(saved).size; }
    note(`표준작업 ${rows.length}행, Total ${t?.loaded}/${t?.all}, 탭 제목 숫자 ${tabNum} / Excel ${file ? `"${file.suggestedFilename()}" ${size.toLocaleString()} bytes` : '안 받아짐'}`);
    expect.soft(t?.all).toBe(rows.length);
    expect.soft(Number(tabNum)).toBe(rows.length);
    expect.soft(size).toBeGreaterThan(0);
    await win?.close();
  });

  test('AP591_EC_007 카렌다 숫자와 목록(조건) 건수를 맞춰 본다.', async ({ page }) => {
    const f = await searchCal(page, {});
    const cells = await calendarCells(f);
    const sum = cells.reduce((a, c) => a + c.t, 0);
    const now = new Date();
    const yyyymm = ym(today());
    const fp = await searchCond(page, { pmNo: '', from: `${yyyymm}-01`, to: `${yyyymm}-${lastDay(now.getFullYear(), now.getMonth() + 1)}` });
    const t = await listGrid(fp).total();
    note(`${yyyymm} 전체: 카렌다(월간) 날짜 T 합 ${sum}건 / 목록(조건) 같은 기간 Total ${t?.all}건`);
    expect(sum).toBe(t?.all);
  });

  test('AP591_EC_008 시작일이 종료일보다 늦은 기간으로 검색한다.', async ({ page }) => {
    const errors: string[] = [];
    const dialogs: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });
    const f = await openTab(page, 'cond');
    await put(f.locator(`[id="${DTO}.filterStartDate"]`), dateAfter(10));
    await put(f.locator(`[id="${DTO}.filterEndDate"]`), dateAfter(0));
    const after = { s: await f.locator(`[id="${DTO}.filterStartDate"]`).inputValue(), e: await f.locator(`[id="${DTO}.filterEndDate"]`).inputValue() };
    await f.locator('a.b_search:visible').first().click();
    await settle(page, 2500);
    const msg = [...dialogs, await popupMessage(page)].filter(Boolean).join(' / ');
    const t = await listGrid(f).total().catch(() => null);
    note(`시작 ${dateAfter(10)} > 끝 ${dateAfter(0)} 입력 → 칸 값 ${after.s} ~ ${after.e}, 검색 → ${msg ? `안내 "${msg}"` : '안내 없음'}, Total ${t?.all ?? '-'}, 스크립트 에러 ${errors.length}건`);
    expect.soft(errors).toEqual([]);
    expect(Boolean(msg) || (t?.all ?? 0) === 0 || after.e === '' || after.s <= after.e, '안내 또는 0건').toBe(true);
  });
});
