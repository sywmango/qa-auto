import { Page } from '@playwright/test';
import { settle } from '../support/dream';
import { MENU, openTab, searchPeriod, loadAll, clickRow } from '../support/pmplan';
import { Screen } from './types';

// 작업관리 > 정기점검작업 > 정기점검계획 (AD210). 대상 화면: 목록(조건) 탭
const TC = 'AD210_TC_027';
const period = (page: Page) => openTab(page, 'period');
const periodList = (page: Page) => searchPeriod(page, { pmDesc: '[sychoi]' });

/** [sychoi] 작업계획 행을 눌러 일정 상세가 열리는지 */
async function detailOpens(page: Page) {
  const f = await periodList(page);
  const rows = await loadAll(page, f);
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
    { tc: TC, title: '검색 Field 설정', open: period, name: '계획거래처', anchor: '예방작업번호', reset: true, editable: true, compare: true },
  ],
  lists: [
    // 측정시간·비고 칼럼은 기본 Setting 에서 숨겨져 있어 보이는 칼럼으로
    { tc: TC, title: '목록 Setting', open: periodList, col: '실행거래처', anchor: '예방작업번호', width: true, listLength: true, reset: true, editable: true },
  ],
  tabs: [
    { tc: TC, title: 'Tab 설정', open: period, key: 'workCalPmRInsPeriodDetail', name: '일정 상세', shown: detailOpens },
  ],
};
