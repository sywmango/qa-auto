import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import { clickButton, settle } from '../support/dream';
import { put, dateAfter } from '../support/form';
import { TAB, openTab, clickRow, detailOf, note } from '../support/pmplan';
import { PM, EQ, state, okAndMessage, myPlans, rowIndex, checkRows } from '../support/pmplan-data';

// 정기점검계획 (AD210) 다시 확인 (사용자 요청 2026-10-21)
// - EC_002: 일정추가 계획일자를 달력에서 직접 골라 어제 날짜를 고를 수 있는지
// - TC_030·032·037: 안내 문구가 실제로 뜨는지 (화면 캡처 + 모든 프레임의 안내 글자)

const EV = 'playwright/.data/evidence';
fs.mkdirSync(EV, { recursive: true });
test.setTimeout(300_000);

/** 버튼을 누른 뒤 6초 동안 0.5초마다 모든 프레임에서 안내처럼 보이는 글자를 모으고, 1초 뒤 화면 캡처 */
async function watchMessages(page: Page, shotName: string) {
  const seen = new Set<string>();
  for (let i = 0; i < 12; i++) {
    for (const fr of page.frames()) {
      const t = await fr.evaluate(() => [...document.querySelectorAll<HTMLElement>('div, p, span, td, li')]
        .filter((e) => e.offsetWidth > 0 && e.offsetHeight > 0 && (e.innerText || '').length < 80 && /(없습니다|필수|입력|선택|하시겠습니까|되었습니다|할 수 없|확인하세요|가능합니다)/.test(e.innerText || '') && ![...e.children].some((c) => (c as HTMLElement).innerText === e.innerText))
        .map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => [] as string[]);
      for (const x of t) if (!/신규일정 생성시/.test(x)) seen.add(x);
    }
    if (i === 2) await page.screenshot({ path: `${EV}/ad210-${shotName}.png` });
    await page.waitForTimeout(500);
  }
  return [...seen];
}

test('다시확인 EC_002 달력에서 어제 날짜 고르기', async ({ page }) => {
  const y = await openTab(page, 'year');
  await clickButton(y, '일정추가하기');
  await settle(page, 3000);
  const pop = page.frames().find((f) => f.name() === 'popupIframe1')!;
  const lov = page.frames().find((f) => f.name() === 'popupIframe2')!;
  await lov.locator('[id="lovWorkPmListEquipDTO.filterPmNo"]').fill(PM);
  await lov.locator('a.b_search:visible').first().click();
  await settle(page, 2500);
  await lov.locator('div.gridbox:visible .objbox td:visible', { hasText: new RegExp(`^\\s*${EQ}\\s*$`) }).first().click();
  await clickButton(lov, '선택');
  await settle(page, 2000);
  await clickButton(pop, '생성');
  await settle(page, 1000);
  // 계획일자 칸 클릭 → 달력
  const cell = pop.locator('div.gridbox:visible .objbox tr:visible').last().locator('td').nth(1);
  await cell.click();
  await settle(page, 1000);
  const cal = pop.locator('.dhtmlxcalendar_dhx_skyblue:visible').last();
  const calShown = await cal.isVisible().catch(() => false);
  const yd = dateAfter(-1);
  const day = String(Number(yd.slice(8)));
  // 어제 칸 상태 (이번 달 칸 중 글자가 day 인 칸의 class)
  const info = calShown ? await cal.evaluate((c, day) => {
    const cells = [...c.querySelectorAll<HTMLElement>('.dhtmlxcalendar_dates_cont li, .dhtmlxcalendar_dates_cont td')].filter((e) => e.innerText.trim() === day && /dhtmlxcalendar_cell_month/.test(e.className));
    const el = cells[0];
    const cls = el?.className || '';
    el?.click();
    return { cls, disabled: /_dis/.test(cls) };
  }, day) : { cls: '', disabled: false };
  await settle(page, 1000);
  const value = await pop.evaluate(() => { const g = (window as any).myGrid; const ids = String(g.getAllRowIds()).split(','); return String(g.cells(ids[ids.length - 1], 1).getValue()); });
  await page.screenshot({ path: `${EV}/ad210-EC_002-calendar.png` });
  let saveMsg = '', made = 0;
  if (value) {
    await clickButton(pop, '저장');
    saveMsg = await okAndMessage(page);
    const { f, rows, mine } = await myPlans(page);
    made = mine.filter((r) => r['일정조정'] === yd && r['일정상태'] === '작업계획').length;
    if (made) {
      await page.screenshot({ path: `${EV}/ad210-EC_002.png` });
      const idx = rows.map((r, i) => (r['설비번호'] === EQ && r['일정조정'] === yd && r['일정상태'] === '작업계획' ? i : -1)).filter((i) => i >= 0);
      await checkRows(f, idx);
      await clickButton(f, '삭제');
      note(`캡처 후 어제 날짜 계획 ${idx.length}건 삭제: ${await okAndMessage(page)}`);
    }
  }
  note(`일정추가 → 계획일자 칸 클릭: 달력 ${calShown ? '열림' : '안 열림'}, 어제(${yd}) 칸 ${info.disabled ? '선택 불가(흐리게)' : '선택 가능'} (class "${info.cls}") → 칸 값 "${value || '없음'}"${value ? `\n저장: ${saveMsg}, 어제 날짜 작업계획 ${made}건 생성` : ''}`);
  expect(made, '어제 날짜 계획이 생기지 않아야 함').toBe(0);
});

