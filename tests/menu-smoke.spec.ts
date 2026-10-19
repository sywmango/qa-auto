import { test, expect, Page } from '@playwright/test';

// 메뉴 순회 스모크 테스트
// 메뉴를 하나씩 열어서 첫 화면이 에러 없이 뜨는지만 확인합니다.
// 새 메뉴를 추가하려면 아래 목록에 한 줄만 추가하면 됩니다.
//   top / topId : 왼쪽 대메뉴 이름과 메뉴 번호
//   sub / subId : (3단 메뉴만) 중간 메뉴 이름과 번호. 2단 메뉴는 생략
//   menu / menuId : 실제로 여는 메뉴 이름과 번호
//   check  : 화면이 열리면 보여야 하는 글자들 (탭 제목, 목록 열 이름 등)
// 같은 이름의 메뉴가 여러 곳에 있어서(예: 대메뉴 "요청관리"와 보고서관리 > "요청관리")
// 이름 대신 번호로 클릭합니다. 번호는 녹화 코드의 [id="447"] 숫자입니다.
type MenuDef = {
  top: string; topId: string;
  sub?: string; subId?: string;
  menu: string; menuId: string;
  check: string[];
};

const menus: MenuDef[] = [
  // 설비도입 / 설비자산
  { top: '설비도입', topId: '440', menu: '도입목록', menuId: '387', check: ['도입계획#', '도입명'] },
  { top: '설비자산', topId: '114', menu: '설비', menuId: '447', check: ['목록(위치)', '순번'] },
  { top: '설비자산', topId: '114', menu: '계측기', menuId: '448', check: ['계측기번호', '계측기명'] },
  { top: '설비자산', topId: '114', menu: '설비자산(전체)', menuId: '951', check: ['설비유형', '설비번호'] },
  // 요청관리
  { top: '요청관리', topId: '279', menu: '수리요청', menuId: '394', check: ['요청#', '요청명'] },
  // 작업관리 (3단 메뉴)
  { top: '작업관리', topId: '132', sub: '수리작업', subId: '607', menu: '수리요청접수', menuId: '281', check: ['요청#', '처리담당자'] },
  { top: '작업관리', topId: '132', sub: '수리작업', subId: '607', menu: '수리작업실행', menuId: '170', check: ['W/O #', 'WO상태'] },
  { top: '작업관리', topId: '132', sub: '정기점검작업', subId: '372', menu: '정기점검주기', menuId: '454', check: ['예방작업번호', '일정생성방법'] },
  { top: '작업관리', topId: '132', sub: '정기점검작업', subId: '372', menu: '정기점검계획', menuId: '358', check: ['예방작업번호', '일정상태'] },
  { top: '작업관리', topId: '132', sub: '정기점검작업', subId: '372', menu: '정기점검실행', menuId: '944', check: ['점검명', '점검작업상태'] },
  { top: '작업관리', topId: '132', sub: '일상점검작업', subId: '2897', menu: '일상점검실행', menuId: '2888', check: ['초기계획', '일정조정'] },
  { top: '작업관리', topId: '132', sub: '정기수리작업', subId: '1179', menu: '정기수리계획', menuId: '916', check: ['예방작업번호', '작업완료'] },
  // 부품관리
  { top: '부품관리', topId: '117', menu: '부품목록', menuId: '129', check: ['부품번호', '부품명/규격'] },
  { top: '부품관리', topId: '117', menu: '부품구매신청', menuId: '197', check: ['요청번호', '작성상태'] },
  { top: '부품관리', topId: '117', menu: '부품구매입고', menuId: '135', check: ['입고번호', '입고상태'] },
  { top: '부품관리', topId: '117', menu: '부품출고', menuId: '212', check: ['출고번호', '출고상태'] },
  // 일일업무
  { top: '일일업무', topId: '294', menu: '일일업무일지', menuId: '282', check: ['일정조정 일자', '작성자'] },
  // 조직관리
  { top: '조직관리', topId: '121', menu: '사원', menuId: '93', check: ['사원번호', '사원명'] },
  { top: '조직관리', topId: '121', menu: '부서', menuId: '92', check: ['부서코드', '조회순서'] },
  { top: '조직관리', topId: '121', menu: '작업그룹', menuId: '259', check: ['작업그룹#', '상위 작업그룹'] },
  { top: '조직관리', topId: '121', menu: '거래처', menuId: '127', check: ['거래처#', '사업자번호'] },
  // 공유자료 / 개인설정
  { top: '공유자료', topId: '291', menu: '공지사항', menuId: '622', check: ['공지#', '공지기한'] },
  { top: '개인설정', topId: '292', menu: '결재대기', menuId: '203', check: ['결재자구분', '요청타입'] },
  { top: '개인설정', topId: '292', menu: '결재이력', menuId: '611', check: ['결재일자', '결재자 진행상태'] },
];

// 화면 내용이 iframe 안에 열릴 수도 있어서, 모든 프레임에서 글자를 찾습니다.
// 숨은 그리드에 같은 글자가 있을 수 있어서, 보이는 것만 골라서 확인합니다.
async function isTextVisibleAnywhere(page: Page, text: string) {
  for (const frame of page.frames()) {
    const visible = await frame
      .getByText(text, { exact: true })
      .filter({ visible: true })
      .first()
      .isVisible()
      .catch(() => false);
    if (visible) return true;
  }
  return false;
}

for (const m of menus) {
  const title = [m.top, m.sub, m.menu].filter(Boolean).join(' > ');
  test(`메뉴 열기: ${title}`, async ({ page }) => {
    // 화면 스크립트 에러(빨간 콘솔 에러 중 페이지가 멈추는 종류)를 모아 둡니다.
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // 1) 메인 화면에서 시작
    await page.goto('/dream/index.do');
    await page.waitForLoadState('networkidle');

    // 2) 대메뉴 → (중간 메뉴) → 메뉴 클릭 (같은 화면 안에 열림)
    await page.locator(`[id="${m.topId}"]`).click();
    if (m.subId) await page.locator(`[id="${m.subId}"]`).click();
    await page.locator(`[id="${m.menuId}"]`).click();

    // 3) 기대 결과: 확인할 글자들이 화면에 보여야 함
    for (const text of m.check) {
      await expect
        .poll(() => isTextVisibleAnywhere(page, text), {
          message: `"${text}" 글자가 화면에 보이는지 확인`,
          timeout: 15_000,
        })
        .toBe(true);
    }

    // 4) 기대 결과: 화면 스크립트 에러가 없어야 함
    expect(errors, '화면 스크립트 에러가 없는지 확인').toEqual([]);
  });
}
