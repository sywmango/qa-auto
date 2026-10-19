import { test, expect } from '@playwright/test';

// 로그인은 auth.setup.ts 에서 처리되므로 여기서는 로그인된 상태로 시작합니다.
test('개인설정 - 화면글자폰트를 Noto Sans로 변경하고 저장할 수 있다', async ({ page }) => {
  await page.goto('/dream/index.do');

  // 개인설정 > 개인정보
  await page.getByText('개인설정').click();
  await page.getByText('개인정보open').click();

  // '화면글자폰트' 라고 적힌 칸을 찾습니다. (화면 순서가 바뀌어도 깨지지 않음)
  const fontField = page.locator('div:has(> :text-is("화면글자폰트")) > .input_box');
  await fontField.locator('.open_spop').click();

  // 시스템코드 팝업에서 Noto Sans 선택
  await page
    .locator('iframe[name="popupIframe1"]')
    .contentFrame()
    .getByRole('cell', { name: 'Noto Sans' })
    .dblclick();

  // 선택한 값이 칸에 들어갔는지 확인
  await expect(fontField.locator('input').first()).toHaveValue(/Noto ?Sans/);

  // 저장 → 확인
  await page.locator('a').filter({ hasText: '저장' }).click();
  await page.getByText('OK', { exact: true }).click();

  // 확인창이 닫혔는지 확인 (저장 처리 완료)
  await expect(page.getByText('OK', { exact: true })).toBeHidden();
});
