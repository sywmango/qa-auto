import { test, Page, Frame, expect } from '@playwright/test';
import { openMenu, waitFrame, settle, Grid } from './dream';
import { put, dateAfter } from './form';
import { relogin } from './pmplan';

// 정기점검실행 (AP591) 화면 부품
// 탭 2개: 카렌다(월간) / 목록(조건). 목록 행을 누르면 아래에 점검작업 상세(workPmiDetail)가 열림
// 점검작업 상세 하위 탭(아코디언, 모두 펼쳐져 있음): 점검항목 / 표준작업 / 첨부문서
// 점검항목 행을 누르면 점검값 상세(workPmiPointValueDetail)가 열림

export const MENU = ['132', '372', '944'];
export const DTO = 'workPmiCommonDTO';
export const P = 'workPmiDetailDTO';
export const PV = 'workPmiPointDetailDTO';
export const TAB = {
  cal: { name: '카렌다(월간)', frame: 'tabFrameTAB.workCalPmRInsMonthList_workPmiListView', detail: 'tabFrameTAB.workPmiDetail_workCalPmRInsMonthList' },
  cond: { name: '목록(조건)', frame: 'tabFrameTAB.workPmiList_workPmiListView', detail: 'tabFrameTAB.workPmiDetail_workPmiList' },
} as const;
export type TabKey = keyof typeof TAB;
export const F_POINT = 'tabFrameTAB.workPmiPointList_workPmiDetail';
export const F_POINT_VALUE = 'tabFrameTAB.workPmiPointValueDetail_workPmiPointList';
export const F_STD = 'tabFrameTAB.workPmiStdPointHdrList_workPmiDetail';
export const F_DOC = 'tabFrameTAB.maPtDocLibList_workPmiDetail';

export const note = (t: string) => test.info().annotations.push({ type: '실제결과', description: t });
export const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** 메뉴를 열고 탭으로 이동, 목록 프레임을 돌려줌 */
export async function openTab(page: Page, k: TabKey): Promise<Frame> {
  await openMenu(page, MENU).catch(async (e) => {
    // 같은 계정이 다른 곳에서 로그인하면 세션이 끊겨 로그인 화면이 뜸 → 다시 로그인하고 한 번 더
    if (!(await page.getByRole('textbox', { name: 'Password' }).isVisible().catch(() => false))) throw e;
    await relogin(page);
    await openMenu(page, MENU);
  });
  if (k !== 'cal') {
    await page.getByText(TAB[k].name, { exact: true }).first().click();
    await settle(page, 2000);
  }
  return waitFrame(page, TAB[k].frame);
}

export const listGrid = (f: Frame) => new Grid(f, '점검명');

export async function search(page: Page, f: Frame) {
  await f.locator('a.b_search:visible').first().click();
  await settle(page, 2500);
}

