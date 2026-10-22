import { Page, Frame, expect } from '@playwright/test';
import { openMenu, settle, Grid, clickButton, lovContentFrame, expandTreeUntil, escapeRe } from './dream';
import { topTabs } from './header';
import { closePopups } from './setting';
import { put, saveForm } from './form';

// 개인설정 > 업무그룹설정 화면 부품
// - 목록(메인 화면): 업무그룹#, 업무그룹명 … / 생성·삭제
// - 상세(업무그룹명, 사용여부, 저장) + 아래 "업무화면" 목록(메뉴명, 화면ID, 화면표시명 …) / 생성 → 업무그룹화면 Lov(메뉴 트리)에서 체크 → 선택
// 왼쪽 메뉴 업무그룹 > 그룹을 누르면, 넣어 둔 화면들이 위쪽 탭으로 열림
// 테스트가 만드는 업무그룹은 이름이 PREFIX 로 시작하고, 테스트 끝에 지움 (다른 업무그룹은 건드리지 않음)

export const PREFIX = '[sychoi] 자동테스트';
const MENU = ['292', '1398'];
const F_DETAIL = 'tabFrameTAB.persPrivBizMenuSetDetail_persPrivBizMenuSetList';
const F_PAGES = 'tabFrameTAB.persPrivBizMenuSetPageList_persPrivBizMenuSetDetail';
const D = 'persPrivBizMenuSetDetailDTO';

const frame = (page: Page, name: string) => page.frames().find((f) => f.name() === name);

async function okIfShown(page: Page) {
  for (let i = 0; i < 2; i++) {
    const ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
    if (!(await ok.isVisible().catch(() => false))) break;
    await ok.click().catch(() => {});
    await settle(page, 1500);
  }
}

/** 업무그룹설정 메뉴를 열고 업무그룹 목록 */
export async function openWgSetting(page: Page) {
  await openMenu(page, MENU);
  await settle(page, 1500);
  return page.mainFrame();
}

export const groupList = async (page: Page) => new Grid(await openWgSetting(page), '업무그룹#').rows();

/** 열린 업무그룹화면 Lov 에서 화면들을 체크하고 [선택] */
async function pickPages(page: Page, names: string[]) {
  const lov = await lovContentFrame(page);
  for (const n of names) {
    if (!(await expandTreeUntil(page, lov, n, 4))) throw new Error(`업무그룹화면 Lov 에 없음: ${n}`);
    const row = lov.locator('div.gridbox:visible .objbox tr', { has: lov.locator('.treegrid_cell span', { hasText: new RegExp(`^\\s*${escapeRe(n)}\\s*$`) }) }).first();
    await row.locator('img[src*="item_chk"]').first().click();
    await page.waitForTimeout(300);
  }
  await clickButton(lov, '선택');
  await settle(page, 2000);
  await okIfShown(page);
}

/**
 * 업무그룹 만들기 → 업무그룹#
 * 목록 [생성]을 누르면 업무그룹화면 Lov 가 먼저 뜸 → pages 를 고르고 [선택] (없으면 Lov 를 닫음) → 업무그룹명 입력 → [저장]
 */
export async function createGroup(page: Page, name: string, pages: string[] = []) {
  const main = await openWgSetting(page);
  await clickButton(main, '생성');
  await settle(page, 2500);
  if (pages.length) await pickPages(page, pages);
  else await closePopups(page);
  let d: Frame | undefined;
  await expect.poll(() => !!(d = frame(page, F_DETAIL)), { message: '업무그룹 상세', timeout: 15_000 }).toBe(true);
  // 상세 폼은 키 입력이 있어야 수정으로 인식 → put (fill + End 키 + change + blur), 저장은 saveForm (확인창 OK 포함)
  await put(d!.locator(`[id="${D}.usrBizGrpMenuDesc"]`), name);
  await saveForm(page, d!);
  await okIfShown(page);
  const row = (await groupList(page)).find((r) => r['업무그룹명'] === name);
  if (!row) throw new Error(`만든 업무그룹이 목록에 없음: ${name}`);
  return row['업무그룹#'];
}

