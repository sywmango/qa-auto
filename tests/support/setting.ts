import { Page, Frame } from '@playwright/test';
import { settle, escapeRe, lovContentFrame, pickInLov, button } from './dream';

// Setting(사용자정의) 팝업 공통 부품. 메뉴가 달라도 같은 화면이라 그대로 씁니다.
// - 검색 영역 Setting: "사용자정의" 팝업 (Field 설정 / Tab 설정)
// - 목록 영역 Setting: "사용자정의Grid" 팝업 (칼럼 목록 + 리스트 길이)
// Setting 은 개인 저장(내 계정에만 적용)입니다. 바꾼 값은 테스트 끝에 원래대로 되돌립니다.

const F_FIELD = 'tabFrameTAB.persPrivUsrFieldList_persPrivUsr';
const F_TAB = 'tabFrameTAB.persPrivUsrTabList_persPrivUsr';
const F_COL = 'tabFrameTAB.maGrdUsrColList_maGrdUsrDetail';
const H_LIST_LEN = 'maGrdUsrDetailDTO.height';

function frameNamed(page: Page, name: string) {
  const f = page.frames().find((x) => x.name() === name);
  if (!f) throw new Error(`프레임 없음: ${name}`);
  return f;
}

function btn(f: Frame, text: string | RegExp) {
  if (typeof text === 'string') return button(f, text);
  return f.locator('a:visible', { hasText: text }).first();
}

/** 화면의 Setting 버튼: 검색·상세 영역은 b_colsetting, 목록 영역은 b_setting. class 가 없는 화면은 예전처럼 순서로 */
async function settingButton(f: Frame, kind: 'field' | 'list', fallbackNth: number) {
  const byClass = f.locator(`a.${kind === 'field' ? 'b_colsetting' : 'b_setting'}:visible`).first();
  if (await byClass.count().catch(() => 0)) return byClass;
  return f.locator('a:visible', { hasText: /^\s*Setting\s*$/ }).nth(fallbackNth);
}

async function okIfShown(page: Page) {
  const ok = page.getByText('OK', { exact: true });
  if (await ok.isVisible().catch(() => false)) { await ok.click(); await settle(page, 1500); }
}

/** 설정 목록에서 키(칼럼 ID, 필드ID, 탭페이지ID)가 정확히 같은 행 */
export const settingRow = (f: Frame, key: string) =>
  f.locator('tr', { has: f.locator('td', { hasText: new RegExp(`^${escapeRe(key)}$`) }) });

/** 행의 보이는 칸 글자들 */
export async function settingRowTexts(f: Frame, key: string) {
  return (await settingRow(f, key).locator('td:visible').allInnerTexts()).map((t) => t.trim());
}

async function checkRow(f: Frame, key: string) {
  await settingRow(f, key).locator('img[src*="item_chk"]').click();
}

/** 화면의 Setting 버튼을 눌러 팝업을 엽니다. 검색·상세 영역은 b_colsetting, 목록 영역은 b_setting 버튼입니다. */
export async function openSetting(page: Page, screen: Frame, where: 'search' | 'list') {
  await (await settingButton(screen, where === 'search' ? 'field' : 'list', where === 'search' ? 0 : 1)).click();
  await settle(page, 2500);
  if (where === 'list') return frameNamed(page, F_COL);
  return frameNamed(page, F_FIELD);
}

/** 검색 Setting 팝업에서 Tab 설정 탭으로 옮깁니다. */
export async function openTabSetting(page: Page) {
  await frameNamed(page, 'popupIframe1').locator('a', { hasText: 'Tab 설정' }).click();
  await settle(page, 2500);
  return frameNamed(page, F_TAB);
}

/** 행을 체크하고 버튼(Hide Column, Show Fields 등)을 누릅니다. 누르면 바로 저장됩니다. */
export async function checkAndClick(page: Page, f: Frame, key: string, button: string) {
  await checkRow(f, key);
  await btn(f, button).click();
  await settle(page, 2000);
  await okIfShown(page);
}

