import { test, expect, Page } from '@playwright/test';
import { openMenu, waitFrame, clickTab, settle, Grid } from '../support/dream';
import {
  openSetting, openTabSetting, checkAndClick, resetSetting, editSettingRow, settingRowTexts,
  listLength, setListLength, gridHeaders, headerWidth, gridBodyHeight, searchLabels,
} from '../support/setting';

// 작업관리 > 정기점검작업 > 정기점검주기 (AD230) Setting(사용자정의) 상세 테스트
// Setting 은 개인 저장(내 계정에만 적용). 바꾼 값은 각 테스트 끝에 원래대로 되돌립니다.
// 테스트ID 는 모두 AD230_TC_026 (Setting) 으로 묶어 결과 엑셀에 한 줄로 합쳐집니다.

const MENU = ['132', '372', '454'];
const F_COND = 'tabFrameTAB.workPmListInsList_workPmiMstr';
const F_DETAIL = 'tabFrameTAB.workPmListRInsDetail_workPmListInsList';

// 바꿔 볼 대상
const COL = { id: 'PMCATEGDESC', name: '카테고리' };          // 목록 칼럼
const FIELD = { id: 'maPmMstrCommonDTO.filterVendorDesc', name: '거래처' }; // 검색 필드
const TAB = { id: 'workPmListRInsDetail', name: '정기점검주기설정' };       // 상세 탭

// 설정 목록의 칸 순서(td): 정렬값 2, 칼럼너비 5 / 탭 설정 화면Display여부 3
const TD_ORDER = 2;
const TD_WIDTH = 5;
const TD_TAB_DISPLAY = 3;

function note(text: string) {
  test.info().annotations.push({ type: '실제결과', description: text });
}

async function openCond(page: Page) {
  await openMenu(page, MENU);
  await clickTab(page, '목록(조건)');
  return waitFrame(page, F_COND);
}

