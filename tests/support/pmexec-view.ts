import { test, expect, Page, Frame } from '@playwright/test';
import fs from 'fs';
import { openMenu, waitFrame, clickButton, settle, Grid, openLov, lovTotal } from './dream';
import { dateAfter, closeLov, BASE_TAG } from './form';
import { DTO, TAB, openTab, listGrid, searchCal, calendarCells, clickCalendar, searchCond, loadAll, note } from './pmexec';
import { PM_NO } from './site';

// 정기점검실행 (AP591) 카렌다(월간) 탭 확인 부품
// 공통 화면 테스트(tests/common/screen.spec.ts)는 목록(조건) 탭으로 돌고, 카렌다(월간) 탭 확인은
// 같은 테스트ID 에 이 파일의 함수로 덧붙입니다 (tests/screens/ap591.ts 의 view.extra).

const today = () => dateAfter(0);

/** 카렌다(월간): 계획 있는 첫 날 T 숫자를 눌러 아래 목록을 띄움 */
async function calendarList(page: Page, pmNo?: string) {
  const f = await searchCal(page, pmNo ? { pmNo } : {});
  await clickCalendar(page, f, (await calendarCells(f)).findIndex((c) => c.t > 0), 'T');
  return f;
}

/** TC_001: 카렌다(월간) 기본값 (년월 = 이번 달, 나머지 칸 비어 있음) */
export async function defaultsCalendar(page: Page) {
  const f = await openTab(page, 'cal');
  const vals = await f.evaluate((dto) => [...document.querySelectorAll<HTMLInputElement>(`input[id^="${dto}."]`)].filter((e) => e.offsetWidth > 0).map((e) => [e.id.split('.')[1], e.value] as [string, string]), DTO);
  const map = Object.fromEntries(vals);
  const filled = vals.filter(([id, v]) => v && id !== 'filterYyyymm');
  note(`카렌다(월간): 년월 ${map.filterYyyymm}, 그 외 값 있는 칸 ${filled.length}개${filled.length ? ` (${filled.map(([i, v]) => `${i}=${v}`).join(', ')})` : ''}`);
  expect.soft(map.filterYyyymm, '년월 = 이번 달').toBe(today().slice(0, 7));
  expect.soft(filled.length, '카렌다(월간) 나머지 칸 비어 있음').toBe(0);
}

/** TC_003: 카렌다(월간) 설비 Lov 건수 = 설비 메뉴 건수 */
export async function lovOriginCalendar(page: Page) {
  const p2 = await page.context().newPage();
  await openMenu(p2, ['114', '447']);
  const eqTotal = (await new Grid(await waitFrame(p2, 'tabFrameTAB.assetMstrLoc_assetMstr'), '설비번호').total())?.all;
  await p2.close();
  const n = await lovTotal(await openLov(page, await openTab(page, 'cal'), `${DTO}.filterEquipDesc`));
  await closeLov(page);
  note(`카렌다(월간) 설비 Lov ${n}건 / 설비 메뉴 ${eqTotal}건`);
  expect.soft(n, '카렌다(월간) 설비 Lov 건수 = 설비 메뉴 건수').toBe(eqTotal);
}

/** TC_004: 점검Group 필드는 쓰지 않으므로 숨김 (예전 이슈) */
export async function groupHidden(page: Page) {
  const log: string[] = [];
  for (const k of ['cal', 'cond'] as const) {
    const f = await openTab(page, k);
    const labels = await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('label')].filter((l) => l.offsetWidth > 0).map((l) => l.innerText.trim()));
    const grp = labels.filter((l) => /점검\s*Group/i.test(l));
    log.push(`${TAB[k].name} 점검Group 필드 ${grp.length ? '보임' : '안 보임'}`);
    expect.soft(grp, `${TAB[k].name} 점검Group 숨김`).toEqual([]);
  }
  note(log.join(', '));
}

