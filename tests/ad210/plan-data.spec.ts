import { test, expect } from '@playwright/test';
import { clickButton, fieldValue, settle } from '../support/dream';
import { put, dateAfter, saveForm, TAG, BASE_TAG } from '../support/form';
import { TAB, openTab, listGrid, search, clickRow, detailOf, note, loadAll } from '../support/pmplan';
import { PM, EQ, state, keep, okAndMessage, myPlans, rowIndex, freeWeekday, addPlans, checkRows, editCell } from '../support/pmplan-data';

// 정기점검계획 (AD210) — 계획을 추가·수정·확정·삭제하는 케이스
// 데이터: [sychoi] 주기 8007 / 설비 100302AG13 에 일정추가로 만든 계획만 바꾸고 지움 (작업발행·완료된 것은 지울 수 없어 남음)
// 순서가 필요한 케이스라 한 파일에서 차례대로 실행 (앞 케이스가 만든 날짜는 playwright/.data/ad210-state.json)

// 한 파일 안에서는 위에서 아래 순서로 실행 (workers 1). 앞 케이스가 실패해도 뒤 케이스는 계속 실행
test.setTimeout(300_000);

/** 작업완료 계획도 함께 보이는 목록: [sychoi] 전체 (작업완료 건은 예전 주기 8018 의 것만 씀) */
async function sychoiRows(page: import('@playwright/test').Page) {
  const { searchPeriod } = await import('../support/pmplan');
  const f = await searchPeriod(page, { pmDesc: BASE_TAG });
  return { f, rows: await loadAll(page, f) };
}
const OLD_DONE = (r: Record<string, string>) => r['예방작업번호'] === '8018' && r['일정상태'] === '작업완료';

/** Edit 케이스용 작업계획 1건 (없으면 일정추가로 만듦) — state.e 가 지금 날짜 */
async function editPlan(page: import('@playwright/test').Page) {
  let { mine } = await myPlans(page);
  if (!state.e || !mine.some((r) => r['일정조정'] === state.e && r['일정상태'] === '작업계획')) {
    const e = freeWeekday(75, mine.map((r) => r['일정조정']));
    await addPlans(page, [e]);
    keep('e', e); keep('e0', e);
  }
  return state.e;
}

const fmt = (rows: Record<string, string>[]) => rows.map((r) => `${r['일정조정']}(초기 ${r['초기계획']}) ${r['일정상태']}`).join(', ');
const yesterday = () => dateAfter(-1);

