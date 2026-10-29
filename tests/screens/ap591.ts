import { Page } from '@playwright/test';
import { settle, waitFrame, Grid } from '../support/dream';
import { MENU, DTO, P, TAB, F_POINT, F_POINT_VALUE, openTab, searchCond, search, loadAll, clickRow, detailOf, frameReady, listGrid } from '../support/pmexec';
import * as V from '../support/pmexec-view';
import { PM_NO, EQ_NO } from '../support/site';
import { Screen } from './types';

// 작업관리 > 정기점검작업 > 정기점검실행 (AP591)
// 대상 화면: 목록(조건) 탭, 카렌다(월간) 탭, 점검작업 상세, 점검항목 목록, 점검값 상세
// [sychoi] 정기점검주기와 설비 (사이트별, tests/support/site.ts)
const PM = PM_NO;
const EQ = EQ_NO;

const cond = (page: Page) => openTab(page, 'cond');
const cal = (page: Page) => openTab(page, 'cal');
const condList = (page: Page) => searchCond(page, { pmNo: PM });

/** [sychoi] 8007 작업발행 점검작업 상세 */
async function workDetail(page: Page) {
  let f = await condList(page);
  let rows = await loadAll(page, f);
  let i = rows.findIndex((r) => r['설비번호'] === EQ && r['점검작업상태'] === '작업발행');
  // [sychoi] 주기가 없는 사이트(mssql 등)는 아무 작업발행 점검작업이나 엶 (상세·Setting 만 보므로 데이터는 바뀌지 않음)
  if (i < 0) {
    f = await searchCond(page, {});
    rows = await listGrid(f).rows(); // 전체는 많아서 첫 화면만
    i = rows.findIndex((r) => r['점검작업상태'] === '작업발행');
  }
  await clickRow(f, i);
  return detailOf(page, 'cond');
}

/** 점검작업 상세 아래 점검항목 목록 */
async function pointList(page: Page) {
  await workDetail(page);
  const pl = await waitFrame(page, F_POINT);
  await settle(page, 1500);
  return pl;
}

/** 점검항목 첫 행을 눌러 점검값 상세 */
async function pointValue(page: Page) {
  const pl = await pointList(page);
  const g = new Grid(pl, '점검항목');
  await g.clickCell('점검항목', (await g.rows())[0]['점검항목']);
  return frameReady(page, F_POINT_VALUE);
}

/** 상세의 하위 탭(점검항목, 표준작업, 첨부문서)에 첨부문서가 보이는지 */
async function docTabShown(page: Page) {
  const d = await workDetail(page);
  const tabs = await d.evaluate(() => [...document.querySelectorAll<HTMLElement>('a, span, li')]
    .filter((e) => e.offsetWidth > 0 && /^(점검항목|표준작업|첨부문서)\s*\d*$/.test(e.innerText.trim())).map((e) => e.innerText.trim().replace(/\d+$/, '')));
  return tabs.includes('첨부문서');
}

