import { Page } from '@playwright/test';
import { settle } from '../support/dream';
import { MENU, openTab, searchPeriod, loadAll, clickRow, listGrid } from '../support/pmplan';
import { Screen } from './types';

// 작업관리 > 정기점검작업 > 정기점검계획 (AD210). 대상 화면: 목록(조건) 탭
const TC = 'AD210_TC_027';
const period = (page: Page) => openTab(page, 'period');
const periodList = (page: Page) => searchPeriod(page, { pmDesc: '[sychoi]' });

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
};
