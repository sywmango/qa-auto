import { Page } from '@playwright/test';
import { BASE_TAG } from '../support/form';
import { settle } from '../support/dream';
import { MENU, TAB, openTab, searchPeriod, loadAll, clickRow, listGrid, search } from '../support/pmplan';
import * as V from '../support/pmplan-view';
import { Screen } from './types';

// 작업관리 > 정기점검작업 > 정기점검계획 (AD210). 대상 화면: 목록(조건) 탭
const TC = 'AD210_TC_027';
const SY = BASE_TAG;   // 팀 공용 기준 주기(8007)의 계획
const P = TAB.period.dto;
const period = (page: Page) => openTab(page, 'period');
const year = (page: Page) => openTab(page, 'year');
const periodList = (page: Page) => searchPeriod(page, { pmDesc: SY });

/** [sychoi] 작업계획 행을 눌러 일정 상세가 열리는지 */
async function detailOpens(page: Page) {
  let f = await periodList(page);
  let rows = await loadAll(page, f);
  // [sychoi] 계획이 없는 사이트(mssql 등)는 아무 작업계획 행이나 엶 (행을 눌러 상세만 보므로 데이터는 바뀌지 않음)
  if (!rows.some((r) => r['일정상태'] === '작업계획')) {
    f = await searchPeriod(page, {});
    rows = await listGrid(f).rows(); // 전체는 많아서 첫 화면만
  }
  await clickRow(f, rows.findIndex((r) => r['일정상태'] === '작업계획'));
  await settle(page, 4000);
  const d = page.frames().find((x) => x.name() === 'tabFrameTAB.workCalPmRInsPeriodDetail_workCalPmRInsPeriodList');
  return d ? d.locator('[id="workCalPmRInsPeriodDetailDTO.schedDate"]').isVisible().catch(() => false) : false;
}

