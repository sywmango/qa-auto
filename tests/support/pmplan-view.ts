import { test, expect, Page, Frame } from '@playwright/test';
import fs from 'fs';
import { openMenu, waitFrame, clickButton, settle, Grid, openLov, lovTotal } from './dream';
import { dateAfter, BASE_TAG } from './form';
import { TAB, TabKey, openTab, listGrid, search, searchPeriod, loadAll, clickRow, detailOf, isDate, note } from './pmplan';

// 정기점검계획 (AD210) 카렌다·다른 탭 확인 부품
// 공통 화면 테스트(tests/common/screen.spec.ts)는 목록(조건) 탭으로 돌고, 카렌다(연간·월간)·목록(위치·종류) 탭 확인은
// 같은 테스트ID 에 이 파일의 함수로 덧붙입니다 (tests/screens/ad210.ts 의 view.extra).

export const SY = BASE_TAG;   // 팀 공용 기준 주기(8007)의 계획
const today = () => dateAfter(0);
export const ym = (d: string) => d.slice(0, 7);

/** 카렌다 칸의 P/S/C 숫자와 링크 인자. 연간은 월 13칸(마지막 = 계), 월간은 날짜 칸 */
export async function calendarCells(f: Frame) {
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
export async function setReadonly(f: Frame, id: string, value: string) {
  await f.locator(`[id="${id}"]`).evaluate((e, v) => {
    (e as HTMLInputElement).value = v;
    e.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** 카렌다 칸 숫자 클릭 (cls: p/s/c, i: 몇 번째 칸) */
export async function clickCalendar(page: Page, f: Frame, i: number, cls: 'p' | 's' | 'c') {
  await f.locator(`span.${cls}:visible a`).nth(i).click();
  await settle(page, 2500);
}

/** 카렌다 탭을 [sychoi] 로 검색하고 계획이 있는 첫 칸 숫자를 눌러 아래 목록을 띄움 */
async function calendarList(page: Page, k: 'year' | 'month', pmNo?: string, yyyymm?: string) {
  const f = await openTab(page, k);
  if (yyyymm) await setReadonly(f, `${TAB.month.dto}.filterYyyymm`, yyyymm);
  if (pmNo) await f.locator(`[id="${TAB[k].dto}.filterPmNo"]`).fill(pmNo);
  else await f.locator(`[id="${TAB[k].dto}.filterPmDesc"]`).fill(SY);
  await search(page, f);
  const i = (await calendarCells(f)).findIndex((c) => c.p > 0);
  if (i >= 0) await clickCalendar(page, f, i, 'p');
  return { f, i };
}

/** [sychoi] 작업계획 행 (목록(조건), 넓은 기간) */
async function planRow(page: Page) {
  const rows = await loadAll(page, await searchPeriod(page, { pmDesc: SY }));
  const row = rows.find((r) => r['일정상태'] === '작업계획');
  expect(row, '[sychoi] 작업계획 계획이 있어야 함').toBeTruthy();
  return row!;
}

/** TC_001: 카렌다(연간)·(월간) 기본값 (년 = 올해, 년월 = 이번 달, 나머지 칸 비어 있음) */
export async function defaultsCalendar(page: Page) {
  const log: string[] = [];
  for (const k of ['year', 'month'] as TabKey[]) {
    const f = await openTab(page, k);
    const vals = await f.evaluate((dto) => [...document.querySelectorAll<HTMLInputElement>(`input[id^="${dto}."]`)].filter((e) => e.offsetWidth > 0).map((e) => [e.id.split('.')[1], e.value] as [string, string]), TAB[k].dto);
    const map = Object.fromEntries(vals);
    const filled = vals.filter(([id, v]) => v && !['filterYear', 'filterYyyymm'].includes(id));
    log.push(`${TAB[k].name}: 년 ${map.filterYear ?? '-'} 년월 ${map.filterYyyymm ?? '-'}, 그 외 값 있는 칸 ${filled.length}개${filled.length ? ` (${filled.map(([i, v]) => `${i}=${v}`).join(', ')})` : ''}`);
    if (k === 'year') expect.soft(map.filterYear, '년 = 올해').toBe(today().slice(0, 4));
    if (k === 'month') expect.soft(map.filterYyyymm, '년월 = 이번 달').toBe(ym(today()));
    expect.soft(filled.length, `${TAB[k].name} 나머지 칸 비어 있음`).toBe(0);
  }
  note(log.join('\n'));
}

/** TC_002: 카렌다(연간) 설비 Lov 건수 = 설비 메뉴 건수 */
export async function lovOriginYear(page: Page) {
  const p2 = await page.context().newPage();
  await openMenu(p2, ['114', '447']);
  const eqTotal = (await new Grid(await waitFrame(p2, 'tabFrameTAB.assetMstrLoc_assetMstr'), '설비번호').total())?.all;
  await p2.close();
  const n = await lovTotal(await openLov(page, await openTab(page, 'year'), `${TAB.year.dto}.filterEquipDesc`));
  note(`카렌다(연간) 설비 Lov ${n}건 / 설비 메뉴 ${eqTotal}건`);
  expect.soft(n, '카렌다(연간) 설비 Lov 건수 = 설비 메뉴 건수').toBe(eqTotal);
}

/** TC_004: 카렌다(연간)·(월간)에서 예방작업번호로 검색 → 숫자 클릭 목록이 그 번호만 */
export async function searchCalendar(page: Page) {
  const base = await planRow(page);
  const log: string[] = [];
  for (const k of ['year', 'month'] as const) {
    const { f, i } = await calendarList(page, k, base['예방작업번호'], k === 'month' ? ym(base['일정조정']) : undefined);
    if (i < 0) { log.push(`${TAB[k].name}: 카렌다에 계획 없음`); expect.soft(i, `${TAB[k].name} 카렌다 계획 있음`).toBeGreaterThanOrEqual(0); continue; }
    const rows = await loadAll(page, f);
    const bad = rows.filter((r) => r['예방작업번호'] !== base['예방작업번호']);
    log.push(`${TAB[k].name} 예방작업번호="${base['예방작업번호']}": ${rows.length}행, 불일치 ${bad.length}`);
    expect.soft(rows.length, `${TAB[k].name} 결과 있음`).toBeGreaterThan(0);
    expect.soft(bad.length, `${TAB[k].name} 조건과 다른 행 없음`).toBe(0);
  }
  note(log.join('\n'));
}

/** TC_011: 목록(위치) 탭도 예방작업번호 오름차순 → 내림차순 */
export async function sortLoc(page: Page) {
  const f = await openTab(page, 'loc');
  const header = f.locator('div.gridbox:visible .hdrcell', { hasText: /^\s*예방작업번호\s*$/ }).first();
  await header.click(); await settle(page, 1500);
  const a = (await listGrid(f).rows()).map((r) => Number(r['예방작업번호']));
  await header.click(); await settle(page, 1500);
  const b = (await listGrid(f).rows()).map((r) => Number(r['예방작업번호']));
  const asc = a.every((v, i) => i === 0 || a[i - 1] <= v);
  const desc = b.every((v, i) => i === 0 || b[i - 1] >= v);
  note(`목록(위치) 예방작업번호 1회: ${a.slice(0, 5).join(',')} (오름차순 ${asc}) / 2회: ${b.slice(0, 5).join(',')} (내림차순 ${desc})`);
  expect.soft(asc && desc, '목록(위치) 오름차순 → 내림차순').toBe(true);
}

/** TC_013: 상세 작업일자 = 목록 일정조정 (공통 케이스가 연 [sychoi] 첫 작업계획 행) */
export async function rowDetailDate(page: Page) {
  const d = page.frames().find((x) => x.name() === 'tabFrameTAB.workCalPmRInsPeriodDetail_workCalPmRInsPeriodList');
  const date = d ? await d.locator('[id="workCalPmRInsPeriodDetailDTO.schedDate"]').inputValue() : '';
  const rows = await listGrid(await waitFrame(page, TAB.period.frame)).rows();
  const row = rows.find((r) => r['일정상태'] === '작업계획');
  note(`상세 작업일자 ${date} / 목록 일정조정 ${row?.['일정조정']}`);
  expect.soft(date, '상세 작업일자 = 목록 일정조정').toBe(row?.['일정조정']);
}

/** TC_015: 주기 — 목록 "2M" ↔ 상세 주기 2 + 주기구분 월 */
export async function cycleSame(page: Page) {
  const base = await planRow(page);
  const f = await searchPeriod(page, { pmDesc: SY });
  const rows = await listGrid(f).rows();
  const idx = rows.findIndex((r) => r['일정상태'] === '작업계획' && r['예방작업번호'] === base['예방작업번호']);
  await clickRow(f, idx);
  const d = await detailOf(page, 'period', 'plan');
  const cyc = await d.locator('[id="workCalPmRInsPeriodDetailDTO.cycle"]').inputValue();
  const pt = await d.locator('[id="workCalPmRInsPeriodDetailDTO.periodTypeDesc"]').inputValue();
  const unit: Record<string, string> = { D: '일', W: '주', M: '월', Y: '년' };
  const m = (rows[idx]['주기'] || '').match(/^(\d+)([A-Z])$/);
  const ok = !!m && m[1] === cyc && pt.startsWith(unit[m[2]] ?? '?');
  note(`주기: 목록="${rows[idx]['주기']}" 상세="${cyc} ${pt}"`);
  expect.soft(ok, '목록 주기 = 상세 주기 + 주기구분').toBe(true);
}

/** TC_016: 카렌다(연간)·(월간)·목록(위치)·(종류) 목록도 같은 표시 형식 */
export async function formatTabs(page: Page) {
  const statusNames = /^(작업계획|작업발행|작업완료|작업중|결재요청중|임원확인중|)$/;
  const log: string[] = [];
  const checkRows = (where: string, rows: Record<string, string>[]) => {
    const bad: string[] = [];
    for (const col of ['초기계획', '일정조정', '작업일자', '완료일자']) {
      const wrong = rows.filter((r) => r[col] && !isDate(r[col]));
      if (wrong.length) bad.push(`${col} ${wrong.length}건 (예: ${wrong[0][col]})`);
    }
    const st = rows.filter((r) => r['일정상태'] !== undefined && !statusNames.test(r['일정상태']));
    if (st.length) bad.push(`일정상태 코드로 표시 ${st.length}건 (예: ${st[0]['일정상태']})`);
    log.push(`${where} ${rows.length}행: ${bad.join(', ') || '이상 없음'}`);
    expect.soft(bad, `${where} 표시 형식`).toEqual([]);
  };
  for (const k of ['year', 'month'] as const) {
    const { f } = await calendarList(page, k);
    checkRows(TAB[k].name, await listGrid(f).rows());
  }
  for (const k of ['loc', 'ctg'] as TabKey[]) {
    const f = await openTab(page, k);
    await new Grid(f, k === 'loc' ? '위치명' : '종류명').clickCell(k === 'loc' ? '위치명' : '종류명', k === 'loc' ? '안성공장' : '믹서');
    await settle(page, 2500);
    checkRows(TAB[k].name, await listGrid(f).rows());
  }
  note(log.join('\n'));
}

/** TC_026: 카렌다(연간)·(월간) 아래 목록도 Excel 로 받아짐 */
export async function excelCalendar(page: Page) {
  const log: string[] = [];
  for (const k of ['year', 'month'] as const) {
    const { f } = await calendarList(page, k);
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
}