/** 초기화 버튼 (지금 열린 설정 목록을 기본값으로) */
export async function resetSetting(page: Page, f: Frame) {
  await btn(f, '초기화').click();
  await settle(page, 2500);
  await okIfShown(page);
}

/**
 * Edit 모드에서 한 행의 칸 값을 바꾸고 저장합니다.
 * cells: { 칸 순서(체크박스 포함, 보이는 칸 기준이 아닌 td 순서): 값 }
 * 값이 'Y'/'N' 인 화면Display여부 칸은 돋보기(시스템코드) 팝업에서 고릅니다.
 */
export async function editSettingRow(page: Page, f: Frame, key: string, cells: Record<number, string>) {
  await checkRow(f, key);
  await btn(f, 'Edit').click();
  await settle(page, 1500);
  for (const [idx, value] of Object.entries(cells)) {
    const cell = settingRow(f, key).locator('td').nth(+idx);
    await cell.click();
    await page.waitForTimeout(300);
    if (!(await cell.locator('input, textarea').count())) await cell.dblclick();
    await page.waitForTimeout(300);
    if (await cell.locator('select').count()) {
      // 고르기 칸(정렬 Left/Center/Right, 조회순서 ASC/DESC 등)
      await cell.locator('select').first().selectOption({ label: value }).catch(() => cell.locator('select').first().selectOption(value));
      await cell.locator('select').first().press('Enter').catch(() => {});
    } else if (await cell.locator('p.open_spop').count()) {
      await cell.locator('p.open_spop').click();
      await settle(page, 1500);
      await pickInLov(page, await lovContentFrame(page), value);
    } else {
      const input = cell.locator('input, textarea').first();
      await input.fill(value);
      await input.press('Enter');
    }
    await page.waitForTimeout(300);
  }
  await btn(f, '저장').click();
  await settle(page, 2000);
  await okIfShown(page);
}

/** 목록 Setting 팝업의 리스트 길이 읽기/바꾸기 (위쪽 저장 버튼) */
export async function listLength(page: Page) {
  return frameNamed(page, 'popupIframe1').locator(`[id="${H_LIST_LEN}"]`).inputValue();
}
export async function setListLength(page: Page, value: string) {
  const pop = frameNamed(page, 'popupIframe1');
  const h = pop.locator(`[id="${H_LIST_LEN}"]`);
  await h.fill(value);
  await h.press('End');
  await h.blur();
  await btn(pop, '저장').click();
  await settle(page, 2000);
  await okIfShown(page);
}

/** 화면의 목록 그리드 헤더(보이는 것만) */
export const gridHeaders = (f: Frame) =>
  f.evaluate(() => [...document.querySelectorAll<HTMLElement>('.hdrcell')].filter((h) => h.offsetWidth > 0).map((h) => h.innerText.trim()).filter(Boolean));

/** 목록 헤더 칸 너비(px) */
export const headerWidth = (f: Frame, header: string) =>
  f.evaluate((h) => {
    const c = [...document.querySelectorAll<HTMLElement>('.hdrcell')].find((x) => x.innerText.trim() === h);
    return c ? c.parentElement!.offsetWidth : -1;
  }, header);

/** 목록 그리드 본문 높이(px) */
export const gridBodyHeight = (f: Frame) =>
  f.evaluate(() => {
    const b = [...document.querySelectorAll<HTMLElement>('div.gridbox')].find((g) => g.offsetWidth > 0)!;
    return (b.querySelector('.objbox') as HTMLElement).offsetHeight;
  });

/** 검색 영역 라벨(보이는 것만, 화면 순서) */
export const searchLabels = (f: Frame) =>
  f.evaluate(() => [...document.querySelectorAll<HTMLElement>('label')].filter((l) => l.offsetWidth > 0).map((l) => l.innerText.trim()));

// 설정 목록의 칸 순서(td, 체크박스 포함): Field 설정 정렬값 2, 화면표시명 3 / 목록 Setting 정렬값 2, 칼럼명 4, 너비 5 / Tab 설정 Display 3
export const TD = { order: 2, name: 3, colName: 4, width: 5, tabDisplay: 3 };