export const AD210: Screen = {
  code: 'AD210',
  name: '정기점검계획',
  menu: MENU,
  fields: [
    // 예방작업번호(105) 바로 다음 정렬값 106 을 작업명이 써서 같은 값이 되면 순서가 DB마다 달라짐(mssql) → 일정조정 일자 뒤로 옮겨 확인
    { tc: TC, title: '검색 Field 설정', open: period, name: '계획거래처', anchor: '일정조정 일자', reset: true, editable: true, compare: true },
  ],
  lists: [
    // 측정시간·비고 칼럼은 기본 Setting 에서 숨겨져 있어 보이는 칼럼으로
    { tc: TC, title: '목록 Setting', open: periodList, col: '실행거래처', anchor: '예방작업번호', width: true, listLength: true, reset: true, editable: true },
  ],
  tabs: [
    { tc: TC, title: 'Tab 설정', open: period, key: 'workCalPmRInsPeriodDetail', name: '일정 상세', shown: detailOpens, timeout: 480_000 },
  ],
  // 검색·목록·상세 공통 케이스 (tests/common/screen.spec.ts): 목록(조건) 탭. 카렌다·목록(위치·종류) 탭 확인은 extra 로 덧붙임
  view: {
    ids: {
      defaults: 'AD210_TC_001', lovOrigin: 'AD210_TC_002', lovs: 'AD210_TC_003', searchOne: 'AD210_TC_004', searchCombo: 'AD210_TC_005',
      searchAll: 'AD210_TC_006', searchNone: 'AD210_TC_007', sort: 'AD210_TC_011', total: 'AD210_TC_012', rowDetail: 'AD210_TC_013',
      listDetail: 'AD210_TC_015', listFormat: 'AD210_TC_016', close: 'AD210_TC_019', deleteNone: 'AD210_TC_025', excel: 'AD210_TC_026',
    },
    // [sychoi] 계획, 넓은 기간 (오늘 -60일 ~ +400일)
    open: periodList,
    search: (page, f) => search(page, f),
    dto: P,
    key: '예방작업번호',
    pickRow: (rows) => rows.find((r) => r['일정상태'] === '작업계획') ?? rows[0],
    defaults: { open: period, empty: 'all', values: { filterStartDate: /^\d{4}-\d{2}-\d{2}$/, filterEndDate: /^\d{4}-\d{2}-\d{2}$/ } },
    lovOrigin: { id: 'filterEquipDesc', menu: ['114', '447'], frame: 'tabFrameTAB.assetMstrLoc_assetMstr', header: '설비번호' },
    lovs: [
      ...([['공장명', 'filterPlantDesc'], ['부서', 'filterDeptDesc'], ['작업그룹명', 'filterWkCtrDesc'], ['담당자', 'filterEmpDesc'],
        ['계획거래처', 'filterPlanVendorDesc'], ['설비위치', 'filterEqLocDesc'], ['설비종류', 'filterEqCtgDesc']] as const)
        .map(([l, id]) => [l, `${TAB.year.dto}.${id}`, year] as [string, string, typeof year]),
      ['부서(실행)', 'filterExeDeptDesc', period], ['담당자(실행)', 'filterExeEmpDesc', period], ['법정설비여부', 'filterIsLawEq', period],
      ['관리자(정)', 'filterMainMngName', period], ['관리자(부)', 'filterSubMngName', period], ['설비유형', 'filterEqCtgTypeDesc', period], ['사용부서', 'filterUsageDeptDesc', period],
    ],
    conds: [
      { id: 'filterPmNo', col: '예방작업번호', value: (r) => r['예방작업번호'] },
      { id: 'filterPmDesc', col: '작업명', value: (r) => r['작업명'], words: true },
      { id: 'filterEquipDesc', col: '설비번호', value: (r) => r['설비번호'], lov: '설비번호' },
    ],
    combos: [
      [{ id: 'filterPmDesc', col: '작업명', value: () => SY }, { id: 'filterPmNo', col: '예방작업번호', value: (r) => r['예방작업번호'] }],
      [{ id: 'filterPmNo', col: '예방작업번호', value: (r) => r['예방작업번호'] }, { id: 'filterEquipDesc', col: '설비번호', value: (r) => r['설비번호'], lov: '설비번호' }],
    ],
    clearAll: ['filterPmDesc'],
    deleteConfirm: 'ok',
    none: { id: 'filterPmDesc', value: '존재하지않는작업명_ZZ9' },
    sort: { col: '예방작업번호', numeric: true },
    detail: {
      click: '예방작업번호',
      frame: 'tabFrameTAB.workCalPmRInsPeriodDetail_workCalPmRInsPeriodList',
      title: (r) => new RegExp(`예방작업번호\\s*:\\s*${r['예방작업번호']}`),
      dto: 'workCalPmRInsPeriodDetailDTO',
      pairs: [['일정조정', 'schedDate'], ['예방작업번호', 'pmNo'], ['작업명', 'pmDesc'], ['설비', 'equipDesc'], ['부서(계획)', 'deptDesc'],
        ['담당자(계획)', 'empDesc'], ['일정생성방법', 'scheduleTypeDesc'], ['비고', 'remark']],
      readonly: [],
    },
    format: [
      ...(['초기계획', '일정조정', '작업일자', '완료일자'].map((c) => [c, /^\d{4}-\d{2}-\d{2}$/, 'yyyy-mm-dd'] as [string, RegExp, string])),
      ['일정상태', /^(작업계획|작업발행|작업완료|작업중|결재요청중|임원확인중)$/, '이름으로 표시'],
      ['예상작업시간(분)', /^\d{1,3}(,\d{3})*$/, '숫자(천단위 쉼표)'],
    ],
    extra: {
      defaults: V.defaultsCalendar, lovOrigin: V.lovOriginYear, searchOne: V.searchCalendar, sort: V.sortLoc,
      rowDetail: V.rowDetailDate, listDetail: V.cycleSame, listFormat: V.formatTabs, excel: V.excelCalendar,
    },
    timeout: 300_000,
  },
};
