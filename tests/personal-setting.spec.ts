import { test, expect } from '@playwright/test';

// 로그인은 auth.setup.ts 에서 처리되므로 여기서는 로그인된 상태로 시작합니다.
test('개인설정 - 폰트를 Noto Sans로 변경하고 저장할 수 있다', async ({ page }) => {
  await page.goto('/dream/index.do');

  // 개인설정 > 개인정보
  await page.getByText('개인설정').click();
  await page.getByText('개인정보open').click();

  // 폰트 선택 팝업 열기
  // TODO: 'div:nth-child(30)' 은 화면 순서에 의존해서 깨지기 쉽습니다.
  //       이 항목의 화면 라벨(예: '폰트')을 알려주시면 라벨 기준으로 바꿔 드립니다.
  const fontField = page.locator('div:nth-child(30) > .input_box');
  await fontField.locator('.open_spop').click();

  // 팝업에서 Noto Sans 선택
  await page
    .locator('iframe[name="popupIframe1"]')
    .contentFrame()
    .getByRole('cell', { name: 'Noto Sans' })
    .dblclick();

  // 선택한 값이 입력칸에 반영됐는지 확인
  await expect(fontField.locator('input').first()).toHaveValue(/Noto Sans/);

  // 저장 → 확인
  await page.locator('a').filter({ hasText: '저장' }).click();
  await page.getByText('OK', { exact: true }).click();

  // 확인창이 닫혔는지 확인 (저장 처리 완료)
  await expect(page.getByText('OK', { exact: true })).toBeHidden();
});