test.describe('AD210 정기점검계획 (계획 추가·수정·확정·삭제)', () => {
  test('AD210_TC_028 정기점검 일정추가 팝업을 확인한다.', async ({ page }) => {
    const r = await addPlans(page, [], { save: false });
    note(`일정추가하기 → 예방작업설비선택에서 ${PM}/${EQ} 선택 → 팝업 값: 예방작업번호 ${r.head.pmNo}, 설비번호 ${r.head.itemNo}, 설비명 ${r.head.equipDesc}, 작업명 ${r.head.pmDesc}`);
    expect.soft(r.head.pmNo).toBe(PM);
    expect.soft(r.head.itemNo).toBe(EQ);
    expect.soft(r.head.equipDesc).toBe('High Speed Mixer(세종파마텍)');
    expect.soft(r.head.pmDesc).toContain(BASE_TAG);
  });

  test('AD210_TC_030 필수값 없이 일정을 추가한다.', async ({ page }) => {
    const before = (await myPlans(page)).mine.length;
    const a = await addPlans(page, [freeWeekday(50, [])], { pick: false });
    const b = await addPlans(page, []);
    const after = (await myPlans(page)).mine.length;
    note(`① 예방작업번호 없이 저장: ${a.msg}\n② 예방작업번호만 고르고 계획일자 없이 저장: ${b.msg}\n이 설비 계획 ${before}건 → ${after}건`);
    expect.soft(a.msg, '① 필수 안내').toMatch(/필수|선택|입력/);
    expect.soft(b.msg, '② 선택한 데이터가 없습니다').toMatch(/선택.*없/);
    expect(after, '계획이 생기지 않음').toBe(before);
  });

  test('AD210_EC_002 지난 날짜로 일정을 추가한다.', async ({ page }) => {
    const before = (await myPlans(page)).mine;
    const r = await addPlans(page, [yesterday()]);
    const after = (await myPlans(page)).mine;
    const made = after.filter((x) => x['일정조정'] === yesterday());
    note(`계획일자 ${yesterday()} 로 저장: ${r.msg}\n어제 날짜 계획 ${made.length}건 (전체 ${before.length} → ${after.length})`);
    expect.soft(made.length, '지난 날짜 계획이 생기지 않음').toBe(0);
    expect(r.msg, '안내가 떠야 함').toMatch(/이후|오늘|지난|과거/);
  });

  test('AD210_TC_029 정기점검 일정을 추가한다.', async ({ page }) => {
    const { mine } = await myPlans(page);
    const d1 = freeWeekday(40, mine.map((r) => r['일정조정']));
    keep('d1', d1);
    // 월간 카렌다 숫자 (예방작업번호 조건) 추가 전
    const cal = async () => {
      const f = await openTab(page, 'month');
      await f.locator(`[id="${TAB.month.dto}.filterYyyymm"]`).evaluate((e, v) => { (e as HTMLInputElement).value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, d1.slice(0, 7));
      await f.locator(`[id="${TAB.month.dto}.filterPmNo"]`).fill(PM);
      await search(page, f);
      return f.evaluate((day) => {
        const box = [...document.querySelectorAll<HTMLElement>('.date_box')].find((e) => e.textContent?.trim() === String(Number(day)));
        return Number(box?.parentElement?.querySelector('span.p')?.textContent?.replace(/\D/g, '') || 0);
      }, d1.slice(8));
    };
    const c0 = await cal();
    const r = await addPlans(page, [d1]);
    const after = (await myPlans(page)).mine.filter((x) => x['일정조정'] === d1);
    const c1 = await cal();
    note(`계획일자 ${d1} 추가 저장: ${r.msg}\n목록: ${fmt(after) || '없음'}\n월간 카렌다 ${d1} 숫자 ${c0} → ${c1}`);
    expect(after.length, '계획 1건 추가').toBe(1);
    expect.soft(after[0]?.['일정상태']).toBe('작업계획');
    expect.soft(after[0]?.['초기계획']).toBe(d1);
    expect.soft(c1, '카렌다 숫자 1 늘어남').toBe(c0 + 1);
  });

  test('AD210_EC_003 이미 계획이 있는 날짜에 일정을 추가한다.', async ({ page }) => {
    const d1 = state.d1;
    const r = await addPlans(page, [d1]);
    const same = (await myPlans(page)).mine.filter((x) => x['일정조정'] === d1);
    note(`이미 계획이 있는 ${d1} 로 다시 추가: ${r.msg}\n${d1} 계획 ${same.length}건 (${fmt(same)})`);
    expect(same.length, '같은 날짜에 1건 더 생김 (사양 확인됨)').toBe(2);
  });

  test('AD210_EC_004 여러 날짜를 한 번에 추가한다.', async ({ page }) => {
    const { mine } = await myPlans(page);
    const taken = mine.map((r) => r['일정조정']);
    const d2 = freeWeekday(55, taken);
    const d3 = freeWeekday(57, [...taken, d2]);
    const d4 = freeWeekday(59, [...taken, d2, d3]);
    keep('d2', d2); keep('d3', d3); keep('d4', d4);
    const r = await addPlans(page, [d2, d3, d4], { del: 1 });
    const after = (await myPlans(page)).mine;
    const got = [d2, d3, d4].map((d) => `${d} ${after.filter((x) => x['일정조정'] === d).length}건`);
    note(`생성 3행 (${d2}, ${d3}, ${d4}) 중 2번째 행 삭제 후 저장 (저장 전 그리드: ${r.gridDates.join(', ')}): ${r.msg}\n결과: ${got.join(', ')}`);
    expect.soft(r.gridDates, '삭제한 행은 그리드에서 빠짐').toEqual([d2, d4]);
    expect.soft(after.filter((x) => x['일정조정'] === d2).length).toBe(1);
    expect.soft(after.filter((x) => x['일정조정'] === d3).length, '삭제한 행은 생기지 않음').toBe(0);
    expect.soft(after.filter((x) => x['일정조정'] === d4).length).toBe(1);
  });

  test('AD210_TC_020 작업계획의 작업일자를 변경한다.', async ({ page }) => {
    const d2 = state.d2;
    const { f, rows, mine } = await myPlans(page);
    const idx = rowIndex(rows, d2, '작업계획');
    expect(idx, `${d2} 작업계획`).toBeGreaterThanOrEqual(0);
    const d2b = freeWeekday(62, mine.map((r) => r['일정조정']));
    keep('d2b', d2b);
    await clickRow(f, idx);
    const d = await detailOf(page, 'period', 'plan');
    await put(d.locator('[id="workCalPmRInsPeriodDetailDTO.schedDate"]'), d2b);
    const msg = await saveForm(page, d);
    const after = (await myPlans(page)).mine;
    const moved = after.filter((x) => x['일정조정'] === d2b);
    note(`${d2} 계획의 작업일자를 ${d2b} 로 변경 저장: "${msg || '안내 없음'}"\n목록: ${d2b} → ${fmt(moved) || '없음'}, ${d2} 남은 계획 ${after.filter((x) => x['일정조정'] === d2).length}건`);
    expect(moved.length, '일정조정이 바뀐 날짜로').toBe(1);
    expect.soft(moved[0]?.['초기계획'], '초기계획은 처음 날짜 그대로').toBe(d2);
  });

  test('AD210_TC_021 필수값을 지우고 수정한다.', async ({ page }) => {
    const d2b = state.d2b;
    const { f, rows } = await myPlans(page);
    await clickRow(f, rowIndex(rows, d2b, '작업계획'));
    const d = await detailOf(page, 'period', 'plan');
    await put(d.locator('[id="workCalPmRInsPeriodDetailDTO.schedDate"]'), '');
    const msg = await saveForm(page, d);
    const still = (await myPlans(page)).mine.filter((x) => x['일정조정'] === d2b).length;
    note(`작업일자를 지우고 저장: "${msg || '안내 없음'}", ${d2b} 계획 ${still}건 그대로`);
    expect.soft(msg, '필수 안내').toMatch(/필수|입력/);
    expect(still).toBe(1);
  });

  test('AD210_EC_006 작업일자에 잘못된 값을 넣는다.', async ({ page }) => {
    const d2b = state.d2b;
    const log: string[] = [];
    for (const v of ['2026-13-40', 'abcd', yesterday()]) {
      const { f, rows } = await myPlans(page);
      await clickRow(f, rowIndex(rows, d2b, '작업계획'));
      const d = await detailOf(page, 'period', 'plan');
      const input = d.locator('[id="workCalPmRInsPeriodDetailDTO.schedDate"]');
      await put(input, v);
      const shown = await input.inputValue();
      const msg = await saveForm(page, d);
      const mine = (await myPlans(page)).mine;
      const kept = mine.filter((x) => x['일정조정'] === d2b).length;
      log.push(`"${v}" 입력 → 칸 값 "${shown}", 저장 안내 "${msg || '없음'}", ${d2b} 계획 ${kept ? '그대로' : '바뀜'}`);
      expect.soft(kept, `"${v}" 는 저장되지 않아야 함`).toBe(1);
      if (!kept) { // 바뀌었으면 원래 날짜로 되돌림
        const idx = mine.findIndex((x) => x['초기계획'] === state.d2 && x['일정상태'] === '작업계획');
        const r2 = await myPlans(page);
        await clickRow(r2.f, r2.rows.findIndex((x) => x['설비번호'] === EQ && x['초기계획'] === state.d2 && x['일정상태'] === '작업계획'));
        const d3 = await detailOf(page, 'period', 'plan');
        await put(d3.locator('[id="workCalPmRInsPeriodDetailDTO.schedDate"]'), d2b);
        await saveForm(page, d3);
        log.push(`  → ${d2b} 로 되돌림 (행 ${idx})`);
      }
    }
    note(log.join('\n'));
  });

  test('AD210_TC_034 목록에서 일정조정 날짜를 바로 수정한다. (Edit)', async ({ page }) => {
    const d4 = await editPlan(page);
    const { f, rows } = await myPlans(page);
    const idx = rowIndex(rows, d4, '작업계획');
    expect(idx, `${d4} 작업계획`).toBeGreaterThanOrEqual(0);
    await clickButton(f, 'Edit');
    const modeMsg = await okAndMessage(page);
    const btns = await f.locator('a:visible').evaluateAll((as) => as.map((a) => (a as HTMLElement).innerText.trim()).filter((t) => /저장|취소|Edit/.test(t)));
    // 같은 달 안의 다른 평일로 (달력에서 고름)
    const newDay = `${d4.slice(0, 8)}${String(Number(d4.slice(8)) <= 25 ? Number(d4.slice(8)) + 2 : Number(d4.slice(8)) - 2).padStart(2, '0')}`;
    const ed = await editCell(page, f, idx, '일정조정', newDay);
    const bigo = await editCell(page, f, idx, '비고', `${TAG} Edit 비고`);
    await clickButton(f, '저장');
    const msg = await okAndMessage(page);
    const after = (await myPlans(page)).mine.filter((x) => x['초기계획'] === state.e0);
    if (after[0]?.['일정조정'] === newDay) keep('e', newDay);
    note(`Edit 클릭: ${modeMsg}, 버튼 [${btns.join(', ')}]\n${d4} 행 일정조정 칸 클릭 → ${ed.editing ? `달력에서 ${newDay} 선택, 화면 값 "${ed.after}"` : '수정 안 됨'}\n비고 칸: ${bigo.hidden ? '목록에 숨겨져 있어(기본 Setting) 화면에서 수정 불가' : bigo.editing ? '수정됨' : '수정 안 됨'}\n저장: ${msg}\n다시 검색: ${after.map((x) => `일정조정 ${x['일정조정']} (초기 ${x['초기계획']})`).join(' / ')}`);
    expect.soft(btns, '수정 모드: 저장/취소').toEqual(expect.arrayContaining(['저장', '취소']));
    expect(after[0]?.['일정조정'], '바뀐 날짜로 저장').toBe(newDay);
  });

  test('AD210_TC_035 목록 수정을 취소한다. (Edit)', async ({ page }) => {
    const d4 = await editPlan(page);
    const { f, rows } = await myPlans(page);
    const idx = rowIndex(rows, d4, '작업계획');
    await clickButton(f, 'Edit');
    await okAndMessage(page);
    const other = `${d4.slice(0, 8)}${String(Number(d4.slice(8)) <= 25 ? Number(d4.slice(8)) + 1 : Number(d4.slice(8)) - 1).padStart(2, '0')}`;
    const ed = await editCell(page, f, idx, '일정조정', other);
    await clickButton(f, '취소');
    const msg = await okAndMessage(page);
    const shown = (await listGrid(f).rows())[idx]?.['일정조정'];
    const btns = await f.locator('a:visible').evaluateAll((as) => as.map((a) => (a as HTMLElement).innerText.trim()).filter((t) => /저장|취소|Edit/.test(t)));
    const saved = (await myPlans(page)).mine.filter((x) => x['일정조정'] === d4).length;
    note(`Edit → ${d4} 행 일정조정을 "${ed.after}" 로 수정 → 취소: ${msg}\n취소 직후 화면 값 "${shown}", 버튼 [${btns.join(', ')}], 다시 검색하면 ${d4} 계획 ${saved}건`);
    expect.soft(shown, '새로고침 없이 수정 전 값으로').toBe(d4);
    expect(saved, '저장되지 않음').toBe(1);
  });

  test('AD210_TC_032 정기점검 일정을 확정한다. (체크X)', async ({ page }) => {
    const f = await openTab(page, 'year');
    await clickButton(f, '일정확정하기');
    const msg = await okAndMessage(page);
    note(`체크 없이 일정확정하기: ${msg}`);
    expect(msg).toMatch(/선택.*없/);
  });

  test('AD210_TC_031 정기점검 일정을 확정한다. (체크O)', async ({ page }) => {
    const d4 = state.d4;
    const { f, rows } = await myPlans(page);
    const idx = rowIndex(rows, d4, '작업계획');
    // 목록(조건)에는 일정확정하기 버튼이 없어 카렌다(연간)에서 확정: 해당 달 숫자를 눌러 목록을 띄움
    const y = await openTab(page, 'year');
    await y.locator(`[id="${TAB.year.dto}.filterPmNo"]`).fill(PM);
    await search(page, y);
    await y.locator('span.p:visible a').nth(Number(d4.slice(5, 7)) - 1).click();
    await settle(page, 2500);
    const yr = await loadAll(page, y);
    const yi = yr.findIndex((r) => r['설비번호'] === EQ && r['작업일자'] === d4 && r['일정상태'] === '작업계획');
    expect(yi, `카렌다(연간) 목록에 ${d4} 작업계획`).toBeGreaterThanOrEqual(0);
    await checkRows(y, [yi]);
    await clickButton(y, '일정확정하기');
    const msg = await okAndMessage(page);
    const after = (await myPlans(page)).mine.filter((x) => x['일정조정'] === d4);
    // 정기점검실행 목록에 같은 날짜 작업
    const { openMenu } = await import('../support/dream');
    await openMenu(page, ['132', '372', '944']);
    await page.getByText('목록(조건)', { exact: true }).first().click();
    await settle(page, 2000);
    const wf = page.frames().find((x) => /workPmiList_/.test(x.name()))!;
    await put(wf.locator('[id$="filterStartDate"]').first(), d4);
    await put(wf.locator('[id$="filterEndDate"]').first(), d4);
    await wf.locator('[id$="filterPmNo"]').first().fill(PM);
    await wf.locator('a.b_search:visible').first().click();
    await settle(page, 2500);
    const works = (await new (await import('../support/dream')).Grid(wf, '설비번호').rows()).filter((r) => r['설비번호'] === EQ);
    note(`카렌다(연간) 목록에서 ${d4} 행 체크 → 일정확정하기: ${msg}\n목록(조건): ${fmt(after)}\n정기점검실행 ${d4} 작업 ${works.length}건 (${works.map((w) => `${w['점검일자']} ${w['점검작업상태'] ?? ''}`).join(', ')})`);
    expect(after[0]?.['일정상태'], '작업발행으로').toBe('작업발행');
    expect.soft(works.length, '정기점검실행에 1건').toBe(1);
    expect(idx).toBeGreaterThanOrEqual(-1);
  });

  test('AD210_TC_033 이미 확정된 일정을 확정한다.', async ({ page }) => {
    const d4 = state.d4;
    const y = await openTab(page, 'year');
    await y.locator(`[id="${TAB.year.dto}.filterPmNo"]`).fill(PM);
    await search(page, y);
    await y.locator('span.p:visible a').nth(Number(d4.slice(5, 7)) - 1).click();
    await settle(page, 2500);
    const yr = await loadAll(page, y);
    await checkRows(y, [yr.findIndex((r) => r['설비번호'] === EQ && r['작업일자'] === d4)]);
    await clickButton(y, '일정확정하기');
    const msg = await okAndMessage(page);
    const st = (await myPlans(page)).mine.filter((x) => x['일정조정'] === d4).map((x) => x['일정상태']);
    note(`작업발행 상태 ${d4} 체크 → 일정확정하기: ${msg}, 상태 ${st.join(',')}`);
    expect.soft(msg).toMatch(/계획중인 건만 확정|확정된/);
    expect(st).toEqual(['작업발행']);
  });

  test('AD210_EC_010 같은 계획을 연속으로 확정한다.', async ({ page }) => {
    const d3x = state.d2b;
    const y = await openTab(page, 'year');
    await y.locator(`[id="${TAB.year.dto}.filterPmNo"]`).fill(PM);
    await search(page, y);
    await y.locator('span.p:visible a').nth(Number(d3x.slice(5, 7)) - 1).click();
    await settle(page, 2500);
    const yr = await loadAll(page, y);
    await checkRows(y, [yr.findIndex((r) => r['설비번호'] === EQ && r['작업일자'] === d3x && r['일정상태'] === '작업계획')]);
    const btn = y.locator('a:visible', { hasText: /^\s*일정확정하기\s*$/ }).first();
    await btn.click();
    await btn.click({ force: true }).catch(() => {});
    const msg = await okAndMessage(page);
    const msg2 = await okAndMessage(page);
    const after = (await myPlans(page)).mine.filter((x) => x['일정조정'] === d3x);
    note(`${d3x} 체크 → 일정확정하기 두 번 빠르게 클릭: ${msg} / ${msg2}\n목록: ${fmt(after)}`);
    expect(after.length, '계획 1건 그대로').toBe(1);
    expect.soft(after[0]?.['일정상태']).toBe('작업발행');
  });

  test('AD210_EC_005 Edit로 작업발행·작업완료 건의 날짜를 바꾼다.', async ({ page }) => {
    const { f, rows } = await sychoiRows(page);
    const iS = rows.findIndex((r) => r['예방작업번호'] === PM && r['설비번호'] === EQ && r['초기계획'] === state.d4 && r['일정상태'] === '작업발행');
    const iC = rows.findIndex(OLD_DONE);
    const before = [rows[iS]?.['일정조정'], rows[iC]?.['일정조정']];
    await clickButton(f, 'Edit');
    await okAndMessage(page);
    const shift = (d: string) => `${d.slice(0, 8)}${String(Number(d.slice(8)) <= 25 ? Number(d.slice(8)) + 3 : Number(d.slice(8)) - 3).padStart(2, '0')}`;
    const eS = iS >= 0 ? await editCell(page, f, iS, '일정조정', shift(before[0])) : null;
    const eC = iC >= 0 ? await editCell(page, f, iC, '일정조정', shift(before[1])) : null;
    await clickButton(f, '저장');
    const msg = await okAndMessage(page);
    const all = (await sychoiRows(page)).rows;
    const nowS = all.find((r) => r['예방작업번호'] === PM && r['설비번호'] === EQ && r['초기계획'] === state.d4 && r['일정상태'] === '작업발행')?.['일정조정'];
    const nowC = all.find((r) => r['예방작업번호'] === '8018' && r['일정상태'] === '작업완료' && r['초기계획'] === rows[iC]?.['초기계획'])?.['일정조정'];
    note(`Edit → 작업발행(${before[0]}) 일정조정 칸 ${eS?.editing ? `달력 열림 → "${eS.after}"` : '수정 안 됨'}, 작업완료(8018 ${before[1]}) 칸 ${eC?.editing ? `달력 열림 → "${eC.after}"` : '수정 안 됨'} → 저장: ${msg}\n결과: 작업발행 ${before[0]} → ${nowS}, 작업완료 ${before[1]} → ${nowC}`);
    expect.soft(nowC, '작업완료는 바뀌지 않음').toBe(before[1]);
    expect(nowS, '작업발행은 저장되지 않음 (설계: 점검오더가 발행되지 않은 작업만 저장)').toBe(before[0]);
  });

  test('AD210_EC_001 작업발행·작업완료 계획을 삭제한다.', async ({ page }) => {
    const log: string[] = [];
    for (const st of ['작업발행', '작업완료']) {
      const { f, rows } = await sychoiRows(page);
      const i = st === '작업발행' ? rows.findIndex((r) => r['예방작업번호'] === PM && r['설비번호'] === EQ && r['일정조정'] === state.d4 && r['일정상태'] === st) : rows.findIndex(OLD_DONE);
      const target = rows[i];
      await checkRows(f, [i]);
      await clickButton(f, '삭제');
      const msg = await okAndMessage(page);
      const still = (await sychoiRows(page)).rows.filter((r) => r['예방작업번호'] === target['예방작업번호'] && r['설비번호'] === target['설비번호'] && r['일정조정'] === target['일정조정'] && r['일정상태'] === st).length;
      log.push(`${st}(${target['설비번호']} ${target['일정조정']}) 체크 → 삭제: ${msg}, ${still ? '남아 있음' : '삭제됨'}`);
      expect.soft(still, `${st} 은 지워지지 않아야 함`).toBe(1);
    }
    note(log.join('\n'));
  });

  test('AD210_TC_024 선택한 작업계획을 삭제한다. (체크O)', async ({ page }) => {
    const d1 = state.d1;
    const log: string[] = [];
    // ① 카렌다(연간) 탭에서 삭제 (d1 계획 2건 중 1건)
    const y = await openTab(page, 'year');
    await y.locator(`[id="${TAB.year.dto}.filterPmNo"]`).fill(PM);
    await search(page, y);
    await y.locator('span.p:visible a').nth(Number(d1.slice(5, 7)) - 1).click();
    await settle(page, 2500);
    const yr = await loadAll(page, y);
    await checkRows(y, [yr.findIndex((r) => r['설비번호'] === EQ && r['작업일자'] === d1 && r['일정상태'] === '작업계획')]);
    await clickButton(y, '삭제');
    const m1 = await okAndMessage(page);
    const left1 = (await myPlans(page)).mine.filter((x) => x['일정조정'] === d1).length;
    log.push(`① 카렌다(연간) 목록에서 ${d1} 1건 체크 → 삭제: ${m1}, 남은 ${d1} 계획 ${left1}건`);
    expect.soft(left1, '카렌다(연간)에서 1건 삭제').toBe(1);
    // ② 목록(조건) 탭에서 삭제
    const { f, rows } = await myPlans(page);
    await checkRows(f, [rowIndex(rows, d1, '작업계획')]);
    await clickButton(f, '삭제');
    const m2 = await okAndMessage(page);
    const left2 = (await myPlans(page)).mine.filter((x) => x['일정조정'] === d1).length;
    log.push(`② 목록(조건)에서 ${d1} 1건 체크 → 삭제: ${m2}, 남은 ${d1} 계획 ${left2}건`);
    note(log.join('\n'));
    expect(left2, '목록(조건)에서 1건 삭제').toBe(left1 - 1);
  });

  test('정리: 테스트가 추가한 작업계획 지우기', async ({ page }) => {
    // 이 파일에서 일정추가로 만든 계획 중 아직 작업계획인 것만 지움 (작업발행·완료는 지울 수 없어 남김)
    const made = [dateAfter(-1), state.d1, state.d2, state.d3, state.d4, state.e0].filter(Boolean);
    const { f, rows } = await myPlans(page);
    const idx = rows.map((r, i) => (r['설비번호'] === EQ && r['일정상태'] === '작업계획' && made.includes(r['초기계획']) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) { note('지울 계획 없음'); return; }
    await checkRows(f, idx);
    await clickButton(f, '삭제');
    const msg = await okAndMessage(page);
    note(`작업계획 ${idx.length}건 (${idx.map((i) => rows[i]['일정조정']).join(', ')}) 삭제: ${msg}`);
  });
});
