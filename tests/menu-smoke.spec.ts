import { test, expect, Page } from '@playwright/test';

// 메뉴 순회 스모크 테스트
// 메뉴를 하나씩 열어서 첫 화면이 에러 없이 뜨는지만 확인합니다.
// 새 메뉴를 추가하려면 아래 목록에 한 줄만 추가하면 됩니다.
//   top    : 위쪽 대메뉴 이름
//   menu   : 소메뉴 이름 (테스트 제목에 표시용)
//   menuId : 소메뉴의 메뉴 번호. 같은 이름의 메뉴(예: 묶음 "설비"와 실제 메뉴 "설비")가
//            있어서 이름 대신 번호로 클릭합니다. 녹화 코드의 [id="447"] 숫자입니다.
//   check  : 화면이 열리면 보여야 하는 글자들 (탭 제목, 목록 열 이름 등)
const menus = [
  { top: '설비자산', menu: '설비', menuId: '447', check: ['목록(위치)', '순번'] },
];

// 화면 내용이 iframe 안에 열릴 수도 있어서, 모든 프레임에서 글자를 찾습니다.
async function isTextVisibleAnywhere(page: Page, text: string) {
  for (const frame of page.frames()) {
    const visible = await frame
      .getByText(text, { exact: true })
      .first()
      .isVisible()
      .catch(() => false);
    if (visible) return true;
  }
  return false;
}

for (const m of menus) {
  test(`메뉴 열기: ${m.top} > ${m.menu}`, async ({ page }) => {
    // 화면 스크립트 에러(빨간 콘솔 에러 중 페이지가 멈추는 종류)를 모아 둡니다.
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // 1) 메인 화면에서 시작
    await page.goto('/dream/index.do');
    await page.waitForLoadState('networkidle');

    // 2) 대메뉴 → 소메뉴 클릭 (같은 화면 안에 열림)
    await page.getByText(m.top, { exact: true }).click();
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
