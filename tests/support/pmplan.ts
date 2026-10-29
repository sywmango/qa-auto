import { test, Page, Frame, expect } from '@playwright/test';
import { openMenu, waitFrame, settle, Grid } from './dream';
import { put, dateAfter, BASE_TAG } from './form';

// 정기점검계획 (AD210) 화면 부품
// 탭 5개: 카렌다(연간) / 카렌다(월간) / 목록(위치) / 목록(종류) / 목록(조건)
// 행 클릭 시 상세: 작업계획 → 일정 상세(PeriodDetail), 작업발행·작업완료 → 점검작업 상세(workPmiDetail)

export const MENU = ['132', '372', '358'];
export const TAB = {
  year: { name: '카렌다(연간)', frame: 'tabFrameTAB.workCalPmRInsYearList_workCalPmRInsListView', dto: 'workCalPmRInsYearCommonDTO', dateCol: '작업일자' },
  month: { name: '카렌다(월간)', frame: 'tabFrameTAB.workCalPmRInsMonthSchedList_workCalPmRInsListView', dto: 'workCalPmRInsMonthSchedDTO', dateCol: '일정조정' },
  loc: { name: '목록(위치)', frame: 'tabFrameTAB.workCalPmRInsEqLocList_workCalPmRInsListView', dto: '', dateCol: '작업일자' },
  ctg: { name: '목록(종류)', frame: 'tabFrameTAB.workCalPmRInsEqCtgList_workCalPmRInsListView', dto: '', dateCol: '작업일자' },
  period: { name: '목록(조건)', frame: 'tabFrameTAB.workCalPmRInsPeriodList_workCalPmRInsListView', dto: 'workCalPmRInsPeriodCommonDTO', dateCol: '일정조정' },
} as const;
export type TabKey = keyof typeof TAB;

/** 목록 탭 이름(목록 프레임 이름 뒤쪽) → 상세 프레임 */
const listId = (k: TabKey) => TAB[k].frame.replace(/^tabFrameTAB\./, '').replace(/_workCalPmRInsListView$/, '');
export const planDetailFrame = (k: TabKey) => `tabFrameTAB.workCalPmRInsPeriodDetail_${listId(k)}`;
export const pmiDetailFrame = (k: TabKey) => `tabFrameTAB.workPmiDetail_${listId(k)}`;

export const note = (t: string) => test.info().annotations.push({ type: '실제결과', description: t });

/** 메뉴를 열고 탭으로 이동, 목록 프레임을 돌려줌 */
export async function openTab(page: Page, k: TabKey): Promise<Frame> {
  await openMenu(page, MENU).catch(async (e) => {
    // 같은 계정이 다른 곳에서 로그인하면 세션이 끊겨 로그인 화면이 뜸 → 다시 로그인하고 한 번 더
    if (!(await page.getByRole('textbox', { name: 'Password' }).isVisible().catch(() => false))) throw e;
    await relogin(page);
    await openMenu(page, MENU);
  });
  if (k !== 'year') {
    await page.getByText(TAB[k].name, { exact: true }).first().click();
    await settle(page, 2000);
  }
  return waitFrame(page, TAB[k].frame);
}

/** 로그인 화면에서 다시 로그인 (auth.setup.ts 와 같은 순서) */
export async function relogin(page: Page) {
  test.info().annotations.push({ type: 'debug', description: `${new Date().toISOString()} 세션 끊김 → 다시 로그인` });
  await page.getByRole('textbox', { name: 'User No' }).fill(process.env.QA_USER_ID!);
  await page.getByRole('textbox', { name: 'Password' }).fill(process.env.QA_USER_PW!);
  await page.getByRole('button', { name: 'Login' }).click();
  if (process.env.QA_COMPANY) await page.locator('iframe[name="popupIframe1"]').contentFrame().getByRole('cell', { name: process.env.QA_COMPANY }).dblclick();
  await expect(page.getByText('개인설정')).toBeVisible();
  if (process.env.QA_AUTH) await page.context().storageState({ path: process.env.QA_AUTH });
}

export const listGrid = (f: Frame) => new Grid(f, '예방작업번호');

export async function search(page: Page, f: Frame) {
  await f.locator('a.b_search:visible').first().click();
  await settle(page, 2000);
}

/** 목록(조건)을 기간 from~to, 작업명 등 조건으로 검색 */
export async function searchPeriod(page: Page, cond: { from?: string; to?: string; pmDesc?: string; pmNo?: string } = {}) {
  const f = await openTab(page, 'period');
  const d = TAB.period.dto;
  await put(f.locator(`[id="${d}.filterStartDate"]`), cond.from ?? dateAfter(-60));
  await put(f.locator(`[id="${d}.filterEndDate"]`), cond.to ?? dateAfter(400));
  if (cond.pmDesc !== undefined) await f.locator(`[id="${d}.filterPmDesc"]`).fill(cond.pmDesc);
  if (cond.pmNo !== undefined) await f.locator(`[id="${d}.filterPmNo"]`).fill(cond.pmNo);
  await search(page, f);
  // 검색하면서 목록 프레임이 새로 그려질 수 있어 이름으로 다시 찾음
  return waitFrame(page, TAB.period.frame);
}

/** 목록을 끝까지 스크롤해서 모든 행을 불러온 뒤 행 목록 */
export async function loadAll(page: Page, f: Frame, header = '예방작업번호') {
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

/** 목록(예방작업번호 열이 있는 그리드)의 n번째 보이는 행(0부터)을 클릭 */
export async function clickRow(f: Frame, index: number, col = '예방작업번호') {
  const ci = await f.evaluate((col) => {
    const box = [...document.querySelectorAll<HTMLElement>('div.gridbox')].find((b) => b.offsetWidth > 0 && [...b.querySelectorAll('.hdrcell')].some((c) => (c as HTMLElement).innerText.trim() === '예방작업번호'))!;
    box.setAttribute('data-qa', 'list');
    const tr = [...box.querySelectorAll('.xhdr table.hdr tr')].find((t) => t.querySelector('.hdrcell'))!;
    return [...tr.querySelectorAll('td')].map((td) => (td as HTMLElement).innerText.trim()).indexOf(col);
  }, col);
  await f.locator('div[data-qa="list"] .objbox table.obj tr:visible').nth(index).locator('td').nth(ci).click();
}

/** 상세 프레임 (행 클릭 후) — 나타날 때까지 */
export async function detailOf(page: Page, k: TabKey, kind: 'plan' | 'pmi') {
  const name = kind === 'plan' ? planDetailFrame(k) : pmiDetailFrame(k);
  await expect.poll(async () => {
    const fr = page.frames().find((x) => x.name() === name);
    return fr ? fr.url() !== 'about:blank' && (await fr.locator('input[id*="DTO"]').count().catch(() => 0)) > 0 : false;
  }, { message: `상세 ${name}`, timeout: 20_000 }).toBe(true);
  await settle(page, 1000);
  return page.frames().find((x) => x.name() === name)!;
}

/** [sychoi] 계획 중 상태가 status 인 행 찾기 (목록(조건), 넓은 기간) */
export async function findPlan(page: Page, status: '작업계획' | '작업발행' | '작업완료') {
  const f = await searchPeriod(page, { pmDesc: BASE_TAG });
  const rows = await loadAll(page, f);
  const idx = rows.findIndex((r) => r['일정상태'] === status);
  return { f, rows, idx, row: rows[idx] };
}

/** 정확한 날짜 형식 */
export const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
