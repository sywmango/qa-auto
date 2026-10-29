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
// 검색·목록·상세 공통 케이스(TC_001, 003~008, 011, 012, 015, 018, 019, 023)는 tests/common/screen.spec.ts (화면 정의 tests/screens/ap591.ts)

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
