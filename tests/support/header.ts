import { Page, Frame } from '@playwright/test';
import { settle, escapeRe } from './dream';
import { closePopups, settingRows } from './setting';

// 화면 상단 공통 기능 (모든 메뉴에서 같은 자리, 같은 동작)
// - 즐겨찾기(별, a.mbookmark): 누르면 바로 서버 저장 + 왼쪽 메뉴 즐겨찾기에 추가/삭제
// - 업무그룹(a.mWorkgroup): "업무그룹설정 Quick LOV" 팝업에서 지금 화면(탭)을 넣을 업무그룹 선택 → 저장
//   왼쪽 메뉴 업무그룹 > 그룹을 누르면 넣어 둔 화면들이 위쪽 탭으로 열림
// - Tab설정(톱니, a.mSetting): 화면 위쪽 탭(목록(위치) 등)의 정렬값·Display 설정 팝업
// - 편집모드(자물쇠, a.mEdit): 켜면 위쪽 탭·검색 필드·상세 필드를 끌어서 순서 변경.
//   놓고 3초 뒤 자동 저장 (그 사이 편집모드를 끄면 저장 안 됨. 상세 화면은 10초 넘게 걸리기도 함)
// 모두 사용자별 저장. 바꾼 값은 테스트 끝에 원래대로 되돌립니다.

export const ICONS = { bookmark: 'a.mbookmark', workgroup: 'a.mWorkgroup', tabSetting: 'a.mSetting', edit: 'a.mEdit' } as const;

/** 상단 아이콘 4개가 보이는지 */
export async function iconsShown(page: Page) {
  const out: Record<string, boolean> = {};
  for (const [k, sel] of Object.entries(ICONS)) out[k] = await page.locator(sel).first().isVisible().catch(() => false);
  return out;
}

/** 위쪽 탭 이름 (보이는 것, 화면 순서) */
export const topTabs = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll<HTMLElement>('ul.nav.nav-tabs > li')].filter((l) => l.offsetWidth > 0).map((l) => l.innerText.trim()));

// ---------------- 즐겨찾기 ----------------
export const isBookmarked = (page: Page) => page.locator(ICONS.bookmark).first().evaluate((e) => e.classList.contains('bookmarked'));

/** 왼쪽 메뉴 즐겨찾기에 이 메뉴(F+메뉴번호)가 있는지 */
export const inFavorites = (page: Page, menuId: string) => page.evaluate((id) => !!document.querySelector(`#mainMenu [id="F${id}"]`), menuId);

export async function toggleBookmark(page: Page) {
  const res = page.waitForResponse((r) => /toggleMyMenu/.test(r.url()), { timeout: 15_000 });
  await page.locator(ICONS.bookmark).first().click();
  await res;
  await settle(page, 1000);
}

// ---------------- 업무그룹 ----------------
const popup = (page: Page) => page.frames().find((f) => f.name() === 'popupIframe1')!;

export async function openWorkgroup(page: Page) {
  await page.locator(ICONS.workgroup).first().click();
  await settle(page, 2500);
  return popup(page);
}

/** 업무그룹 팝업 목록: 업무그룹#, 이름, 선택 여부 */
export const workgroupRows = (f: Frame) => f.evaluate(() =>
  [...document.querySelectorAll<HTMLTableRowElement>('div.gridbox .objbox tr')].filter((tr) => tr.offsetHeight > 0 && tr.querySelector('td'))
    .map((tr) => {
      const tds = [...tr.querySelectorAll<HTMLElement>('td')].filter((td) => td.offsetWidth > 0).map((td) => td.innerText.trim());
      const img = tr.querySelector<HTMLImageElement>('img[src*="item_chk"]');
      return { no: tds[1], name: tds[2], checked: !!img && /item_chk1/.test(img.src) };
    }));

/** 업무그룹 선택 칸을 눌러 바꾸고 저장 */
export async function toggleWorkgroup(page: Page, f: Frame, no: string) {
  const row = f.locator('div.gridbox .objbox tr', { has: f.locator('td', { hasText: new RegExp(`^\\s*${escapeRe(no)}\\s*$`) }) }).first();
  await row.locator('img[src*="item_chk"]').first().click();
  await page.waitForTimeout(300);
  await f.locator('a:visible', { hasText: /^\s*저장\s*$/ }).first().click();
  await settle(page, 1500);
  const ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
  if (await ok.isVisible().catch(() => false)) { await ok.click(); await settle(page, 1500); }
}