export const AP591: Screen = {
  code: 'AP591',
  name: '정기점검실행',
  menu: MENU,
  fields: [
    { tc: 'AP591_TC_024', title: '검색 Field 설정', open: cond, name: '거래처', anchor: '예방작업번호', reset: true, editable: true, compare: true },
    { tc: 'AP591_TC_024', title: '카렌다(월간) 검색 Field 설정', open: cal, compare: true },
    { tc: 'AP591_TC_024', title: '상세 Field 설정', open: workDetail, name: '비고', id: 'workPmiDetailDTO.remark', anchor: '점검명', timeout: 480_000 },
    { tc: 'AP591_TC_041', title: '점검값 상세 Field 설정', open: pointValue, name: '검사세부내용', anchor: '점검항목', timeout: 480_000 },
  ],
  lists: [
    { tc: 'AP591_TC_025', title: '목록 Setting', open: condList, col: '교대조', id: 'SHIFTTYPEDESC', anchor: '점검일자', width: true, listLength: true, reset: true, editable: true },
    { tc: 'AP591_TC_041', title: '점검항목 목록 Setting', open: pointList, single: true, col: '검사세부내용', width: true, timeout: 480_000 },
  ],
  tabs: [
    { tc: 'AP591_TC_024', title: '상세 Tab 설정', open: workDetail, key: 'maPtDocLibList', name: '첨부문서', shown: docTabShown, timeout: 600_000 },
  ],
  // 검색·목록·상세 공통 케이스 (tests/common/screen.spec.ts): 목록(조건) 탭, [sychoi] 주기의 점검작업. 카렌다(월간) 탭 확인은 extra 로 덧붙임
  view: {
    ids: {
      defaults: 'AP591_TC_001', lovOrigin: 'AP591_TC_003', lovs: 'AP591_TC_004', searchOne: 'AP591_TC_005', searchCombo: 'AP591_TC_006',
      searchAll: 'AP591_TC_007', searchNone: 'AP591_TC_008', sort: 'AP591_TC_011', total: 'AP591_TC_012', listDetail: 'AP591_TC_015',
      readonly: 'AP591_TC_018', close: 'AP591_TC_019', excel: 'AP591_TC_023',
    },
    open: condList,
    search: (page, f) => search(page, f),
    dto: DTO,
    key: '점검명',
    pickRow: (rows) => rows.find((r) => r['설비번호'] === EQ && r['점검작업상태'] === '작업발행') ?? rows.find((r) => r['점검작업상태'] === '작업발행') ?? rows[0],
    defaults: { open: cond, empty: 'all', values: { filterStartDate: /^\d{4}-\d{2}-\d{2}$/, filterEndDate: /^(\d{4}-\d{2}-\d{2})?$/ } },
    lovOrigin: { id: 'filterEquipDesc', menu: ['114', '447'], frame: 'tabFrameTAB.assetMstrLoc_assetMstr', header: '설비번호' },
    lovs: [
      ...([['공장명', 'filterPlantDesc'], ['부서', 'filterDeptDesc'], ['작업그룹명', 'filterWkCtrDesc'], ['거래처', 'filterVendorDesc'],
        ['설비위치', 'filterEqLocDesc'], ['설비종류', 'filterEqCtgDesc']] as const).map(([l, id]) => [`카렌다(월간) ${l}`, id, cal] as [string, string, typeof cal]),
      ['담당자', 'filterManagerDesc', cond], ['사용부서', 'filterUsageDeptDesc', cond], ['점검작업상태', 'filterPmSchedStatusDesc', cond],
      ['법정설비여부', 'filterIsLawEq', cond], ['관리자(정)', 'filterMainMngName', cond], ['관리자(부)', 'filterSubMngName', cond],
    ],
    conds: [
      { id: 'filterEquipDesc', col: '설비번호', value: (r) => r['설비번호'], lov: '설비번호' },
      { id: 'filterPmSchedStatusDesc', col: '점검작업상태', value: () => '작업완료', lov: '' },
    ],
    combos: [
      [{ id: 'filterPmNo', col: '예방작업번호', value: () => PM, preset: true }, { id: 'filterEquipDesc', col: '설비번호', value: (r) => r['설비번호'], lov: '설비번호' }],
      [{ id: 'filterPmNo', col: '예방작업번호', value: () => PM, preset: true }, { id: 'filterPmSchedStatusDesc', col: '점검작업상태', value: (r) => r['점검작업상태'], lov: '' }],
    ],
    clearAll: ['filterPmNo'],
    none: { id: 'filterPmNo', value: '99999999' },
    sort: { col: '점검일자' },
    detail: {
      click: '점검명',
      frame: TAB.cond.detail,
      title: () => /정기점검실행\s*:\s*\d+/,
      dto: P,
      pairs: [
        ['점검일자', 'wkorDate'], ['점검명', 'pmiDesc'], ['설비명', 'equipDesc'], ['부서', 'deptDesc'], ['담당자', 'empDesc'],
        ['점검작업상태', 'pmschedStatusDesc'], ['점검시작일자', 'startDate'], ['점검시작시간', 'startTime'], ['점검종료일자', 'endDate'],
        ['점검종료시간', 'endTime'], ['점검시간[분]', 'workTime'], ['설비위치', 'eqLocDesc'], ['작업형태', 'pmTypeDesc'], ['비고', 'remark'],
      ],
      readonly: ['pminslistId', 'pmschedStatusDesc', 'woTypeDesc', 'pmTypeDesc', 'equipDesc', 'eqLocDesc', 'workTime'],
    },
    extra: {
      defaults: V.defaultsCalendar, lovOrigin: V.lovOriginCalendar, lovs: V.groupHidden, searchOne: V.searchCalendar, sort: V.sortMore, excel: V.excelCalendar,
    },
    timeout: 300_000,
  },
};
