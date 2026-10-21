import { test } from '@playwright/test';
import fs from 'fs';
import { clickButton, settle, Grid } from '../support/dream';
import { put, dateAfter, saveForm } from '../support/form';
import { TAB, openTab, search, clickRow, detailOf, loadAll, note } from '../support/pmplan';
import { PM, EQ, state, okAndMessage, myPlans, rowIndex, addPlans, checkRows } from '../support/pmplan-data';

// 정기점검계획 (AD210) 보고서용 오류 화면 캡처. 캡처하려고 바꾼 데이터는 캡처 후 되돌림
// 파일: playwright/.data/evidence/ad210-*.png

const EV = 'playwright/.data/evidence';
fs.mkdirSync(EV, { recursive: true });
test.setTimeout(300_000);
const shot = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: `${EV}/ad210-${name}.png` });

test('증적 TC_016 목록(위치) 완료일자 형식', async ({ page }) => {
  const f = await openTab(page, 'loc');
  await new Grid(f, '위치명').clickCell('위치명', '안성공장');
  await settle(page, 2500);
  // 완료일자 열이 보이도록 오른쪽으로 조금
  await f.evaluate(() => { const o = [...document.querySelectorAll<HTMLElement>('div.gridbox .objbox')].find((x) => x.offsetWidth > 0 && x.closest('div.gridbox')!.querySelector('.hdrcell')?.textContent !== '위치명'); if (o) o.scrollLeft = 0; });
  await shot(page, 'TC_016');
});

test('증적 EC_002 어제 날짜 일정추가', async ({ page }) => {
  const y = dateAfter(-1);
  await addPlans(page, [y]);
  const { f, rows } = await myPlans(page);
  await shot(page, 'EC_002');
  const idx = rows.map((r, i) => (r['설비번호'] === EQ && r['일정조정'] === y && r['일정상태'] === '작업계획' ? i : -1)).filter((i) => i >= 0);
  if (idx.length) { await checkRows(f, idx); await clickButton(f, '삭제'); note(`캡처 후 어제 날짜 계획 ${idx.length}건 삭제: ${await okAndMessage(page)}`); }
});

test('증적 EC_006 상세 작업일자 어제로 저장', async ({ page }) => {
  const e = state.e;
  let { f, rows } = await myPlans(page);
  await clickRow(f, rowIndex(rows, e, '작업계획'));
  let d = await detailOf(page, 'period', 'plan');
  await put(d.locator('[id="workCalPmRInsPeriodDetailDTO.schedDate"]'), dateAfter(-1));
  await saveForm(page, d);
  ({ f, rows } = await myPlans(page));
  const i = rows.findIndex((r) => r['설비번호'] === EQ && r['초기계획'] === state.e0 && r['일정상태'] === '작업계획');
  await clickRow(f, i);
  d = await detailOf(page, 'period', 'plan');
  await shot(page, 'EC_006');
  await put(d.locator('[id="workCalPmRInsPeriodDetailDTO.schedDate"]'), e);
  await saveForm(page, d);
  note(`캡처 후 작업일자 ${e} 로 되돌림`);
});

test('증적 TC_024 카렌다(연간) 삭제 반응 없음', async ({ page }) => {
  const e = state.e;
  const y = await openTab(page, 'year');
  // 년 칸은 읽기전용(선택기) → 값과 change 이벤트로 계획 날짜의 해로
  await y.locator(`[id="${TAB.year.dto}.filterYear"]`).evaluate((el, v) => { (el as HTMLInputElement).value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, e.slice(0, 4));
  await y.locator(`[id="${TAB.year.dto}.filterPmNo"]`).fill(PM);
  await search(page, y);
  await y.locator('span.p:visible a').nth(Number(e.slice(5, 7)) - 1).click();
  await settle(page, 2500);
  const yr = await loadAll(page, y);
  await checkRows(y, [yr.findIndex((r) => r['설비번호'] === EQ && r['작업일자'] === e)]);
  await clickButton(y, '삭제');
  await okAndMessage(page);
  await settle(page, 1500);
  await shot(page, 'TC_024');
});

test('증적 EC_008 종료시간이 시작보다 앞', async ({ page }) => {
  const { f, rows } = await myPlans(page);
  await clickRow(f, rowIndex(rows, state.d4, '작업발행'));
  const d = await detailOf(page, 'period', 'pmi');
  await put(d.locator('[id="workPmiDetailDTO.startTime"]'), '10:00');
  await put(d.locator('[id="workPmiDetailDTO.endDate"]'), state.d4);
  await put(d.locator('[id="workPmiDetailDTO.endTime"]'), '09:00');
  await saveForm(page, d);
  const r2 = await myPlans(page);
  await clickRow(r2.f, rowIndex(r2.rows, state.d4, '작업발행'));
  const d2 = await detailOf(page, 'period', 'pmi');
  await shot(page, 'EC_008');
  // 되돌림: 09:00 ~ 09:40
  await put(d2.locator('[id="workPmiDetailDTO.startTime"]'), '09:00');
  await put(d2.locator('[id="workPmiDetailDTO.endDate"]'), state.d4);
  await put(d2.locator('[id="workPmiDetailDTO.endTime"]'), '09:40');
  note(`캡처 후 09:00~09:40 으로 되돌림: "${await saveForm(page, d2) || '안내 없음'}"`);
});
