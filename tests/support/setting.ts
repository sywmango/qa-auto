import { Page, Frame } from '@playwright/test';
import { settle, escapeRe, lovContentFrame, pickInLov } from './dream';

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
  const re = typeof text === 'string' ? new RegExp(`^\\s*${escapeRe(text)}\\s*$`) : text;
  return f.locator('a:visible', { hasText: re }).first();
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

/** 화면의 Setting 버튼을 눌러 팝업을 엽니다. 검색 영역이 첫 번째, 목록 영역이 두 번째 Setting 입니다. */
export async function openSetting(page: Page, screen: Frame, where: 'search' | 'list') {
  await screen.locator('a:visible', { hasText: /^\s*Setting\s*$/ }).nth(where === 'search' ? 0 : 1).click();
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
    if (!(await cell.locator('input').count())) await cell.dblclick();
    await page.waitForTimeout(300);
    if (await cell.locator('p.open_spop').count()) {
      await cell.locator('p.open_spop').click();
      await settle(page, 1500);
      await pickInLov(page, await lovContentFrame(page), value);
    } else {
      const input = cell.locator('input').first();
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