/** 읽기전용(달력 선택) 칸에 값 넣기: 화면의 년월 선택기 대신 값과 change 이벤트 */
export async function setReadonly(f: Frame, id: string, value: string) {
  await f.locator(`[id="${id}"]`).evaluate((e, v) => {
    (e as HTMLInputElement).value = v;
    e.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** 목록(조건)을 기간 from~to, 예방작업번호 등 조건으로 검색 */
export async function searchCond(page: Page, cond: { from?: string; to?: string; pmNo?: string } = {}) {
  const f = await openTab(page, 'cond');
  await put(f.locator(`[id="${DTO}.filterStartDate"]`), cond.from ?? dateAfter(-60));
  await put(f.locator(`[id="${DTO}.filterEndDate"]`), cond.to ?? dateAfter(400));
  if (cond.pmNo !== undefined) await f.locator(`[id="${DTO}.filterPmNo"]`).fill(cond.pmNo);
  await search(page, f);
  return waitFrame(page, TAB.cond.frame);
}

/** 카렌다(월간) 검색 (년월 yyyy-mm, 예방작업번호) */
export async function searchCal(page: Page, cond: { ym?: string; pmNo?: string } = {}) {
  const f = await openTab(page, 'cal');
  if (cond.ym) await setReadonly(f, `${DTO}.filterYyyymm`, cond.ym);
  if (cond.pmNo !== undefined) await f.locator(`[id="${DTO}.filterPmNo"]`).fill(cond.pmNo);
  await search(page, f);
  return f;
}

/** 카렌다 날짜 칸: 날짜, T(span.p)/P(span.s)/C(span.c) 숫자 */
export async function calendarCells(f: Frame) {
  return f.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('div.psc_box')].filter((b) => b.offsetWidth > 0).map((box) => {
      const num = (cls: string) => Number((box.querySelector(`span.${cls}`)?.textContent || '').replace(/[^\d]/g, '') || 0);
      const day = box.parentElement?.querySelector('.date_box')?.textContent?.trim() || '';
      return { t: num('p'), p: num('s'), c: num('c'), day };
    }),
  );
}

/** 카렌다 칸 숫자 클릭 (i: 몇 번째 날짜 칸, kind: T/P/C) */
export async function clickCalendar(page: Page, f: Frame, i: number, kind: 'T' | 'P' | 'C') {
  const cls = { T: 'p', P: 's', C: 'c' }[kind];
  await f.locator('div.psc_box:visible').nth(i).locator(`span.${cls} a`).click();
  await settle(page, 2500);
}

/** 목록을 끝까지 스크롤해서 모든 행을 불러온 뒤 행 목록 */
export async function loadAll(page: Page, f: Frame, header = '점검명') {
  const g = new Grid(f, header);
  for (let i = 0; i < 80; i++) {
    const t = await g.total();
    if (!t || t.loaded >= t.all) break;
    await f.evaluate((h) => {
      const box = [...document.querySelectorAll<HTMLElement>('div.gridbox')].find((b) => b.offsetWidth > 0 && [...b.querySelectorAll('.hdrcell')].some((c) => (c as HTMLElement).innerText.trim() === h));
      const o = box?.querySelector<HTMLElement>('.objbox');
      if (o) o.scrollTop = o.scrollHeight;
    }, header);
    await page.waitForTimeout(500);
  }
  await settle(page, 800);
  return g.rows();
}

/** 그리드(header 열이 있는)의 n번째 보이는 행(0부터)의 col 칸을 클릭 */
export async function clickRow(f: Frame, index: number, col = '점검명', header = '점검명') {
  const ci = await f.evaluate(({ col, header }) => {
    const box = [...document.querySelectorAll<HTMLElement>('div.gridbox')].find((b) => b.offsetWidth > 0 && [...b.querySelectorAll('.hdrcell')].some((c) => (c as HTMLElement).innerText.trim() === header))!;
    box.setAttribute('data-qa', 'list');
    const tr = [...box.querySelectorAll('.xhdr table.hdr tr')].find((t) => t.querySelector('.hdrcell'))!;
    return [...tr.querySelectorAll('td')].map((td) => (td as HTMLElement).innerText.trim()).indexOf(col);
  }, { col, header });
  const cell = f.locator('div[data-qa="list"] .objbox table.obj tr:visible').nth(index).locator('td').nth(ci);
  await cell.scrollIntoViewIfNeeded();
  await cell.click();
}

/** 이름으로 프레임이 열리고 입력칸이 생길 때까지 기다림 */
export async function frameReady(page: Page, name: string, timeout = 20_000) {
  await expect.poll(async () => {
    const fr = page.frames().find((x) => x.name() === name);
    return fr ? fr.url() !== 'about:blank' && (await fr.locator('input[id*="DTO"]').count().catch(() => 0)) > 0 : false;
  }, { message: `프레임 ${name}`, timeout }).toBe(true);
  await settle(page, 1000);
  return page.frames().find((x) => x.name() === name)!;
}

/** 점검작업 상세 (행 클릭 후) */
export const detailOf = (page: Page, k: TabKey) => frameReady(page, TAB[k].detail);

/** 상세 입력칸 값 */
export const val = (d: Frame, id: string, dto = P) => d.locator(`[id="${dto}.${id}"]`).inputValue().then((v) => v.trim()).catch(() => '');

/** 점검항목 목록 프레임 (상세가 열린 뒤) */
export async function pointList(page: Page) {
  const pl = await waitFrame(page, F_POINT);
  await settle(page, 1500);
  return pl;
}