/** TC_005: 카렌다(월간)에서 예방작업번호로 검색 → T 숫자 클릭 목록 = T 건수, [sychoi] 주기 점검작업만 */
export async function searchCalendar(page: Page) {
  const rows0 = await listGrid(await searchCond(page, { pmNo: PM_NO })).rows();
  const base = rows0.find((r) => r['점검작업상태'] === '작업발행') ?? rows0[0];
  const ym = (base?.['점검일자'] ?? today()).slice(0, 7);
  const f = await searchCal(page, { ym, pmNo: PM_NO });
  const cells = await calendarCells(f);
  const i = cells.findIndex((c) => c.t > 0);
  expect.soft(i, `카렌다(월간) ${ym} 예방작업번호 ${PM_NO} 결과 있음`).toBeGreaterThanOrEqual(0);
  if (i < 0) return;
  await clickCalendar(page, f, i, 'T');
  const rows = await loadAll(page, f);
  const mine = rows.filter((r) => r['예방작업번호'] === undefined || r['예방작업번호'] === PM_NO || r['점검명']?.includes(BASE_TAG));
  note(`카렌다(월간) 예방작업번호=${PM_NO} ${ym}: ${cells[i].day}일 T ${cells[i].t} 클릭 → ${rows.length}행, ${BASE_TAG} 주기 행 ${mine.length}`);
  expect.soft(rows.length, '카렌다 숫자 클릭 목록 = T').toBe(cells[i].t);
  expect.soft(mine.length, '그 주기 점검작업만').toBe(rows.length);
}

/** TC_011: 목록(조건) 점검명, 카렌다(월간) 점검일자·점검명도 오름차순 → 내림차순 */
export async function sortMore(page: Page) {
  const log: string[] = [];
  const byCode = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  const sorted = (a: string[], dir: 1 | -1) => [byCode, (x: string, y: string) => x.localeCompare(y, 'ko')].some((cmp) => a.every((v, i) => i === 0 || dir * cmp(a[i - 1], v) <= 0));
  const check = async (where: string, f: Frame, col: string) => {
    const header = f.locator('div.gridbox:visible .hdrcell', { hasText: new RegExp(`^\\s*${col}\\s*$`) }).first();
    await header.click(); await settle(page, 1500);
    const a = (await listGrid(f).rows()).map((r) => r[col]);
    await header.click(); await settle(page, 1500);
    const b = (await listGrid(f).rows()).map((r) => r[col]);
    const asc = sorted(a, 1), desc = sorted(b, -1);
    log.push(`${where} ${col} 1회: ${a.slice(0, 3).join(', ')} (오름차순 ${asc}) / 2회: ${b.slice(0, 3).join(', ')} (내림차순 ${desc})`);
    expect.soft(asc && desc, `${where} ${col} 오름차순 → 내림차순`).toBe(true);
  };
  await check('목록(조건)', await searchCond(page, { pmNo: PM_NO }), '점검명');
  for (const col of ['점검일자', '점검명']) await check('카렌다(월간)', await calendarList(page), col);
  note(log.join('\n'));
}

/** TC_023: 카렌다(월간) 아래 목록도 Excel 로 받아짐 */
export async function excelCalendar(page: Page) {
  const f = await calendarList(page, PM_NO);
  const t = await listGrid(f).total();
  const winP = page.context().waitForEvent('page', { timeout: 15_000 }).catch(() => null);
  const dlP = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);
  // 카렌다(월간)은 검색 영역에 Setting, 목록 영역에 Excel 이 있음
  await clickButton(f, 'Excel');
  const win = await winP;
  const file = win ? await win.waitForEvent('download', { timeout: 60_000 }).catch(() => null) : await dlP;
  expect.soft(file, '카렌다(월간) Excel').toBeTruthy();
  if (!file) return;
  const saved = test.info().outputPath(`cal-${file.suggestedFilename()}`);
  await file.saveAs(saved);
  note(`카렌다(월간): "${file.suggestedFilename()}" ${fs.statSync(saved).size.toLocaleString()} bytes (목록 Total ${t?.all})`);
  expect.soft(fs.statSync(saved).size).toBeGreaterThan(0);
  await win?.close();
}
