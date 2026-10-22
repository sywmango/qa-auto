import { Page } from '@playwright/test';
import { settle, waitFrame, Grid } from '../support/dream';
import { MENU, F_POINT, F_POINT_VALUE, openTab, searchCond, loadAll, clickRow, detailOf, frameReady } from '../support/pmexec';
import { Screen } from './types';

// 작업관리 > 정기점검작업 > 정기점검실행 (AP591)
// 대상 화면: 목록(조건) 탭, 카렌다(월간) 탭, 점검작업 상세, 점검항목 목록, 점검값 상세
const PM = '8007';
const EQ = '100302AG13';

const cond = (page: Page) => openTab(page, 'cond');
const cal = (page: Page) => openTab(page, 'cal');
const condList = (page: Page) => searchCond(page, { pmNo: PM });

/** [sychoi] 8007 작업발행 점검작업 상세 */
async function workDetail(page: Page) {
  const f = await condList(page);
  const rows = await loadAll(page, f);
  await clickRow(f, rows.findIndex((r) => r['설비번호'] === EQ && r['점검작업상태'] === '작업발행'));
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
    { tc: 'AP591_TC_024', title: '상세 Field 설정', open: workDetail, name: '비고', id: 'workPmiDetailDTO.remark', anchor: '점검명' },
    { tc: 'AP591_TC_041', title: '점검값 상세 Field 설정', open: pointValue, name: '검사세부내용', anchor: '점검항목', timeout: 480_000 },
  ],
  lists: [
    { tc: 'AP591_TC_025', title: '목록 Setting', open: condList, col: '교대조', id: 'SHIFTTYPEDESC', anchor: '점검일자', width: true, listLength: true, reset: true, editable: true },
    { tc: 'AP591_TC_041', title: '점검항목 목록 Setting', open: pointList, single: true, col: '검사세부내용', width: true, timeout: 480_000 },
  ],
  tabs: [
    { tc: 'AP591_TC_024', title: '상세 Tab 설정', open: workDetail, key: 'maPtDocLibList', name: '첨부문서', shown: docTabShown, timeout: 600_000 },
  ],
  header: { menuId: '944', open: cond, pageTab: '목록(조건)' },
};
