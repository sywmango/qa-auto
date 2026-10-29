import { Page, test, expect } from '@playwright/test';
import { openMenu, waitFrame, clickTab, settle, Grid, openLov, expandTreeNode, visibleTreeNodes } from '../support/dream';
import { relogin } from '../support/pmplan';
import { Screen } from './types';

// 작업관리 > 정기점검작업 > 정기점검주기 (AD230). 대상 화면: 목록(조건) 탭
const MENU = ['132', '372', '454'];
const F_COND = 'tabFrameTAB.workPmListInsList_workPmiMstr';
const F_DETAIL = 'tabFrameTAB.workPmListRInsDetail_workPmListInsList';
const TC = 'AD230_TC_026';

async function openCond(page: Page) {
  await openMenu(page, MENU).catch(async (e) => {
    // 같은 계정이 다른 곳에서 로그인하면 세션이 끊겨 로그인 화면이 뜸 → 다시 로그인하고 한 번 더
    if (!(await page.getByRole('textbox', { name: 'Password' }).isVisible().catch(() => false))) throw e;
    await relogin(page);
    await openMenu(page, MENU);
  });
  await clickTab(page, '목록(조건)');
  return waitFrame(page, F_COND);
}

/** 목록 3번째 행 작업명을 눌러 상세 화면이 열리는지 */
async function detailOpens(page: Page) {
  const f = await openCond(page);
  const g = new Grid(f, '예방작업번호');
  await g.clickCell('작업명', (await g.rows())[2]['작업명']);
  await settle(page, 4000);
  return page.frames().some((x) => x.name() === F_DETAIL);
}

/** 목록 3번째 행 작업명을 눌러 연 상세 화면 */
async function openDetail(page: Page) {
  const f = await openCond(page);
  const g = new Grid(f, '예방작업번호');
  await g.clickCell('작업명', (await g.rows())[2]['작업명']);
  const d = await waitFrame(page, F_DETAIL);
  await settle(page, 3000);
  return d;
}

/** 부서 Lov(트리): 드림소프트웨어 하위 부서가 [조직관리 > 부서] 메뉴 트리와 같은지 (TC_003 에 덧붙임) */
async function deptTreeSame(page: Page) {
  const cf = await openCond(page);
  const lov = await openLov(page, cf, 'maPmMstrCommonDTO.deptDesc');
  const lovTop = await visibleTreeNodes(lov);
  await expandTreeNode(page, lov, '드림소프트웨어');
  const lovChildren = (await visibleTreeNodes(lov)).filter((n) => !lovTop.includes(n));
  await openMenu(page, ['121', '92']);
  const df = await waitFrame(page, 'tabFrameTAB.deptTreeList_deptListView');
  const menuTop = await visibleTreeNodes(df);
  await expandTreeNode(page, df, '드림소프트웨어');
  const menuChildren = (await visibleTreeNodes(df)).filter((n) => !menuTop.includes(n));
  test.info().annotations.push({ type: '실제결과', description: `부서 트리: 드림소프트웨어 하위 Lov [${lovChildren.join(', ')}] / 메뉴 [${menuChildren.join(', ')}]` });
  expect.soft(lovChildren.length, '드림소프트웨어 하위 부서가 펼쳐져야 함').toBeGreaterThan(0);
  expect.soft([...lovChildren].sort(), 'Lov 하위 부서 = 부서 메뉴 하위 부서').toEqual([...menuChildren].sort());
}

