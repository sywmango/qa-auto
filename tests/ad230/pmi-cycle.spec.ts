import { test, expect, Page, Frame } from '@playwright/test';
import {
  openMenu, waitFrame, clickButton, clickTab, fieldValue, settle, Grid,
  openLov, lovTotal, pickInLov, expandTreeNode, expandTreeUntil, visibleTreeNodes, lovContentFrame,
} from '../support/dream';

// 작업관리 > 정기점검작업 > 정기점검주기 (AD230) 단위테스트
// 테스트 제목 앞의 번호는 docs\AD230\이전버전\AD230_UT_정기점검주기_v3.xlsx 의 테스트ID 와 같습니다.
// 이 파일은 조회만 하는 케이스입니다. (데이터를 만들거나 바꾸지 않음)
// 데이터를 만드는 케이스는 pmi-cycle-data.spec.ts 에 있습니다.
// 검색·목록·상세 공통 케이스(TC_001~007, 009~014, 016, 017, 024, 025)는 tests/common/screen.spec.ts (화면 정의 tests/screens/ad230.ts)

const MENU = ['132', '372', '454'];
const F_COND = 'tabFrameTAB.workPmListInsList_workPmiMstr';
const F_LOC = 'tabFrameTAB.workPmiMstrLoc_workPmiMstr';
const F_CTG = 'tabFrameTAB.workPmiMstrCtg_workPmiMstr';
const F_DETAIL = 'tabFrameTAB.workPmListRInsDetail_workPmListInsList';

/** 결과서에 남길 실제 값 기록 */
function note(text: string) {
  test.info().annotations.push({ type: '실제결과', description: text });
}

async function openCond(page: Page) {
  await openMenu(page, MENU);
  await clickTab(page, '목록(조건)');
  return waitFrame(page, F_COND);
}

async function search(page: Page, f: Frame) {
  await f.locator('a.b_search:visible').first().click();
  await settle(page, 1500);
}

const listGrid = (f: Frame) => new Grid(f, '예방작업번호');

/** 설비가 등록된 첫 행 (테스트로 만든 설비 없는 주기는 건너뜀) */
async function firstRow(f: Frame) {
  const rows = await listGrid(f).rows();
  return rows.find((r) => r['설비']) ?? rows[0];
}