test.describe('AD230 정기점검주기 Setting', () => {
  test.describe.configure({ timeout: 180_000 });

  test('AD230_TC_026 목록 Setting: 칼럼을 숨기고 다시 보이게 한다.', async ({ page }) => {
    let f = await openCond(page);
    expect(await gridHeaders(f), '처음엔 칼럼이 보임').toContain(COL.name);
    try {
      await checkAndClick(page, await openSetting(page, f, 'list'), COL.id, 'Hide Column');
      f = await openCond(page);
      const hidden = await gridHeaders(f);
      note(`칼럼 숨기기 → 목록에 '${COL.name}' ${hidden.includes(COL.name) ? '보임' : '안 보임'}`);
      expect(hidden, '숨긴 칼럼은 목록에 없어야 함').not.toContain(COL.name);
    } finally {
      await checkAndClick(page, await openSetting(page, await openCond(page), 'list'), COL.id, 'Show Column');
    }
    f = await openCond(page);
    const shown = await gridHeaders(f);
    note(`보이기 → 목록에 '${COL.name}' ${shown.includes(COL.name) ? '다시 보임' : '안 보임'}`);
    expect(shown, '보이기 후 다시 보여야 함').toContain(COL.name);
  });

  test('AD230_TC_026 목록 Setting: 칼럼 정렬값과 너비를 바꾼다.', async ({ page }) => {
    let f = await openCond(page);
    const before = await gridHeaders(f);
    const width0 = await headerWidth(f, COL.name);
    const sf = await openSetting(page, f, 'list');
    const row0 = await settingRowTexts(sf, COL.id);
    const order0 = row0[1]; // 보이는 칸: 체크, 정렬값, 칼럼ID, 칼럼명, 너비 …
    const widthSet0 = row0[4];
    const prevCol = before[before.indexOf(COL.name) - 2]; // 두 칸 앞 칼럼(예방작업번호) 바로 뒤로 옮김
    try {
      await editSettingRow(page, sf, COL.id, { [TD_ORDER]: '135', [TD_WIDTH]: '180' });
      f = await openCond(page);
      const after = await gridHeaders(f);
      const width1 = await headerWidth(f, COL.name);
      note(`정렬값 ${order0}→135, 너비 ${widthSet0}→180 → 목록 순서 '${after.slice(1, 5).join(', ')}…', 너비 ${width0}px→${width1}px`);
      expect(after.indexOf(COL.name), `${prevCol} 바로 뒤로 옮겨져야 함`).toBe(after.indexOf(prevCol) + 1);
      expect(width1, '너비가 180px 이어야 함').toBe(180);
    } finally {
      await editSettingRow(page, await openSetting(page, await openCond(page), 'list'), COL.id, { [TD_ORDER]: order0, [TD_WIDTH]: widthSet0 });
    }
    f = await openCond(page);
    expect(await gridHeaders(f), '원래 순서로 돌아와야 함').toEqual(before);
    expect(await headerWidth(f, COL.name), '원래 너비로 돌아와야 함').toBe(width0);
  });

  test('AD230_TC_026 목록 Setting: 리스트 길이를 바꾼다.', async ({ page }) => {
    let f = await openCond(page);
    const h0 = await gridBodyHeight(f);
    await openSetting(page, f, 'list');
    const len0 = await listLength(page);
    const len1 = String(+len0 * 2);
    try {
      await setListLength(page, len1);
      f = await openCond(page);
      const h1 = await gridBodyHeight(f);
      note(`리스트 길이 ${len0}→${len1} → 목록 높이 ${h0}px→${h1}px`);
      expect(h1, '목록 높이가 커져야 함').toBeGreaterThan(h0 * 1.5);
    } finally {
      await openSetting(page, await openCond(page), 'list');
      await setListLength(page, len0);
    }
    f = await openCond(page);
    expect(await gridBodyHeight(f), '원래 높이로 돌아와야 함').toBe(h0);
  });

  test('AD230_TC_026 목록 Setting: 초기화하면 기본 칼럼으로 돌아온다.', async ({ page }) => {
    let f = await openCond(page);
    const before = await gridHeaders(f);
    await checkAndClick(page, await openSetting(page, f, 'list'), COL.id, 'Hide Column');
    f = await openCond(page);
    const hidden = await gridHeaders(f);
    await resetSetting(page, await openSetting(page, f, 'list'));
    f = await openCond(page);
    const after = await gridHeaders(f);
    note(`칼럼 숨김(${hidden.includes(COL.name) ? '보임' : '안 보임'}) → 초기화 → '${COL.name}' ${after.includes(COL.name) ? '다시 보임' : '안 보임'}`);
    expect(hidden).not.toContain(COL.name);
    expect(after, '초기화 후 원래 칼럼').toEqual(before);
  });

  test('AD230_TC_026 검색 Setting: 검색 필드를 숨기고 다시 보이게 한다.', async ({ page }) => {
    let f = await openCond(page);
    expect(await searchLabels(f)).toContain(FIELD.name);
    try {
      await checkAndClick(page, await openSetting(page, f, 'search'), FIELD.id, 'Hide Fields');
      f = await openCond(page);
      const hidden = await searchLabels(f);
      note(`필드 숨기기 → 검색 영역에 '${FIELD.name}' ${hidden.includes(FIELD.name) ? '보임' : '안 보임'}`);
      expect(hidden).not.toContain(FIELD.name);
    } finally {
      await checkAndClick(page, await openSetting(page, await openCond(page), 'search'), FIELD.id, 'Show Fields');
    }
    f = await openCond(page);
    const shown = await searchLabels(f);
    note(`보이기 → '${FIELD.name}' ${shown.includes(FIELD.name) ? '다시 보임' : '안 보임'}`);
    expect(shown).toContain(FIELD.name);
  });

  test('AD230_TC_026 검색 Setting: 검색 필드 정렬값을 바꾼다.', async ({ page }) => {
    let f = await openCond(page);
    const before = await searchLabels(f);
    const sf = await openSetting(page, f, 'search');
    const order0 = (await settingRowTexts(sf, FIELD.id))[1];
    try {
      await editSettingRow(page, sf, FIELD.id, { [TD_ORDER]: '115' }); // 예방작업번호(110) 바로 뒤
      f = await openCond(page);
      const after = await searchLabels(f);
      note(`'${FIELD.name}' 정렬값 ${order0}→115 → 검색 필드 순서 '${after.slice(0, 4).join(', ')}…'`);
      expect(after[1], '예방작업번호 바로 뒤로 옮겨져야 함').toBe(FIELD.name);
    } finally {
      await editSettingRow(page, await openSetting(page, await openCond(page), 'search'), FIELD.id, { [TD_ORDER]: order0 });
    }
    f = await openCond(page);
    expect(await searchLabels(f), '원래 순서로 돌아와야 함').toEqual(before);
  });

  test('AD230_TC_026 검색 Setting: 초기화하면 기본 검색 필드로 돌아온다.', async ({ page }) => {
    let f = await openCond(page);
    const before = await searchLabels(f);
    await checkAndClick(page, await openSetting(page, f, 'search'), FIELD.id, 'Hide Fields');
    f = await openCond(page);
    const hidden = await searchLabels(f);
    await resetSetting(page, await openSetting(page, f, 'search'));
    f = await openCond(page);
    const after = await searchLabels(f);
    note(`필드 숨김(${hidden.includes(FIELD.name) ? '보임' : '안 보임'}) → 초기화 → '${FIELD.name}' ${after.includes(FIELD.name) ? '다시 보임' : '안 보임'}`);
    expect(hidden).not.toContain(FIELD.name);
    expect(after, '초기화 후 원래 필드').toEqual(before);
  });

  test('AD230_TC_026 Tab 설정: 상세 탭을 숨겼다가 되돌린다.', async ({ page }) => {
    // 상세 화면이 열리는지: 목록 3번째 행 작업명 클릭
    const detailOpens = async () => {
      const f = await openCond(page);
      const g = new Grid(f, '예방작업번호');
      await g.clickCell('작업명', (await g.rows())[2]['작업명']);
      await settle(page, 4000);
      return page.frames().some((x) => x.name() === F_DETAIL);
    };
    const tabSetting = async () => { await openSetting(page, await openCond(page), 'search'); return openTabSetting(page); };
    expect(await detailOpens(), '처음엔 상세 화면이 열림').toBe(true);
    let afterReset = false;
    let afterEdit = false;
    try {
      await editSettingRow(page, await tabSetting(), TAB.id, { [TD_TAB_DISPLAY]: 'N' });
      const hiddenOpens = await detailOpens();
      note(`'${TAB.name}' 탭 화면Display N → 목록 행 클릭 시 상세 화면 ${hiddenOpens ? '열림' : '안 열림 (안내 메시지 없음)'}`);
      expect.soft(hiddenOpens, '숨긴 탭은 열리지 않아야 함').toBe(false);

      const tf = await tabSetting();
      await resetSetting(page, tf);
      const shownY = (await settingRowTexts(tf, TAB.id)).includes('Y');
      afterReset = await detailOpens();
      // 오류 증적: 설정은 Y 인데 행을 눌러도 상세 화면이 안 열린 상태
      if (!afterReset) await page.screenshot({ path: 'playwright/.data/evidence/err-TC_026.png' });
      note(`[초기화] → 설정 화면 Display ${shownY ? 'Y' : 'N'}, 상세 화면 ${afterReset ? '열림' : '안 열림 (다시 로그인해야 열림)'}`);
    } finally {
      // 같은 로그인 세션에서 되돌림: Edit 로 Y 저장
      await editSettingRow(page, await tabSetting(), TAB.id, { [TD_TAB_DISPLAY]: 'Y' });
      afterEdit = await detailOpens();
      note(`Edit 로 화면Display Y 저장 → 상세 화면 ${afterEdit ? '열림' : '안 열림'}`);
    }
    expect(afterReset, '초기화하면 상세 화면이 다시 열려야 함').toBe(true);
    expect(afterEdit, 'Y 로 되돌리면 상세 화면이 다시 열려야 함').toBe(true);
  });
});
