import { Page, Frame, expect } from '@playwright/test';
import { settle } from './dream';

// 결재요청(AZ303) 부품: 메뉴를 이름으로 열기, 목록 프레임, 결재요청 팝업 프레임

/** 왼쪽 메뉴를 이름으로 차례로 엽니다. 예: ['작업관리', '수리작업', '수리작업실행'] (사이트마다 메뉴 번호가 달라 이름으로) */
export async function openMenuByPath(page: Page, path: string[]) {
  await page.goto('/dream/index.do');
  await page.waitForLoadState('networkidle');
  let prev = '';
  for (const name of path) {
    const id = await page.evaluate(({ name, prev }) => {
      const label = (e: Element) => ((e.firstChild?.textContent || e.textContent || '').trim());
      const root = (prev && document.querySelector(`#mainMenu [id="${prev}"]`)?.closest('.menu-item')) || document.querySelector('#mainMenu')!;
      const after = prev ? document.querySelector(`#mainMenu [id="${prev}"]`) : null;
      const cands = [...root.querySelectorAll<HTMLElement>('.menu-title[id], .submenu-item[id], .depth3-item[id]')]
        .filter((e) => /^\d+$/.test(e.id) && !/FAVORITE|WORKGROUP/.test(e.className) && label(e) === name);
      const pick = cands.find((e) => !after || (after.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING)) ?? cands[0];
      return pick ? pick.id : '';
    }, { name, prev });
    if (!id) throw new Error(`메뉴 없음: ${path.join(' > ')} (${name})`);
    const el = page.locator(`#mainMenu [id="${id}"]`);
    await el.click({ timeout: 5_000 }).catch(() => el.dispatchEvent('click'));
    prev = id;
  }
  await settle(page, 1500);
}

/** 지금 보이는 목록 프레임 (검색 버튼이 보이는 List.do 프레임) */
export async function listFrame(page: Page): Promise<Frame> {
  let found: Frame | undefined;
  await expect.poll(async () => {
    found = undefined;
    // List.do 프레임을 먼저 보고, 없으면 다른 화면 프레임도 봄 (설비 목록(위치) 등은 주소가 List.do 가 아닐 수 있음)
    const frames = page.frames().filter((f) => /\.do/.test(f.url()) && !/index\.do/.test(f.url()));
    for (const f of [...frames.filter((x) => /list\.do/i.test(x.url())), ...frames.filter((x) => !/list\.do/i.test(x.url()))]) {
      const ok = await f.evaluate(() =>
        (!window.frameElement || (window.frameElement as HTMLElement).offsetWidth > 0) &&
        // 설비·정기점검주기 목록(위치)처럼 검색 버튼이 옆 트리 프레임에 있는 화면은 [생성]으로 판단
        [...document.querySelectorAll<HTMLElement>('a.b_search, a.b_create')].some((a) => a.offsetWidth > 0)).catch(() => false);
      if (ok) { found = f; break; }
    }
    return !!found;
  }, { message: '목록 프레임 찾기', timeout: 15_000 }).toBe(true);
  return found!;
}

/** 상세 화면의 [승인요청] (화면마다 class 가 b_approval 또는 b_apprequest) 을 눌러 결재요청 팝업을 엽니다. */
export async function openApproval(page: Page, detail: Frame) {
  const btn = detail.locator('a.b_approval:visible, a.b_apprequest:visible').first();
  await btn.click({ timeout: 15_000 });
  await settle(page, 3000);
  return approvalPopup(page);
}

/** 결재자 그리드의 열 순서 (보이는 머리글 기준) */
async function columnIndex(grid: Frame, header: string) {
  const i = await grid.evaluate((h) => {
    const hd = [...document.querySelectorAll<HTMLElement>('.xhdr table.hdr tr')].find((tr) => tr.querySelector('.hdrcell'))!;
    return [...hd.querySelectorAll('td')].findIndex((td) => (td as HTMLElement).innerText.trim() === h);
  }, header);
  if (i < 0) throw new Error(`결재자 그리드에 열 없음: ${header}`);
  return i;
}

/** 결재자 그리드 셀 (결재순서 번호로 행을 고름) */
export async function approverCell(grid: Frame, seq: string, header: string) {
  const i = await columnIndex(grid, header);
  return grid.locator('.objbox table.obj tr:visible').filter({ has: grid.locator('td:first-child', { hasText: new RegExp(`^\\s*${seq}\\s*$`) }) }).locator('td').nth(i);
}

/**
 * 결재자 칸(결재자1~5)에 사원을 넣습니다: 칸 더블클릭 → 돋보기 → 사원 Lov 에서 이름으로 고름.
 * (칸을 누르면 사원 목록이 뜨지만 글자로 걸러지지 않아 Lov 를 씀)
 */