test('다시확인 TC_030 계획일자 없이 저장', async ({ page }) => {
  const y = await openTab(page, 'year');
  await clickButton(y, '일정추가하기');
  await settle(page, 3000);
  const pop = page.frames().find((f) => f.name() === 'popupIframe1')!;
  const lov = page.frames().find((f) => f.name() === 'popupIframe2')!;
  await lov.locator('[id="lovWorkPmListEquipDTO.filterPmNo"]').fill(PM);
  await lov.locator('a.b_search:visible').first().click();
  await settle(page, 2500);
  await lov.locator('div.gridbox:visible .objbox td:visible', { hasText: new RegExp(`^\\s*${EQ}\\s*$`) }).first().click();
  await clickButton(lov, '선택');
  await settle(page, 2000);
  await clickButton(pop, '저장');
  const msgs = await watchMessages(page, 'TC_030');
  note(`예방작업번호만 고르고 계획일자 없이 [저장] → 화면 글자: ${msgs.join(' / ') || '안내 없음'}`);
  expect(msgs.join(' ')).toMatch(/선택.*없|입력/);
});

test('다시확인 TC_032 체크 없이 일정확정하기', async ({ page }) => {
  const y = await openTab(page, 'year');
  await y.locator(`[id="${TAB.year.dto}.filterPmNo"]`).fill(PM);
  await y.locator('a.b_search:visible').first().click();
  await settle(page, 2500);
  await y.locator('span.p:visible a').nth(11).click(); // 12월 목록
  await settle(page, 2500);
  await clickButton(y, '일정확정하기');
  const msgs = await watchMessages(page, 'TC_032');
  note(`목록을 띄우고 체크 없이 [일정확정하기] → 화면 글자: ${msgs.join(' / ') || '안내 없음'}`);
  // 확인창이 남아 있으면 취소
  for (const fr of page.frames()) { const c = fr.getByText('Cancel', { exact: true }).filter({ visible: true }).first(); if (await c.isVisible().catch(() => false)) await c.click(); }
  expect(msgs.join(' ')).toMatch(/선택.*없/);
});

test('다시확인 TC_037 점검명 비우고 확정', async ({ page }) => {
  let { f, rows } = await myPlans(page);
  if (!rows.some((r) => r['설비번호'] === EQ && r['일정상태'] === '작업발행')) {
    // 작업발행 건이 없으면 테스트용 계획(state.d4)을 일정확정해서 만듦
    const y = await openTab(page, 'year');
    await y.locator(`[id="${TAB.year.dto}.filterPmNo"]`).fill(PM);
    await y.locator('a.b_search:visible').first().click();
    await settle(page, 2500);
    await y.locator('span.p:visible a').nth(Number(state.d4.slice(5, 7)) - 1).click();
    await settle(page, 2500);
    const { loadAll } = await import('../support/pmplan');
    const yr = await loadAll(page, y);
    await checkRows(y, [yr.findIndex((r) => r['설비번호'] === EQ && r['작업일자'] === state.d4 && r['일정상태'] === '작업계획')]);
    await clickButton(y, '일정확정하기');
    note(`작업발행 건이 없어 ${state.d4} 일정확정: ${await okAndMessage(page)}`);
    ({ f, rows } = await myPlans(page));
  }
  const i = rows.findIndex((r) => r['설비번호'] === EQ && r['일정상태'] === '작업발행');
  note(`대상: ${rows[i]?.['일정조정']} 작업발행 (이 설비 계획 ${rows.filter((r) => r['설비번호'] === EQ).map((r) => `${r['일정조정']} ${r['일정상태']}`).join(', ')})`);
  await clickRow(f, i);
  const target = rows[i]['일정조정'];
  const d = await detailOf(page, 'period', 'pmi');
  await put(d.locator('[id="workPmiDetailDTO.pmiDesc"]'), '');
  await clickButton(d, '확정');
  const msgs = await watchMessages(page, 'TC_037');
  // 확인창이 떴으면 OK 를 눌러 그 뒤 안내까지
  const after = msgs.some((m) => /하시겠습니까/.test(m)) ? await okAndMessage(page) : '';
  const more = after ? await watchMessages(page, 'TC_037-2') : [];
  const st = (await myPlans(page)).mine.filter((r) => r['일정조정'] === target).map((r) => r['일정상태']);
  note(`점검명을 비우고 [확정] → 화면 글자: ${msgs.join(' / ') || '안내 없음'}${after ? `\nOK 후: ${after}${more.length ? ` / ${more.join(' / ')}` : ''}` : ''}\n상태 ${st.join(',')}`);
  expect(st).toEqual(['작업발행']);
  expect([...msgs, after, ...more].join(' ')).toMatch(/필수|입력/);
});
