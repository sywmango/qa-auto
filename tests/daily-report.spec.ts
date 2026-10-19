import { test, expect, Page, Locator } from '@playwright/test';

// 목록에서 행의 체크박스를 선택하고, 화면에 보이는 삭제 버튼으로 삭제합니다.
async function deleteRow(page: Page, row: Locator) {
  await row.getByRole('img').click(); // 행의 체크박스
  await page.locator('a:visible').filter({ hasText: /^\s*삭제\s*$/ }).click(); // 화면에 보이는 삭제 버튼
  await page.getByText('OK', { exact: true }).click(); // 확인창 OK 버튼
  await expect(row).toHaveCount(0); // 목록에서 사라졌는지 확인
}

// 로그인은 auth.setup.ts 에서 처리되므로 여기서는 로그인된 상태로 시작합니다.
// 일일업무일지는 같은 날짜 + 같은 작성자로 하나만 생성할 수 있으므로,
// 테스트 시작 전에 "내 아이디로" 자동테스트가 만든 일지만 삭제하고 새로 생성합니다.
// (다른 팀원의 자동테스트 일지는 건드리지 않음)
test('일일업무일지 - 생성한 일지가 메뉴 재접근 후 목록에 보인다', async ({ page }) => {
  // 제목에 실행한 사람의 아이디(.env 의 QA_USER_ID)와 시각을 붙입니다.
  // 예: "10월 15일 일일업무일지 [자동테스트 D221005 132305]"
  const userId = process.env.QA_USER_ID!;
  const myTag = `[자동테스트 ${userId} `;
  const now = new Date();
  const hhmmss = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const title = `${now.getMonth() + 1}월 ${now.getDate()}일 일일업무일지 ${myTag}${hhmmss}]`;

  // 1) 일일업무 > 일일업무일지 화면 열기
  await page.goto('/dream/maWoDayRptList.do?menuId=282');
  await page.waitForLoadState('networkidle');

  // 2) 사전 정리: 이전 실행이 중간에 실패해서 남은 "내" 자동테스트 일지가 있으면 삭제
  const leftovers = page.getByRole('row', { name: myTag });
  while ((await leftovers.count()) > 0) {
    await deleteRow(page, leftovers.first());
  }

  // 3) 생성 버튼
  await page.locator('a').filter({ hasText: '생성' }).click();

  // 4) 상세 입력 화면 (탭 안의 iframe)
  const detail = page
    .locator('iframe[name="tabFrameTAB.maWoDayRptDetail_maWoDayRptList"]')
    .contentFrame();

  await detail.locator('input[name="maWoDayRptDetailDTO.workTime"]').fill('56');
  await detail.locator('input[name="maWoDayRptDetailDTO.title"]').fill(title);
  await detail.locator('textarea[name="maWoDayRptDetailDTO.contents"]').fill('playwright 회의');

  // 5) 저장 버튼 → 확인창 OK 버튼
  await detail.locator('a').filter({ hasText: '저장' }).click();
  await page.getByText('OK', { exact: true }).click();
  await expect(page.getByText('OK', { exact: true })).toBeHidden();

  // 6) 왼쪽 메뉴에서 일일업무일지 다시 열기
  await page.getByText('일일업무일지open').click();

  // 7) 기대 결과: 방금 생성한 제목의 행이 목록에 보여야 함
  const createdRow = page.getByRole('row', { name: title });
  await expect(createdRow).toBeVisible();

  // 생성한 일지는 남겨 둡니다. 다음 실행 때 2) 사전 정리 단계에서 삭제됩니다.
});
