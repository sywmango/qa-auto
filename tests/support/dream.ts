import { Page, Frame, expect } from '@playwright/test';
import { allMenus } from '../menu-all.data';

// DREAM 화면 공통 부품
// - 메뉴 열기, 프레임 찾기, 버튼 클릭, 그리드 읽기, Lov(돋보기) 팝업 사용
// 화면 내용은 대부분 iframe(tabFrame...) 안에 열리므로 Frame 단위로 다룹니다.

/** 화면 요청이 끝날 때까지 잠깐 기다립니다. */
export async function settle(page: Page, ms = 800) {
  // 상세 화면은 요청이 계속 오가서 networkidle 이 안 올 때가 있어 최대 8초만 기다립니다.
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

// 메뉴 번호 → 이름 (oracle 사이트 기준, menu-all.data.ts 에서). 사이트(DB)마다 메뉴 번호가 달라서(mssql 에서 확인)
// 번호의 메뉴 이름이 다르면 같은 위치에서 이름으로 찾습니다.
const MENU_NAMES: Record<string, string> = { '292': '개인설정', '1398': '업무그룹설정' };
for (const m of allMenus) {
  MENU_NAMES[m.topId] = m.top;
  if (m.subId && m.sub) MENU_NAMES[m.subId] = m.sub;
  MENU_NAMES[m.menuId] = m.menu;
}

/** 메인 화면에서 메뉴 번호를 차례로 클릭해 메뉴를 엽니다. 예: ['132', '372', '454'] */
export async function openMenu(page: Page, ids: string[]) {
  await page.goto('/dream/index.do');
  await page.waitForLoadState('networkidle');
  let prev = '';
  for (const id of ids) {
    const target = await menuIdOnSite(page, id, prev);
    const el = page.locator(`[id="${target}"]`);
    // 펼침 애니메이션 중이면 다른 메뉴가 클릭을 가로챌 수 있어, 막히면 메뉴 항목에 직접 클릭 이벤트를 보냄
    await el.click({ timeout: 5_000 }).catch(() => el.dispatchEvent('click'));
    prev = target;
  }
  await settle(page, 1500);
}

/** 이 사이트에서 메뉴 번호 id 에 해당하는 항목의 번호. 이름이 같으면 그대로, 다르면 앞 메뉴(prev) 아래에서 같은 이름을 찾음 */
async function menuIdOnSite(page: Page, id: string, prev: string) {
  const name = MENU_NAMES[id];
  if (!name) return id;
  return page.evaluate(({ id, name, prev }) => {
    const label = (e: Element) => ((e.firstChild?.textContent || e.textContent || '').trim());
    const own = document.querySelector(`#mainMenu [id="${id}"]`);
    if (own && label(own) === name) return id;
    const root = (prev && document.querySelector(`#mainMenu [id="${prev}"]`)?.closest('.menu-item')) || document.querySelector('#mainMenu')!;
    const after = prev ? document.querySelector(`#mainMenu [id="${prev}"]`) : null;
    const cands = [...root.querySelectorAll<HTMLElement>('.menu-title[id], .submenu-item[id], .depth3-item[id]')]
      .filter((e) => /^\d+$/.test(e.id) && !/FAVORITE|WORKGROUP/.test(e.className) && label(e) === name);
    // 앞 메뉴보다 뒤에 있는 첫 항목 (같은 이름이 다른 묶음에도 있을 수 있음)
    const pick = cands.find((e) => !after || (after.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING)) ?? cands[0];
    return pick ? pick.id : id;
  }, { id, name, prev });
}

/** 이름으로 프레임을 찾습니다. 나타날 때까지 기다립니다. */
export async function waitFrame(page: Page, name: string | RegExp, timeout = 15_000): Promise<Frame> {
  const match = (f: Frame) => (typeof name === 'string' ? f.name() === name : name.test(f.name()));
  let found: Frame | undefined;
  await expect
    .poll(() => (found = page.frames().find(match)) !== undefined, { message: `프레임 ${name} 찾기`, timeout })
    .toBe(true);
  return found!;
}

/**
 * 버튼 글자 → 고유 class (2026-10-23 정기점검주기·계획·실행 화면에서 확인).
 * 글자는 배포 때 바뀔 수 있지만 class 는 거의 안 바뀌므로 class 로 먼저 찾습니다.
 * Setting 은 검색·상세(b_colsetting)와 목록(b_setting)이 달라 setting.ts 에서 따로 다룹니다.
 */
export const BUTTON_CLASS: Record<string, string> = {
  '검색': 'b_search',
  '생성': 'b_create',
  '삭제': 'b_delete',
  '저장': 'b_save',
  '확정': 'b_confirm',
  '상세보기': 'b_open',
  'Excel': 'b_excel',
  'Edit': 'b_edit',
  'Linked': 'b_linked',
  '일정생성': 'b_createsched',
  '표준항목선택': 'b_copy',
  '접기': 'b_collapse',
  '선택': 'b_select',
};

/** 프레임 안의 보이는 버튼: 고유 class 가 있으면 class 로, 없거나 class 가 안 붙은 화면이면 정확한 글자로 찾습니다. */
export function button(scope: Frame, text: string) {
  const byText = scope.locator('a:visible', { hasText: new RegExp(`^\\s*${escapeRe(text)}\\s*$`) });
  const cls = BUTTON_CLASS[text];
  return (cls ? scope.locator(`a.${cls}:visible`).or(byText) : byText).first();
}

/** 프레임 안에서 보이는 버튼(링크)을 클릭합니다 (class 우선, 없으면 글자). 예: '검색', '생성', '삭제' */
export async function clickButton(scope: Frame, text: string) {
  const btn = button(scope, text);
  // 닫힌 팝업의 투명 덮개(dhx_modal_cover)가 남아 클릭을 가로채는 경우가 있어, 막히면 강제로 클릭
  await btn.click({ timeout: 15_000 }).catch(() => btn.click({ force: true, timeout: 15_000 }));
}

/** 화면 위쪽 탭(목록(위치), 목록(조건) 등)을 클릭합니다. */
export async function clickTab(page: Page, text: string) {
  await page.getByText(text, { exact: true }).first().click();
  await settle(page, 1500);
}

/** 입력칸 값 읽기 (id에 점이 있어서 [id="..."] 형식으로 찾음) */
export async function fieldValue(scope: Frame, id: string) {
  return (await scope.locator(`[id="${id}"]`).inputValue()).trim();
}

export type GridRow = Record<string, string>;

/** dhtmlx 그리드 읽기. 그리드는 보이는 헤더 글자 하나로 찾습니다. */
export class Grid {
  constructor(public scope: Frame, public anyHeader: string) {}

  private async run<T>(fn: string, arg?: unknown): Promise<T> {
    return this.scope.evaluate(
      ({ header, fn, arg }) => {
        const boxes = [...document.querySelectorAll<HTMLElement>('div.gridbox')].filter((g) => g.offsetWidth > 0);
        const box = boxes.find((g) =>
          [...g.querySelectorAll('.hdrcell')].some((h) => (h as HTMLElement).innerText.trim() === header),
        );
        if (!box) throw new Error(`그리드 없음: 헤더 "${header}"`);
        const hdrRow = [...box.querySelectorAll('.xhdr table.hdr tr')].find((tr) => tr.querySelector('.hdrcell'))!;
        const heads = [...hdrRow.querySelectorAll('td')].map((td) => ({
          text: ((td as HTMLElement).innerText || '').trim(),
          visible: (td as HTMLElement).style.display !== 'none' && (td as HTMLElement).offsetWidth > 0,
        }));
        const rows = [...box.querySelectorAll('.objbox table.obj tr')].filter((tr) => tr.querySelector('td') && !tr.classList.contains('hdr') && (tr as HTMLElement).offsetHeight > 0);
        const area = box.closest('.article_box') || box.parentElement!.parentElement!;
        const m = ((area as HTMLElement).innerText || '').match(/Total\s*:\s*([\d,]+)\s*\/\s*([\d,]+)/i);
        const total = m ? { loaded: +m[1].replace(/,/g, ''), all: +m[2].replace(/,/g, '') } : null;
        const read = () =>
          rows.map((tr) => {
            const tds = [...tr.querySelectorAll('td')];
            const o: Record<string, string> = {};
            heads.forEach((h, i) => { if (h.text && !(h.text in o)) o[h.text] = ((tds[i] as HTMLElement)?.innerText || '').trim(); });
            return o;
          });
        if (fn === 'headers') return heads.filter((h) => h.visible).map((h) => h.text).filter(Boolean);
        if (fn === 'rows') return read();
        if (fn === 'total') return total;
        if (fn === 'align') {
          const i = heads.findIndex((h) => h.text === arg);
          return rows.slice(0, 5).map((tr) => {
            const td = tr.querySelectorAll('td')[i] as HTMLElement;
            return td ? (td.getAttribute('align') || getComputedStyle(td).textAlign) : '';
          });
        }
        throw new Error('unknown ' + fn);
      },
      { header: this.anyHeader, fn, arg },
    ) as Promise<T>;
  }

  headers() { return this.run<string[]>('headers'); }
  rows() { return this.run<GridRow[]>('rows'); }
  total() { return this.run<{ loaded: number; all: number } | null>('total'); }
  align(header: string) { return this.run<string[]>('align', header); }

  /** 지정한 열에 정확히 그 글자가 있는 첫 행의 셀을 클릭합니다. */
  async clickCell(header: string, text: string, opts: { dbl?: boolean } = {}) {
    const heads = await this.run<string[]>('headers');
    if (!heads.includes(header)) throw new Error(`열 없음: ${header}`);
    const cell = this.scope.locator('div.gridbox:visible .objbox td:visible', { hasText: new RegExp(`^\\s*${escapeRe(text)}\\s*$`) }).first();
    if (opts.dbl) await cell.dblclick(); else await cell.click();
  }

  /** 행 체크박스 클릭 (n번째 보이는 행, 0부터) */
  async check(rowIndex: number) {
    await this.scope.locator('div.gridbox:visible .objbox tr:visible img[src*="item_chk"]').nth(rowIndex).click();
  }
}

export function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 입력칸 옆 돋보기(Lov)를 눌러 팝업을 엽니다. 팝업 안에서 지금 보이는 내용 프레임을 돌려줍니다. */
export async function openLov(page: Page, scope: Frame, fieldId: string): Promise<Frame> {
  await scope.locator(`[id="${fieldId}"]`).locator('xpath=..').locator('p.open_spop').click();
  await settle(page, 1500);
  return lovContentFrame(page);
}

/** 열린 Lov 팝업에서 그리드가 보이는 프레임 (시스템코드 Lov는 popupIframe1 자체) */
export async function lovContentFrame(page: Page): Promise<Frame> {
  let found: Frame | undefined;
  await expect
    .poll(async () => {
      // 팝업이 두 개 이상 열려 있을 수 있음(popupIframe1, popupIframe2 …) → 가장 나중에 열린(위에 있는) 팝업을 씀
      found = undefined;
      for (const f of page.frames()) {
        if (!/popupIframe\d|lov/i.test(f.name() + f.url())) continue;
        const has = await f.evaluate(() =>
          (!window.frameElement || (window.frameElement as HTMLElement).offsetWidth > 0) &&
          [...document.querySelectorAll<HTMLElement>('div.gridbox')].some((g) => g.offsetWidth > 0) &&
          [...document.querySelectorAll<HTMLElement>('a')].some((a) => a.offsetWidth > 0 && a.innerText.trim() === '선택'),
        ).catch(() => false);
        if (has) found = f;
      }
      return !!found;
    }, { message: 'Lov 팝업 내용 찾기', timeout: 15_000 })
    .toBe(true);
  return found!;
}

/** Lov 팝업 그리드에서 글자가 정확히 같은 셀이 있는 행을 고르고 [선택]을 누릅니다. */
/** 첫 화면에 없으면 Lov 팝업의 목록(조건) 탭에서 searchLabel 칸에 글자를 넣고 검색한 뒤 고릅니다. */
export async function pickInLov(page: Page, lov: Frame, text: string, searchLabel?: string) {
  const cellIn = (f: Frame) =>
    f.locator('div.gridbox:visible .objbox td:visible', { hasText: new RegExp(`^\\s*${escapeRe(text)}\\s*$`) }).first();
  let scope = lov;
  if (!(await cellIn(scope).isVisible().catch(() => false)) && searchLabel) {
    const popup = page.frames().find((f) => f.name() === 'popupIframe1');
    const condTab = popup?.getByText('목록(조건)', { exact: true }).first();
    if (condTab && (await condTab.isVisible().catch(() => false))) {
      await condTab.click();
      await settle(page, 1500);
      scope = await lovContentFrame(page);
    }
    const input = scope.locator('div.field', { has: scope.locator('label', { hasText: new RegExp(`^\\s*${escapeRe(searchLabel)}\\s*$`) }) }).locator('input:visible').first();
    await input.fill(text);
    await button(scope, '검색').click();
    await settle(page, 1500);
  }
  await cellIn(scope).click({ timeout: 10_000 });
  // 행을 고르자마자 [선택]을 누르면 화면이 선택을 아직 못 받아 팝업이 안내 없이 그대로 남는 경우가 있음 (2026-10-26 시스템코드 Lov)
  await page.waitForTimeout(800);
  await clickButton(scope, '선택');
  await settle(page, 1000);
  if (await button(scope, '선택').isVisible().catch(() => false)) {
    await clickButton(scope, '선택');
    await settle(page, 1000);
  }
}

/** 트리 그리드(부서, 위치 등)에서 글자가 같은 노드의 + 를 눌러 펼칩니다. */
export async function expandTreeNode(page: Page, scope: Frame, text: string) {
  const node = scope.locator('div.gridbox:visible .treegrid_cell', {
    has: scope.locator('span', { hasText: new RegExp(`^\\s*${escapeRe(text)}\\s*$`) }),
  }).first();
  await node.locator('img[src*="plus"]').first().click();
  await settle(page, 1000);
}

/** 찾는 노드가 보일 때까지 접힌 노드(+)를 차례로 펼칩니다. 깊이 maxDepth 단계까지. */
export async function expandTreeUntil(page: Page, scope: Frame, text: string, maxDepth = 5) {
  const target = scope.locator('div.gridbox:visible .treegrid_cell span', { hasText: new RegExp(`^\\s*${escapeRe(text)}\\s*$`) }).first();
  for (let i = 0; i < maxDepth && !(await target.isVisible().catch(() => false)); i++) {
    const plus = scope.locator('div.gridbox:visible .treegrid_cell img[src*="plus"]:visible');
    const n = await plus.count();
    if (!n) break;
    for (let k = n - 1; k >= 0; k--) await plus.nth(k).click().catch(() => {});
    await settle(page, 800);
  }
  return target.isVisible().catch(() => false);
}

/** 트리 그리드에서 지금 보이는 노드 이름 목록 */
export async function visibleTreeNodes(scope: Frame) {
  return scope.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('div.gridbox .treegrid_cell')]
      .filter((e) => e.offsetHeight > 0)
      .map((e) => e.innerText.trim()),
  );
}

/** Lov 팝업 그리드의 Total (전체 건수) */
export async function lovTotal(lov: Frame) {
  // 왼쪽 트리에도 Total이 있어서, 오른쪽 목록(마지막 Total)을 씁니다.
  return lov.evaluate(() => {
    const all = [...document.body.innerText.matchAll(/Total\s*:\s*([\d,]+)\s*\/\s*([\d,]+)/gi)];
    return all.length ? +all[all.length - 1][2].replace(/,/g, '') : null;
  });
}