/** 설정 목록에서 이름(화면표시명·칼럼명)이 정확히 같은 칸이 있는 행의 키(ID 칸)와 칸 글자 */
export async function rowByName(f: Frame, name: string) {
  return f.evaluate((name) => {
    const rows = [...document.querySelectorAll<HTMLTableRowElement>('div.gridbox .objbox tr')].filter((tr) => tr.offsetHeight > 0);
    for (const tr of rows) {
      const cells = [...tr.querySelectorAll<HTMLElement>('td')];
      const tds = cells.map((td) => (td.innerText || '').trim());
      const vis = cells.map((td) => td.offsetWidth > 0);
      const ni = tds.findIndex((t, i) => t === name && vis[i]);
      if (ni < 0) continue;
      // 키: 점(.)이 있거나 영문으로 된 ID 칸
      const key = tds.find((t, i) => vis[i] && /^[A-Za-z][\w.]+$/.test(t) && t !== name) ?? '';
      return { key, tds, vis, nameIdx: ni };
    }
    return null;
  }, name);
}

/** 설정 목록 전체 (각 행의 보이는 칸) */
export const settingRows = (f: Frame) => f.evaluate(() =>
  [...document.querySelectorAll<HTMLTableRowElement>('div.gridbox .objbox tr')].filter((tr) => tr.offsetHeight > 0 && tr.querySelector('td'))
    .map((tr) => [...tr.querySelectorAll<HTMLElement>('td')].filter((td) => td.offsetWidth > 0).map((td) => td.innerText.trim())));

/** 열린 팝업 닫기 (팝업 닫기 X 는 팝업 프레임 안에 있음) */
export async function closePopups(page: Page) {
  for (let i = 0; i < 3; i++) {
    const pops = page.frames().filter((f) => /popupIframe/.test(f.name()) && f.url() !== 'about:blank').reverse();
    let closed = false;
    for (const f of pops) {
      const x = f.locator('div.b_pwin_close:visible').first();
      if (await x.isVisible().catch(() => false)) { await x.click().catch(() => {}); closed = true; await settle(page, 800); break; }
    }
    if (!closed) break;
  }
}

/** 설정 목록에서 key 행을 체크하고 Edit 를 눌렀을 때 칸마다 수정 가능 여부 (dhtmlx 칸 종류 ro = 읽기전용). 저장은 하지 않음 */
export async function editableColumns(page: Page, f: Frame, key: string) {
  await checkRow(f, key);
  await btn(f, 'Edit').click();
  await settle(page, 1500);
  return f.evaluate(() => {
    const w = window as any;
    const g = Object.keys(w).map((k) => { try { return w[k]; } catch { return null; } }).find((o) => o && typeof o.getColType === 'function' && typeof o.getRowsNum === 'function');
    return Object.fromEntries([...Array(g.getColumnsNum())].map((_, i) => [g.getColLabel(i), g.getColType(i) !== 'ro' && g.getColType(i) !== 'cntr']));
  }) as Promise<Record<string, boolean>>;
}

/** 점검항목 목록처럼 Setting 이 하나뿐인 목록: 첫 Setting → 칼럼 설정(사용자정의Grid) 팝업 */
export async function openColSetting(page: Page, f: Frame) {
  await closePopups(page);
  await (await settingButton(f, 'list', 0)).click();
  await settle(page, 2500);
  let found: Frame | undefined;
  for (let i = 0; i < 30 && !found; i++) {
    found = page.frames().find((x) => x.name() === F_COL);
    if (!found) await page.waitForTimeout(500);
  }
  if (!found) throw new Error(`프레임 없음: ${F_COL}`);
  return found;
}

/** 목록 Setting 팝업의 리스트 길이 -/+ 버튼 */
export async function stepListLength(page: Page, sign: '+' | '-') {
  await frameNamed(page, 'popupIframe1').locator('a:visible', { hasText: new RegExp(`^\s*${escapeRe(sign)}\s*$`) }).first().click();
}