/** 업무그룹 상세를 열고 업무화면 목록 프레임 */
export async function openGroup(page: Page, no: string) {
  const main = await openWgSetting(page);
  await new Grid(main, '업무그룹#').clickCell('업무그룹#', no);
  await settle(page, 3000);
  let pl: Frame | undefined;
  await expect.poll(() => !!(pl = frame(page, F_PAGES)), { message: '업무화면 목록', timeout: 15_000 }).toBe(true);
  await settle(page, 1000);
  return pl!;
}

/** 업무그룹에 들어 있는 화면 (업무그룹설정 상세의 업무화면 목록) */
export async function groupPages(page: Page, no: string) {
  const pl = await openGroup(page, no);
  return new Grid(pl, '메뉴명').rows().catch(() => []);
}

/** 업무그룹설정에서 화면 넣기: 업무화면 [생성] → 메뉴 트리에서 체크 → [선택] */
export async function addPages(page: Page, no: string, names: string[]) {
  const pl = await openGroup(page, no);
  await clickButton(pl, '생성');
  await settle(page, 2500);
  await pickPages(page, names);
}

/** 업무그룹 지우기 (목록에서 체크 → 삭제 → OK) */
export async function deleteGroup(page: Page, no: string) {
  const main = await openWgSetting(page);
  const g = new Grid(main, '업무그룹#');
  const idx = (await g.rows()).findIndex((r) => r['업무그룹#'] === no);
  if (idx < 0) return;
  await g.check(idx);
  await clickButton(main, '삭제');
  await settle(page, 1000);
  await okIfShown(page);
}

/** 테스트가 예전에 만들고 못 지운 업무그룹(PREFIX) 정리 */
export async function cleanupGroups(page: Page) {
  for (const r of (await groupList(page)).filter((x) => (x['업무그룹명'] || '').startsWith(PREFIX))) await deleteGroup(page, r['업무그룹#']);
}

/** 왼쪽 메뉴에 업무그룹 항목(W+번호)이 있는지 */
export async function inLeftMenu(page: Page, no: string) {
  await page.goto('/dream/index.do');
  await page.waitForLoadState('networkidle');
  return page.evaluate((id) => !!document.querySelector(`#mainMenu [id="W${id}"]`), no);
}

/**
 * 왼쪽 메뉴 업무그룹 화면을 열고 위쪽 탭마다 내용이 보이는지
 * 내용: 보이는 탭 화면(iframe) 안의 보이는 요소 수와 글자 수. 요소가 거의 없으면 빈칸
 */
export async function groupScreen(page: Page, no: string) {
  await page.goto('/dream/index.do');
  await page.waitForLoadState('networkidle');
  await page.locator(`[id="W${no}"]`).dispatchEvent('click');
  await settle(page, 3000);
  const tabs = await topTabs(page);
  const out: { tab: string; els: number; text: number; blank: boolean }[] = [];
  for (const t of tabs) {
    await page.locator('ul.nav.nav-tabs > li', { hasText: new RegExp(`^\\s*${escapeRe(t)}\\s*$`) }).first().click();
    await settle(page, 3000);
    // 보이는 탭 화면 프레임
    const names = await page.evaluate(() => [...document.querySelectorAll<HTMLIFrameElement>('iframe[name^="tabFrame"]')].filter((f) => f.offsetWidth > 0 && f.offsetHeight > 0).map((f) => f.name));
    let els = 0, text = 0;
    for (const n of names) {
      const f = page.frames().find((x) => x.name() === n);
      if (!f || f.url() === 'about:blank') continue;
      const m = await f.evaluate(() => {
        const vis = [...document.querySelectorAll<HTMLElement>('body *')].filter((e) => e.offsetWidth > 0 && e.offsetHeight > 0);
        return { els: vis.length, text: (document.body.innerText || '').trim().length };
      }).catch(() => ({ els: 0, text: 0 }));
      els += m.els; text += m.text;
    }
    out.push({ tab: t, els, text, blank: els < 10 && text < 10 });
  }
  return out;
}
