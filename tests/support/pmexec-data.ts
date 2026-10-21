import { Page, Frame, expect } from '@playwright/test';
import fs from 'fs';
import { settle, clickButton, Grid, waitFrame } from './dream';
import { put, dateAfter, saveForm } from './form';
import { TAB as PLAN_TAB, openTab as openPlanTab, search as planSearch, loadAll as planLoadAll } from './pmplan';
import { addPlans, checkRows, okAndMessage, myPlans } from './pmplan-data';
import { PV, F_POINT, F_POINT_VALUE, searchCond, loadAll, clickRow, detailOf, frameReady, note } from './pmexec';

// 정기점검실행 (AP591) 데이터를 바꾸는 케이스용 부품
// 테스트 데이터: [sychoi] 주기 8007 의 설비 100302AG13 점검작업
//  - 앞날짜 작업발행 건: 정기점검계획 테스트(AD210)에서 확정해 둔 2026-12-18 (없으면 다른 앞날짜 작업발행 건)
//  - 오늘·어제 작업발행 건: 없으면 정기점검계획에서 일정추가 → 일정확정으로 만듦

export const PM = '8007';
export const EQ = '100302AG13';
export const STATE = 'playwright/.data/ap591-state.json';
export const state: Record<string, string> = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
export const keep = (k: string, v: string) => { state[k] = v; fs.mkdirSync('playwright/.data', { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(state, null, 1)); };
export { okAndMessage };

/** 8007·이 설비의 점검작업 (목록(조건), 넓은 기간) */
export async function myWorks(page: Page) {
  for (let i = 0; ; i++) {
    try {
      const f = await searchCond(page, { pmNo: PM, from: dateAfter(-60), to: dateAfter(400) });
      const rows = await loadAll(page, f);
      return { f, rows, mine: rows.filter((r) => r['설비번호'] === EQ) };
    } catch (e) {
      if (i >= 2 || !/detached/i.test(String(e))) throw e;
    }
  }
}
export const workIndex = (rows: Record<string, string>[], date: string, status?: string) =>
  rows.findIndex((r) => r['설비번호'] === EQ && r['점검일자'] === date && (!status || r['점검작업상태'] === status));

/** date 점검작업 상세를 엶 */
export async function openWork(page: Page, date: string, status = '작업발행') {
  const { f, rows } = await myWorks(page);
  const i = workIndex(rows, date, status);
  expect(i, `${date} ${status} 점검작업`).toBeGreaterThanOrEqual(0);
  await clickRow(f, i);
  return { d: await detailOf(page, 'cond'), row: rows[i] };
}

/** 앞날짜 작업발행 건 날짜 */
export async function futureDate(page: Page) {
  if (state.future) return state.future;
  const { mine } = await myWorks(page);
  const ad210 = fs.existsSync('playwright/.data/ad210-state.json') ? JSON.parse(fs.readFileSync('playwright/.data/ad210-state.json', 'utf8')) : {};
  const pick = mine.find((r) => r['점검일자'] === ad210.d4 && r['점검작업상태'] === '작업발행') ?? mine.find((r) => r['점검일자'] > dateAfter(7) && r['점검작업상태'] === '작업발행');
  expect(pick, '앞날짜 작업발행 점검작업').toBeTruthy();
  keep('future', pick!['점검일자']);
  return pick!['점검일자'];
}

/** date 작업발행 점검작업이 없으면 정기점검계획에서 일정추가·일정확정해서 만듦 */
export async function ensureWork(page: Page, date: string) {
  let { mine } = await myWorks(page);
  if (mine.some((r) => r['점검일자'] === date && r['점검작업상태'] === '작업발행')) return '있던 작업 사용';
  const log: string[] = [];
  let plans = (await myPlans(page)).mine.filter((x) => x['일정조정'] === date && x['일정상태'] === '작업계획');
  if (!plans.length) {
    const r = await addPlans(page, [date]);
    log.push(`정기점검계획 일정추가 ${date}: ${r.msg}`);
  }
  // 카렌다(연간)에서 그 달 숫자 클릭 → 이 설비·날짜 작업계획 체크 → 일정확정하기
  const y = await openPlanTab(page, 'year');
  await y.locator(`[id="${PLAN_TAB.year.dto}.filterPmNo"]`).fill(PM);
  await planSearch(page, y);
  await y.locator('span.p:visible a').nth(Number(date.slice(5, 7)) - 1).click();
  await settle(page, 2500);
  const yr = await planLoadAll(page, y);
  const idx = yr.findIndex((r) => r['설비번호'] === EQ && r['작업일자'] === date && r['일정상태'] === '작업계획');
  expect(idx, `${date} 작업계획`).toBeGreaterThanOrEqual(0);
  await checkRows(y, [idx]);
  await clickButton(y, '일정확정하기');
  log.push(`일정확정: ${await okAndMessage(page)}`);
  ({ mine } = await myWorks(page));
  expect(mine.some((r) => r['점검일자'] === date && r['점검작업상태'] === '작업발행'), `${date} 점검작업 생김`).toBe(true);
  plans = [];
  return log.join(', ');
}

/** 점검항목마다 점검결과(기본값)·점검값 입력. value(p) 가 null 이면 그 항목은 건너뜀 */
export async function fillPoints(page: Page, value: (p: Record<string, string>) => string | null = (p) => p['기준값'] || '1') {
  const pl = await waitFrame(page, F_POINT);
  await settle(page, 1500);
  const pts = await new Grid(pl, '점검항목').rows();
  const log: string[] = [];
  for (const p of pts) {
    const v = value(p);
    if (v === null) continue;
    await new Grid(pl, '점검항목').clickCell('점검항목', p['점검항목']);
    const pd = await frameReady(page, F_POINT_VALUE);
    if (p['수치/판정'] === '수치값' || p['수치/판정'] === '') await put(pd.locator(`[id="${PV}.resultValue"]`), v);
    const msg = await saveForm(page, pd);
    log.push(`${p['점검항목']}(${p['수치/판정']}): 점검값 ${v} 저장 "${msg || '안내 없음'}"`);
  }
  await settle(page, 1500);
  const after = await new Grid(pl, '점검항목').rows();
  return { log, after, pts };
}

/** 점검항목 첫 행 → 점검값 상세 */
export async function firstPoint(page: Page) {
  const pl = await waitFrame(page, F_POINT);
  await settle(page, 1500);
  const p = (await new Grid(pl, '점검항목').rows())[0];
  await new Grid(pl, '점검항목').clickCell('점검항목', p['점검항목']);
  return { pl, pd: await frameReady(page, F_POINT_VALUE), p };
}

export { note, Frame };
