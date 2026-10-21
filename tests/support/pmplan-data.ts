import { Page, Frame } from '@playwright/test';
import fs from 'fs';
import { settle, clickButton } from './dream';
import { popupMessage, dateAfter } from './form';
import { openTab, searchPeriod, loadAll } from './pmplan';

// 정기점검계획 (AD210) 데이터를 바꾸는 케이스용 부품
// 테스트 데이터: [sychoi] 주기 8007 의 설비 100302AG13 (High Speed Mixer(세종파마텍)) 에 일정을 추가해서 씀

export const PM = '8007';
export const EQ = '100302AG13';
export const STATE = 'playwright/.data/ad210-state.json';
export const state: Record<string, string> = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
export const keep = (k: string, v: string) => { state[k] = v; fs.mkdirSync('playwright/.data', { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(state, null, 1)); };

/** 확인창(OK)이 뜨면 누르고, 그 뒤 안내 문구(확인 버튼 상자, 잠깐 뜨는 알림, 브라우저 alert)를 읽어 돌려줌 */
export async function okAndMessage(page: Page) {
  const dialogs: string[] = [];
  const onDialog = async (d: import('@playwright/test').Dialog) => { dialogs.push(d.message()); await d.accept(); };
  page.on('dialog', onDialog);
  await settle(page, 800);
  // 확인창은 메인 화면에 뜨기도 하고(getTopPage), 목록 프레임 안에 뜨기도 함(dhtmlx.confirm) → 모든 프레임에서 찾음
  let ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
  for (const fr of page.frames()) {
    const o = fr.getByText('OK', { exact: true }).filter({ visible: true }).first();
    if (await o.isVisible().catch(() => false)) { ok = o; break; }
  }
  const confirm = await ok.isVisible().catch(() => false);
  let confirmText = '';
  if (confirm) {
    confirmText = await ok.evaluate((b) => {
      // OK 버튼에서 위로 올라가며 글자가 120자 이하인 가장 큰 상자 (화면 전체 글자를 읽지 않도록)
      let x: HTMLElement | null = b as HTMLElement, best = '';
      for (let i = 0; i < 6 && x; i++, x = x.parentElement) {
        const t = (x.innerText || '').replace(/\s+/g, ' ').replace(/OK|Cancel|취소/g, '').trim();
        if (t.length > 120) break;
        if (t) best = t;
      }
      return best;
    });
    await ok.click({ timeout: 10_000 }).catch(() => ok.click({ force: true }));
  }
  let toast = '';
  for (let i = 0; i < 8 && !toast; i++) {
    const msg = await popupMessage(page);
    if (msg) { toast = msg; break; }
    for (const fr of page.frames()) {
      const t = await fr.evaluate(() => [...document.querySelectorAll<HTMLElement>('div, p, span')]
        .filter((e) => e.offsetWidth > 0 && e.children.length === 0 && /(니다|세요|있습니다)\.?$/.test(e.innerText.trim()) && e.innerText.length < 100 && !/생성하세요\.$/.test(e.innerText.trim()))
        .map((e) => e.innerText.trim())[0] ?? '').catch(() => '');
      if (t) { toast = t; break; }
    }
    if (!toast) await page.waitForTimeout(500);
  }
  await settle(page, 1500);
  const second = await popupMessage(page);
  page.off('dialog', onDialog);
  return [confirm ? `확인창 "${confirmText}" OK` : '', ...dialogs.map((d) => `알림 "${d}"`), toast ? `안내 "${toast}"` : '', second ? `안내 "${second}"` : ''].filter(Boolean).join(', ') || '안내 없음';
}

/** 이 설비(EQ)의 8007 계획 (목록(조건), 넓은 기간) */
export async function myPlans(page: Page) {
  for (let i = 0; ; i++) {
    try {
      const f = await searchPeriod(page, { pmNo: PM, from: dateAfter(-60), to: dateAfter(400) });
      const rows = await loadAll(page, f);
      return { f, rows, mine: rows.filter((r) => r['설비번호'] === EQ) };
    } catch (e) {
      // 화면이 다시 그려지는 중이면(Frame was detached) 한 번 더
      if (i >= 2 || !/detached/i.test(String(e))) throw e;
    }
  }
}

/** 계획 행 번호 (목록(조건) 안에서): 일정조정 날짜 + 상태 */
export const rowIndex = (rows: Record<string, string>[], date: string, status?: string) =>
  rows.findIndex((r) => r['설비번호'] === EQ && r['일정조정'] === date && (!status || r['일정상태'] === status));

/** 주말이 아닌 날 (오늘 기준 n일 뒤부터) 중 기존 계획이 없는 날 */
export function freeWeekday(from: number, taken: string[]) {
  for (let n = from; n < from + 60; n++) {
    const d = dateAfter(n);
    const wd = new Date(d + 'T00:00:00').getDay();
    if (wd !== 0 && wd !== 6 && !taken.includes(d)) return d;
  }
  throw new Error('빈 날짜 없음');
}

/**
 * 일정추가하기 팝업으로 계획 추가
 * dates: 계획일자 행들, del: 저장 전에 지울 행 번호, pick: false 면 예방작업번호를 고르지 않음
 * 반환: 저장 후 안내 문구
 */
export async function addPlans(page: Page, dates: string[], opts: { del?: number; pick?: boolean; save?: boolean } = {}) {
  const y = await openTab(page, 'year');
  await clickButton(y, '일정추가하기');
  await settle(page, 3000);
  const pop = page.frames().find((f) => f.name() === 'popupIframe1')!;
  const lov = page.frames().find((f) => f.name() === 'popupIframe2');
  if (opts.pick !== false && lov) {
    await lov.locator('[id="lovWorkPmListEquipDTO.filterPmNo"]').fill(PM);
    await lov.locator('a.b_search:visible').first().click();
    await settle(page, 2500);
    await lov.locator('div.gridbox:visible .objbox td:visible', { hasText: new RegExp(`^\\s*${EQ}\\s*$`) }).first().click();
    await clickButton(lov, '선택');
    await settle(page, 2000);
  } else if (lov) {
    await lov.locator('div.b_pwin_close:visible').first().click().catch(() => {});
    await settle(page, 1000);
  }
  const head = await pop.evaluate(() => Object.fromEntries([...document.querySelectorAll<HTMLInputElement>('input[id^="lovWorkCalAddSinglePmiSchedDTO."]')].map((e) => [e.id.split('.')[1], e.value])));
  for (const d of dates) {
    await clickButton(pop, '생성');
    await settle(page, 800);
    await setLastDate(pop, d);
  }
  if (opts.del !== undefined) {
    // 지울 행만 체크 (체크 칸 = ISDELCHECK)
    await pop.evaluate((i) => { const g = (window as any).myGrid; const ids = String(g.getAllRowIds()).split(','); ids.forEach((id, k) => g.cells(id, 0).setValue(k === i ? 1 : 0)); }, opts.del);
    await clickButton(pop, '삭제');
    await settle(page, 800);
    const ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
    if (await ok.isVisible().catch(() => false)) await ok.click();
    await settle(page, 800);
  }
  const gridDates = await pop.evaluate(() => { const g = (window as any).myGrid; return String(g.getAllRowIds()).split(',').filter(Boolean).map((id) => { const v = String(g.cells(id, 1).getValue()); return /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6)}` : v; }); });
  if (opts.save === false) return { head, gridDates, msg: '', pop };
  await clickButton(pop, '저장');
  const msg = await okAndMessage(page);
  return { head, gridDates, msg, pop };
}

/** 일정추가 팝업 그리드 마지막 행의 계획일자 */
async function setLastDate(pop: Frame, d: string) {
  await pop.evaluate((d) => {
    const g = (window as any).myGrid;
    const ids = String(g.getAllRowIds()).split(',').filter(Boolean);
    const c = g.cells(ids[ids.length - 1], 1);
    // 달력 칸은 글자로는 안 들어가고 Date 로 넣어야 함 (화면에서 고른 것과 같은 값 "yyyymmdd" 가 됨)
    const [y, m, dd] = d.split('-').map(Number);
    c.setValue(new Date(y, m - 1, dd));
    c.cell.wasChanged = true;
  }, d);
}

/** 목록 그리드의 dhtmlx 객체로 행 체크 (예방작업번호 열이 있는 목록) */
export async function checkRows(f: Frame, idx: number[]) {
  await f.evaluate((idx) => {
    const w = window as any;
    const g = Object.keys(w).map((k) => { try { return w[k]; } catch { return null; } })
      .find((o) => o && typeof o.getColIndexById === 'function' && typeof o.getRowsNum === 'function' && [...Array(o.getColumnsNum())].some((_, i) => o.getColLabel(i) === '예방작업번호'));
    const ids = String(g.getAllRowIds()).split(',');
    for (const i of idx) g.cells(ids[i], 0).setValue(1);
  }, idx);
}

/**
 * Edit 모드에서 목록 한 칸을 사람처럼 수정
 * - 날짜 칸(일정조정·작업일자): 칸 클릭 → 달력에서 같은 달의 day 일 클릭
 * - 글자 칸(비고): 칸 클릭 → 입력 → Enter  (비고 칸은 기본 Setting 에서 숨겨져 있어 화면에서 고칠 수 없음)
 */
export async function editCell(page: Page, f: Frame, index: number, col: string, value: string) {
  const ci = await f.evaluate((col) => {
    const box = [...document.querySelectorAll<HTMLElement>('div.gridbox')].find((b) => b.offsetWidth > 0 && [...b.querySelectorAll('.hdrcell')].some((c) => (c as HTMLElement).innerText.trim() === '예방작업번호'))!;
    box.setAttribute('data-qa', 'list');
    const tr = [...box.querySelectorAll('.xhdr table.hdr tr')].find((t) => t.querySelector('.hdrcell'))!;
    return [...tr.querySelectorAll('td')].map((td) => (td as HTMLElement).innerText.trim()).indexOf(col);
  }, col);
  const cell = f.locator('div[data-qa="list"] .objbox table.obj tr:visible').nth(index).locator('td').nth(ci);
  const before = (await cell.innerText()).trim();
  if (!(await cell.isVisible())) return { before, editing: false, after: before, hidden: true };
  await cell.scrollIntoViewIfNeeded();
  await cell.click();
  await page.waitForTimeout(800);
  let editing = false;
  const cal = f.locator('.dhtmlxcalendar_dhx_skyblue:visible').last();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && (await cal.isVisible().catch(() => false))) {
    // 달력: 지금 값과 같은 달의 날짜만 고름 (value 의 일)
    const day = String(Number(value.slice(8)));
    await cal.evaluate((c, day) => {
      // 이번 달 칸(이전·다음 달 칸 제외) 중 글자가 day 인 칸
      const cells = [...c.querySelectorAll<HTMLElement>('.dhtmlxcalendar_dates_cont li, .dhtmlxcalendar_dates_cont td')]
        .filter((e) => e.innerText.trim() === day && /dhtmlxcalendar_cell_month/.test(e.className) && !/_dis/.test(e.className));
      cells[0]?.click();
    }, day);
    editing = true;
  } else {
    const input = cell.locator('input, textarea').first();
    if ((await input.count()) > 0) { editing = true; await input.fill(value); await input.press('Enter'); }
  }
  await page.waitForTimeout(800);
  return { before, editing, after: (await cell.innerText()).trim(), hidden: false };
}
