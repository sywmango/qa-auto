import { test, expect, Page } from '@playwright/test';
import { allMenus } from './menu-all.data';
import { iconsShown, topTabs } from './support/header';

// 전체 메뉴 점검 테스트
// menu-all.data.ts의 모든 메뉴를 하나씩 열어서 아래를 확인합니다.
//   1) 화면 위쪽에 메뉴 이름(화면 제목)이 보이는지
//   2) 목록 화면이면 열 이름이 보이는지
//   3) 화면 스크립트 에러, 서버 에러(500번대), 경고창이 없는지
//   4) 화면 상단 공통 아이콘(즐겨찾기·업무그룹·편집모드, 위쪽 탭이 있으면 Tab설정)이 보이는지 (동작은 tests/common/header.spec.ts 에서 대표 메뉴로)
// 메뉴가 많아서 10분 이상 걸립니다. 빠른 확인은 menu-smoke를 쓰세요.
//   실행: .\run-tests.ps1 menu-all

// 상단 아이콘 알려진 오류 (사용자 확인 2026-10-22). 메뉴 번호 → 내용. 결과에 '오류' 로 남기고 테스트는 실패로 둡니다.
const HEADER_ISSUES: Record<string, string> = {
  '1342': '오류: 업무그룹 아이콘 없음. 업무그룹 설정 메뉴에서 이 화면을 추가해도 업무그룹 화면이 빈칸으로 나옴 (사용자 확인)',
  '1362': '오류: 업무그룹 아이콘 없음. 업무그룹 설정 메뉴에서 이 화면을 추가해도 업무그룹 화면이 빈칸으로 나옴 (사용자 확인)',
  '97': '오류: 위쪽 탭이 없는 화면인데 Tab설정 아이콘이 보임',
};

// 왼쪽 메뉴(#sidebar)가 아닌 곳에 메뉴 이름이 보이는지 확인합니다.
async function isScreenTitleVisible(page: Page, name: string) {
  return page
    .evaluate(
      (name) =>
        [...document.querySelectorAll('body *')].some(
          (e) =>
            !e.closest('#sidebar') &&
            e.children.length === 0 &&
            ((e as HTMLElement).innerText || '').trim() === name &&
            (e as HTMLElement).offsetWidth > 0,
        ),
      name,
    )
    .catch(() => false);
}

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

for (const m of allMenus) {
  const title = [m.top, m.sub, m.menu].filter(Boolean).join(' > ');
  test(`전체 메뉴: ${title}`, async ({ page }) => {
    // 문제 신호를 모아 둡니다.
    const scriptErrors: string[] = [];
    const serverErrors: string[] = [];
    const dialogs: string[] = [];
    page.on('pageerror', (e) => scriptErrors.push(e.message));
    page.on('response', (res) => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`);
    });
    // 경고창은 기록만 하고 '취소'로 닫습니다 (아무것도 실행되지 않게).
    page.on('dialog', async (d) => {
      dialogs.push(d.message());
      await d.dismiss().catch(() => {});
    });

    // 1) 메인 화면에서 시작
    await page.goto('/dream/index.do');
    await page.waitForLoadState('networkidle');

    // 2) 대메뉴 → (중간 메뉴) → 메뉴 클릭 (같은 화면 안에 열림)
    await page.locator(`[id="${m.topId}"]`).click();
    if (m.subId) await page.locator(`[id="${m.subId}"]`).click();
    await page.locator(`[id="${m.menuId}"]`).click();

    // 3) 기대 결과: 화면 제목(메뉴 이름)이 보여야 함
    await expect
      .poll(() => isScreenTitleVisible(page, m.menu), {
        message: `화면 제목 "${m.menu}"이 보이는지 확인`,
        timeout: 15_000,
      })
      .toBe(true);

    // 4) 기대 결과: 목록 화면이면 열 이름이 보여야 함
    for (const text of m.columns) {
      await expect
        .poll(() => isTextVisibleAnywhere(page, text), {
          message: `열 이름 "${text}"이 보이는지 확인`,
          timeout: 15_000,
        })
        .toBe(true);
    }

    // 화면이 다 뜰 때까지 잠깐 기다린 뒤 에러를 확인합니다.
    await page.waitForLoadState('networkidle').catch(() => {});

    // 5) 기대 결과: 상단 공통 아이콘이 보여야 함 (즐겨찾기·업무그룹·편집모드는 항상, Tab설정은 위쪽 탭이 있는 화면만)
    const icons = await iconsShown(page);
    const tabs = await topTabs(page);
    const expected = { bookmark: true, workgroup: true, tabSetting: tabs.length > 0, edit: true };
    const diff = Object.keys(expected).filter((k) => icons[k] !== expected[k as keyof typeof expected]);
    test.info().annotations.push({ type: '상단', description: `위쪽 탭 ${tabs.length}개, 아이콘 ${Object.entries(icons).filter(([, v]) => v).map(([k]) => k).join(',')}` });
    if (diff.length && HEADER_ISSUES[m.menuId]) test.info().annotations.push({ type: '실제결과', description: HEADER_ISSUES[m.menuId] });
    expect.soft(diff, `상단 공통 아이콘 (Tab설정은 위쪽 탭이 있을 때만)${HEADER_ISSUES[m.menuId] ? ` — ${HEADER_ISSUES[m.menuId]}` : ''}`).toEqual([]);

    // 6) 기대 결과: 에러와 경고창이 없어야 함
    expect(scriptErrors, '화면 스크립트 에러가 없는지 확인').toEqual([]);
    expect(serverErrors, '서버 에러(500번대)가 없는지 확인').toEqual([]);
    expect(dialogs, '경고창이 뜨지 않는지 확인').toEqual([]);
  });
}