test.describe('AD230 정기점검주기 (조회)', () => {
  test('AD230_TC_008 트리에서 위치/종류를 선택하여 조회한다.', async ({ page }) => {
    await openMenu(page, MENU);
    const lf = await waitFrame(page, F_LOC);
    const tree = new Grid(lf, '위치명');
    const places = (await tree.rows()).map((r) => r['위치명']).filter(Boolean);
    const log: string[] = [];
    // 정기점검주기가 있는 위치 하나 고르기: 목록 첫 행의 설비위치 맨 앞 단어
    const list = new Grid(lf, '예방작업번호');
    const allRows = await list.rows();
    const target = places.find((p) => allRows.some((r) => (r['설비위치'] || '').startsWith(p))) ?? places[0];
    await tree.clickCell('위치명', target);
    await settle(page, 1500);
    const rows = await list.rows();
    const bad = rows.filter((r) => !(r['설비위치'] || '').startsWith(target));
    log.push(`위치 "${target}" 선택: ${rows.length}행, 다른 위치 ${bad.length}행`);
    expect.soft(bad.length, '선택한 위치의 데이터만 보여야 함').toBe(0);

    await clickTab(page, '목록(종류)');
    const cf = await waitFrame(page, F_CTG);
    const ctgHeads = await cf.evaluate(() => [...document.querySelectorAll<HTMLElement>('.hdrcell')].filter((h) => h.offsetWidth).map((h) => h.innerText.trim()));
    log.push(`목록(종류) 헤더: ${ctgHeads.slice(0, 4).join(', ')}`);
    expect.soft(ctgHeads.length, '목록(종류) 화면이 열려야 함').toBeGreaterThan(0);
    note(log.join('\n'));
  });

  test('AD230_TC_026 Setting 팝업이 열리는지 확인한다.', async ({ page }) => {
    const f = await openCond(page);
    const before = page.frames().length;
    await clickButton(f, 'Setting');
    await settle(page, 1500);
    const popup = page.frames().find((x) => x.name() === 'popupIframe1');
    const text = popup ? await popup.evaluate(() => document.body.innerText.slice(0, 200)).catch(() => '') : '';
    note(`검색 영역 Setting 클릭 → 팝업 ${popup ? '열림' : '안 열림'} (${text.split('\n').slice(0, 3).join(' / ')}) frames ${before}→${page.frames().length}`);
    expect(popup, 'Setting 팝업').toBeTruthy();
  });

  // Linked 메뉴 항목은 새 브라우저 창으로 열립니다. 새 창에 이 예방작업번호의 데이터가 보이는지 확인합니다.
  async function openLinked(page: Page, linkClass: string, label: string) {
    const f = await openCond(page);
    const r = await firstRow(f);
    const no = r['예방작업번호'];
    await listGrid(f).clickCell('작업명', r['작업명']);
    const d = await waitFrame(page, F_DETAIL);
    await settle(page, 1000);
    await clickButton(d, 'Linked');
    const popWin = page.context().waitForEvent('page', { timeout: 10_000 }).catch(() => null);
    await d.locator(`a.${linkClass}`).click();
    const win = await popWin;
    expect(win, `${label} 새 창이 열려야 함`).toBeTruthy();
    await settle(win!, 2500);
    let found = false;
    let title = '';
    const extra: string[] = [];
    for (const fr of win!.frames()) {
      const t = await fr.evaluate(() => document.body?.innerText || '').catch(() => '');
      const tot = t.match(/Total\s*:\s*[\d,]+\s*\/\s*[\d,]+/);
      if (tot) extra.push(tot[0]);
      const vals = await fr.evaluate((no) => [...document.querySelectorAll('input')].filter((i) => i.value === no).map((i) => i.id), no).catch(() => [] as string[]);
      if (vals.length) extra.push('조건 ' + vals.join(','));
      if (!title) title = t.split('\n').map((s) => s.trim()).find(Boolean) ?? '';
      if (new RegExp(`(^|\\s)${no}(\\s|$)`).test(t)) found = true;
    }
    note(`Linked > ${label}: 새 창 열림 (첫 글자 "${title}"), 예방작업번호 ${no} 데이터 ${found ? '표시됨' : '안 보임'} (${extra.join(' / ')})`);
    // 일정이 없는 주기면 목록은 비어 있으므로, 새 창의 검색조건에 이 예방작업번호가 들어갔는지로 판단합니다.
    const filtered = extra.some((x) => x.startsWith('조건 '));
    expect.soft(found || filtered, `새 창이 예방작업번호 ${no} 조건으로 열려야 함`).toBe(true);
    await win!.close();
  }

  test('AD230_TC_029 점검일정을 확인한다. (Linked)', async ({ page }) => {
    await openLinked(page, 'link_pmrinssched', '점검일정');
  });

  test('AD230_TC_030 연간점검일정을 확인한다. (Linked)', async ({ page }) => {
    await openLinked(page, 'link_pmrinsyearsched', '연간점검일정');
  });

  test('AD230_TC_031 설비 목록을 조회한다. (하위 목록)', async ({ page }) => {
    const f = await openCond(page);
    const r = await firstRow(f);
    await listGrid(f).clickCell('작업명', r['작업명']);
    const eq = await waitFrame(page, /^tabFrameTAB\.workPmListRInsEquipList_/);
    await settle(page, 1500);
    const g = new Grid(eq, '최초작업예정일');
    const rows = await g.rows();
    const total = await g.total();
    note(`예방작업번호 ${r['예방작업번호']}: 설비 ${rows.length}행, Total ${total?.loaded}/${total?.all}, 첫 설비 ${rows[0]?.['설비번호'] ?? '-'}`);
    expect(total?.all).toBe(rows.length);
    // 목록(조건)은 설비 1대당 1행이므로, 같은 예방작업번호 행 수와 설비 수가 같아야 함
    const sameNo = (await listGrid(f).rows()).filter((x) => x['예방작업번호'] === r['예방작업번호']).length;
    expect.soft(rows.length, '목록(조건)의 같은 예방작업번호 행 수 = 설비 수').toBe(sameNo);
  });
});