export async function setApprover(page: Page, grid: Frame, seq: string, n: number, name: string) {
  const { lovContentFrame, pickInLov } = await import('./dream');
  const cell = await approverCell(grid, seq, `결재자${n}`);
  await cell.dblclick();
  await settle(page, 800);
  await cell.locator('p.open_spop').click();
  await settle(page, 2000);
  // 칸을 누르면 뜨는 사원 자동완성 목록이 Lov 를 연 뒤에도 남아 Lov 의 행을 가림 → 숨김
  // (상세의 날짜 칸에서 열린 달력이 남아 있으면 그것도 가림)
  for (const f of page.frames()) await f.evaluate(() => document.querySelectorAll<HTMLElement>('.dhx_popup_dhx_skyblue, .ui-datepicker').forEach((e) => (e.style.display = 'none'))).catch(() => {});
  await pickInLov(page, await lovContentFrame(page), name, '사원명');
  await settle(page, 1000);
  // 편집을 끝냄 (머리글 클릭)
  await grid.locator('.hdrcell', { hasText: '결재순서' }).first().click().catch(() => {});
  await settle(page, 500);
}

/** 결재자 칸 비우기 (칸 더블클릭 → 글자 지움 → 편집 끝) */
export async function clearApprover(page: Page, grid: Frame, seq: string, n: number) {
  const cell = await approverCell(grid, seq, `결재자${n}`);
  await cell.dblclick();
  await settle(page, 500);
  const input = cell.locator('input').first();
  await input.fill('').catch(() => {});
  await input.press('Delete').catch(() => {});
  await grid.locator('.hdrcell', { hasText: '결재순서' }).first().click().catch(() => {});
  await settle(page, 500);
}

/** 확인창 OK 가 보이면 누름 */
export async function confirmOk(page: Page) {
  const ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
  if (!(await ok.isVisible().catch(() => false))) return false;
  await ok.click({ timeout: 10_000 }).catch(() => ok.click({ force: true, timeout: 10_000 }));
  await settle(page, 1500);
  return true;
}

/**
 * 개인설정 > 결재대기 에서 제목이 같은 건을 [결재처리] → [승인] 합니다. 결재 단계마다 한 번씩 나오므로 없어질 때까지 반복.
 * 반환: 승인한 횟수
 */
export async function approveInInbox(page: Page, title: string, max = 6) {
  const { Grid, clickButton } = await import('./dream');
  const { popupMessage } = await import('./form');
  let n = 0;
  for (; n < max; n++) {
    await openMenuByPath(page, ['개인설정', '결재대기']);
    const list = await listFrame(page);
    const rows = await new Grid(list, '요청일자').rows();
    if (!rows.some((r) => r['제목'] === title)) break;
    // 행을 누르는 것만으로는 "선택된 데이터가 없습니다." → 행 체크박스를 켬
    await list.locator('div.gridbox:visible .objbox tr:visible', { hasText: title }).first().locator('img[src*="item_chk"]').first().click();
    await settle(page, 1000);
    await clickButton(list, '결재처리');
    await settle(page, 2500);
    const pop = await waitPopupWith(page, '승인');
    await clickButton(pop, '승인');
    await settle(page, 1000);
    await confirmOk(page);
    await popupMessage(page);
    await settle(page, 1500);
  }
  return n;
}

/** 보이는 버튼 글자가 있는 팝업 프레임 */
async function waitPopupWith(page: Page, text: string) {
  let found: Frame | undefined;
  await expect.poll(async () => {
    found = undefined;
    for (const f of page.frames()) {
      if (!/popupIframe|Popup\.do/i.test(f.name() + f.url())) continue;
      if (await f.locator('a:visible', { hasText: new RegExp(`^\\s*${text}\\s*$`) }).count().catch(() => 0)) { found = f; break; }
    }
    return !!found;
  }, { message: `팝업 [${text}] 찾기`, timeout: 15_000 }).toBe(true);
  return found!;
}

/**
 * 결재요청 팝업의 [승인요청] → OK. 안내 메시지는 잠깐 떴다 사라질 수 있어 짧게 여러 번 읽어 모읍니다.
 * 반환: { msgs: 본 안내들, closed: 팝업이 닫혔는지 }
 */
export async function requestApproval(page: Page, pop: Frame) {
  const msgs = await clickAndCollect(page, pop, '승인요청');
  await settle(page, 1000);
  const closed = !page.frames().some((f) => f.url().includes('appReqDetail.do') && f.parentFrame() !== null);
  return { msgs, closed };
}

/**
 * 화면 가운데 잠깐 떴다 사라지는 안내 상자(확인 버튼 없음, 예: "저장후 사용하세요.") 글자.
 * 위에 떠 있는(position fixed/absolute, z-index 높음) 짧은 글자 상자를 모든 프레임에서 찾음. 사원 목록 같은 그리드는 뺌.
 */
export async function floatingTexts(page: Page) {
  const out: string[] = [];
  // 안내 상자는 메인 화면이나 팝업 프레임에 뜸 (모든 프레임을 다 보면 화면마다 수십 개라 느림)
  for (const f of page.frames().filter((x) => x === page.mainFrame() || /popupIframe/.test(x.name()) || /List\.do/.test(x.url()))) {
    const t = await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('body div')].filter((e) => {
      if (!(e.offsetWidth > 0)) return false;
      const s = getComputedStyle(e);
      if (!/fixed|absolute/.test(s.position) || !(+s.zIndex >= 100)) return false;
      if (e.querySelector('.gridbox, table, iframe, input')) return false;
      const t = (e.innerText || '').trim();
      return t.length > 0 && t.length < 200;
    }).map((e) => e.innerText.trim())).catch(() => [] as string[]);
    out.push(...t);
  }
  // 확인창("…하시겠습니까? OK Cancel")은 안내가 아니므로 뺌
  return [...new Set(out)].filter((t) => !/^(OK|확인|Cancel|취소)$/.test(t) && !/\n\s*OK\s*\n\s*Cancel\s*$/.test(t));
}

