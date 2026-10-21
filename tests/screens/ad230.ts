import { Page } from '@playwright/test';
import { openMenu, waitFrame, clickTab, settle, Grid } from '../support/dream';
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
};