/** 왼쪽 메뉴 업무그룹에서 그룹을 눌러 연 업무그룹 화면의 위쪽 탭 (그룹에 넣은 화면들) */
export async function workgroupTabs(page: Page, no: string) {
  await page.goto('/dream/index.do');
  await page.waitForLoadState('networkidle');
  // 업무그룹 메뉴는 펼침 애니메이션 때문에 마우스 클릭이 다른 메뉴에 맞기도 해서, 그룹 항목에 직접 클릭 이벤트를 보냄
  await page.locator(`[id="W${no}"]`).dispatchEvent('click');
  await settle(page, 2500);
  return topTabs(page);
}

// ---------------- Tab설정 (위쪽 탭) ----------------
export async function openTopTabSetting(page: Page) {
  await page.locator(ICONS.tabSetting).first().click();
  await settle(page, 2500);
  return popup(page);
}

/** Tab설정 행: 정렬값, 화면표시명, Display, 탭페이지ID */
export const topTabSettingRows = async (f: Frame) =>
  (await settingRows(f)).filter((r) => r.length > 4).map((r) => ({ order: r[1], name: r[2], display: r[3], key: r[4] }));

// ---------------- 편집모드 ----------------
export const isEditMode = (page: Page) => page.evaluate(() => !!(window as any)._isUserSetEditable);

/** 편집모드 켜기/끄기. 화면에 뜬 안내 글자를 돌려줌 */
export async function setEditMode(page: Page, on: boolean) {
  if ((await isEditMode(page)) === on) return '';
  await page.locator(ICONS.edit).first().click();
  await page.waitForTimeout(800);
  const msg = await page.evaluate(() => (document.body.innerText.match(/편집 모드가[^\n]*/) || [''])[0]);
  await closePopups(page);
  return msg;
}

/** 마우스로 끌어서 놓기 (조금씩 움직여야 정렬 라이브러리가 따라옴) */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 20, from.y + ((to.y - from.y) * i) / 20);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
}

const center = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + Math.min(10, b.width / 2), y: b.y + b.height / 2 });

/** 편집모드에서 필드(라벨)를 끌어 다른 필드 앞에 놓음. saved: 자동 저장(saveField) 응답이 오면 true (최대 20초) */
export async function dragField(page: Page, f: Frame, name: string, before: string) {
  const label = (n: string) => f.locator('div.field label, div.field_long label', { hasText: new RegExp(`^\\s*${escapeRe(n)}\\s*$`) }).first();
  const a = await label(name).boundingBox(), b = await label(before).boundingBox();
  if (!a || !b) throw new Error(`필드 라벨 없음: ${!a ? name : before}`);
  const saved = page.waitForResponse((r) => /persPrivUsrFieldList\/saveField/.test(r.url()), { timeout: 20_000 }).then(() => true).catch(() => false);
  await drag(page, center(a), { x: b.x + 3, y: b.y + b.height / 2 });
  return { saved };
}

/** 편집모드에서 위쪽 탭을 끌어 다른 탭 앞에 놓음. saved: 자동 저장(persPrivUsrTab/save) 응답이 오면 true (최대 20초) */
export async function dragTopTab(page: Page, name: string, before: string) {
  const tab = (n: string) => page.locator('ul.nav.nav-tabs > li', { hasText: new RegExp(`^\\s*${escapeRe(n)}\\s*$`) }).first();
  const a = await tab(name).boundingBox(), b = await tab(before).boundingBox();
  if (!a || !b) throw new Error(`탭 없음: ${!a ? name : before}`);
  const saved = page.waitForResponse((r) => /persPrivUsrTab\/save/.test(r.url()), { timeout: 20_000 }).then(() => true).catch(() => false);
  await drag(page, { x: a.x + a.width / 2, y: a.y + a.height / 2 }, { x: b.x + 5, y: b.y + b.height / 2 });
  return { saved };
}