async function visibleToast(page: Page) {
  return (await floatingTexts(page)).join(' / ');
}

/** 버튼을 누르고 약 4초 동안 뜨는 안내(확인창 OK 는 누름)를 모읍니다. */
export async function clickAndCollect(page: Page, scope: Frame, text: string) {
  const { clickButton } = await import('./dream');
  const { popupMessage } = await import('./form');
  const before = new Set(await floatingTexts(page));
  const msgs: string[] = [];
  const onDialog = (d: any) => { msgs.push(d.message()); d.accept().catch(() => {}); };
  page.on('dialog', onDialog);
  await clickButton(scope, text);
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(500);
    for (const t of await floatingTexts(page)) if (!before.has(t)) msgs.push(t);
    if (await confirmOk(page)) continue;
    const m = await popupMessage(page);
    if (m) msgs.push(m);
  }
  page.off('dialog', onDialog);
  return [...new Set(msgs)];
}

/** 열린 팝업을 모두 닫음 (위에 있는 것부터) */
export async function closeAllPopups(page: Page) {
  for (let i = 0; i < 4; i++) {
    let closed = false;
    for (const f of page.frames().filter((x) => /popupIframe/.test(x.name())).reverse()) {
      const x = f.locator('div.b_pwin_close:visible').first();
      if (await x.isVisible().catch(() => false)) { await x.click().catch(() => {}); closed = true; await settle(page, 800); break; }
    }
    if (!closed) {
      // 결재요청 팝업 닫기 X 는 팝업 바깥(머리줄)에 있음
      for (const f of page.frames()) {
        const x = f.locator('.dhxwin_active .dhxwin_button_close:visible, .b_pwin_close:visible').first();
        if (await x.isVisible().catch(() => false)) { await x.click().catch(() => {}); closed = true; await settle(page, 800); break; }
      }
    }
    if (!closed) break;
  }
}

/** 운영기준설정 > 승인Flow설정 에서 업무구분의 (사용 Y) 승인순서 */
export async function flowPhasesOf(page: Page, apprType: string) {
  const { Grid } = await import('./dream');
  await openMenuByPath(page, ['운영기준설정', '승인Flow설정']);
  const l = await listFrame(page);
  const rows = await new Grid(l, '업무구분').rows();
  const flow = rows.find((r) => r['업무구분'] === apprType && r['사용여부'] === 'Y') ?? rows.find((r) => r['업무구분'] === apprType);
  if (!flow) return { flow: undefined, phases: [] as Record<string, string>[] };
  // 행이 많으면 아래 행이 그려지지 않아 못 누름 → 승인Flow 명으로 걸러서 검색
  const { put } = await import('./form');
  const { clickButton } = await import('./dream');
  await put(l.locator('[id="mgrWorkflowCommonDTO.filterDescription"]'), flow['승인Flow 명']);
  await clickButton(l, '검색');
  await settle(page, 2000);
  await new Grid(l, '업무구분').clickCell('승인Flow 명', flow['승인Flow 명'], { dbl: true });
  await settle(page, 3000);
  let f: Frame | undefined;
  await expect.poll(() => !!(f = page.frames().find((x) => /mgrWorkflowPhaseList/.test(x.name()))), { timeout: 15_000 }).toBe(true);
  return { flow, phases: await new Grid(f!, '결재순서').rows() };
}

/** 지금 보이는 상세 프레임 중 [승인요청] 버튼이 있는 것 */
export async function detailWithApproval(page: Page) {
  for (const f of page.frames()) {
    if (await f.locator('a.b_approval:visible, a.b_apprequest:visible').count().catch(() => 0)) return f;
  }
  return undefined;
}

/** 결재요청 팝업(appReqDetail)과 결재자 그리드 프레임 */
export async function approvalPopup(page: Page) {
  let det: Frame | undefined, grid: Frame | undefined;
  await expect.poll(() => {
    det = page.frames().find((f) => f.url().includes('appReqDetail.do'));
    grid = page.frames().find((f) => f.url().includes('appPrcList.do') && f.name().includes('appReqDetail'));
    return !!det && !!grid;
  }, { message: '결재요청 팝업 찾기', timeout: 15_000 }).toBe(true);
  // 결재자 그리드가 그려질 때까지
  await expect.poll(() => grid!.evaluate(() => [...document.querySelectorAll<HTMLElement>('.hdrcell')].some((h) => h.offsetWidth > 0 && h.innerText.trim() === '결재순서')).catch(() => false),
    { message: '결재자 그리드 그려짐', timeout: 15_000 }).toBe(true);
  return { det: det!, grid: grid! };
}
