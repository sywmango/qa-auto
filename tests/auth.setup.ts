import { test as setup, expect } from '@playwright/test';

// QA_AUTH 를 주면 그 파일에 저장 (작업마다 로그인을 따로 쓰고 싶을 때)
const authFile = process.env.QA_AUTH || 'playwright/.auth/user.json';

// 테스트 시작 전에 한 번 로그인하고, 로그인 상태를 파일로 저장합니다.
// 이후 테스트들은 이 파일을 불러와서 로그인된 상태로 시작합니다.
setup('로그인', async ({ page }) => {
  await page.goto('/dream/index.do');

  await page.getByRole('textbox', { name: 'User No' }).fill(process.env.QA_USER_ID!);
  await page.getByRole('textbox', { name: 'Password' }).fill(process.env.QA_USER_PW!);
  await page.getByRole('button', { name: 'Login' }).click();

  // 접속할 시스템 선택 팝업 (QA_COMPANY 가 비어 있으면 고르는 화면이 없는 사이트 → 건너뜀. 예: mssql)
  if (process.env.QA_COMPANY) {
    await page
      .locator('iframe[name="popupIframe1"]')
      .contentFrame()
      .getByRole('cell', { name: process.env.QA_COMPANY })
      .dblclick();
  }

  // 메인 화면이 떴는지 확인 (메뉴가 보이면 로그인 성공)
  await expect(page.getByText('개인설정')).toBeVisible();

  await page.context().storageState({ path: authFile });
});