export const AD230: Screen = {
  code: 'AD230',
  name: '정기점검주기',
  menu: MENU,
  fields: [
    { tc: TC, title: '검색 Field 설정', open: openCond, name: '거래처', id: 'maPmMstrCommonDTO.filterVendorDesc', anchor: '예방작업번호', reset: true, editable: true, compare: true },
  ],
  lists: [
    { tc: TC, title: '목록 Setting', open: openCond, col: '카테고리', id: 'PMCATEGDESC', anchor: '예방작업번호', width: true, listLength: true, reset: true, editable: true },
  ],
  tabs: [
    { tc: TC, title: 'Tab 설정', open: openCond, key: 'workPmListRInsDetail', name: '정기점검주기설정', shown: detailOpens },
  ],
  // 검색·목록·상세 공통 케이스 (tests/common/screen.spec.ts)
  view: {
    ids: {
      defaults: 'AD230_TC_001', lovOrigin: 'AD230_TC_002', lovs: 'AD230_TC_003', searchOne: 'AD230_TC_004', searchCombo: 'AD230_TC_005',
      searchAll: 'AD230_TC_006', searchNone: 'AD230_TC_007', sort: 'AD230_TC_009', total: 'AD230_TC_010', rowDetail: 'AD230_TC_011',
      popupDetail: 'AD230_TC_012', listDetail: 'AD230_TC_013', listFormat: 'AD230_TC_014', readonly: 'AD230_TC_016', close: 'AD230_TC_017',
      deleteNone: 'AD230_TC_024', excel: 'AD230_TC_025',
    },
    open: openCond,
    dto: 'maPmMstrCommonDTO',
    key: '예방작업번호',
    // 설비가 등록된 첫 행 (테스트로 만든 설비 없는 주기는 건너뜀)
    pickRow: (rows) => rows.find((r) => r['설비']) ?? rows[0],
    defaults: {
      values: { filterIsActiveDesc: 'Y' },
      empty: ['pmNo', 'pmDesc', 'equipDesc', 'eqLocDesc', 'filterPlantDesc', 'deptDesc', 'wkCtrDesc', 'empName', 'filterVendorDesc'],
    },
    lovOrigin: { id: 'equipDesc', menu: ['114', '447'], frame: 'tabFrameTAB.assetMstrLoc_assetMstr', header: '설비번호' },
    lovs: [
      ['설비위치', 'eqLocDesc'], ['공장명', 'filterPlantDesc'], ['부서명', 'deptDesc'], ['작업그룹명', 'wkCtrDesc'],
      ['담당자', 'empName'], ['거래처', 'filterVendorDesc'], ['시행여부', 'filterIsActiveDesc'],
    ],
    conds: [
      { id: 'pmNo', col: '예방작업번호', value: (r) => r['예방작업번호'] },
      { id: 'pmDesc', col: '작업명', value: (r) => r['작업명'], words: true },
      { id: 'equipDesc', col: '설비', value: (r) => r['설비'], lov: '설비명' },
      // 부서명 Lov 는 트리형: 상위 부서를 펼쳐 하위 팀(QA팀)을 고름
      { id: 'deptDesc', col: '부서명', value: () => 'QA팀', lov: '', tree: true },
    ],
    combos: [
      [{ id: 'pmDesc', col: '작업명', value: () => '점검' }, { id: 'filterIsActiveDesc', col: '시행여부', value: () => 'Y', preset: true }],
      [{ id: 'equipDesc', col: '설비', value: (r) => r['설비'], lov: '설비명' }, { id: 'pmDesc', col: '작업명', value: (r) => r['작업명'].split(/\s+/)[0] }],
    ],
    clearAll: ['filterIsActiveDesc'],
    none: { id: 'pmDesc', value: '존재하지않는작업명_ZZ9' },
    // 설비 조건: 그 설비가 묶인 주기는 묶인 설비마다 한 행씩 나오는 것이 정상 (사용자 확인 2026-10-20)
    sameAs: (rows, r, c, value) => c.col === '설비' && rows.some((x) => x['예방작업번호'] === r['예방작업번호'] && x['설비'] === value),
    sort: { col: '예방작업번호', numeric: true },
    detail: {
      click: '작업명',
      frame: F_DETAIL,
      title: (r) => new RegExp(`정기점검주기설정\\s*:\\s*${r['예방작업번호']}`),
      popupTitle: (r) => new RegExp(`(^|\\s)${r['예방작업번호']}\\s*/\\s*`),   // 새 창 제목은 "7920 / 충진기 점검"
      dto: 'maPmMstrDetailDTO',
      pairs: [['예방작업번호', 'pmNo'], ['작업명', 'description'], ['작업그룹명', 'wkCtrDesc'], ['담당자', 'empName'], ['일정생성방법', 'scheduleTypeDesc'], ['작업형태', 'pmTypeDesc']],
      readonly: ['woTypeDesc', 'pmTypeDesc', 'pmNo'],
    },
    format: [['예방작업번호', /^\d+$/, '숫자'], ['주기', /^\d{1,3}(,\d{3})*$/, '숫자(천단위 쉼표)']],
    extra: { lovs: deptTreeSame },
    timeout: 120_000,
  },
  // 상단 공통 기능은 이 메뉴에서 깊게 확인
  header: {
    menuId: '454', open: openCond, pageTab: '목록(조건)', wgPage: '정기점검주기 - 목록(조건)', deep: true,
    field: { name: '거래처', before: '작업명' },
    tab: { name: '목록(조건)', before: '목록(위치)' },
    detail: { open: openDetail, name: '비고', before: '작업명' },
  },
};
