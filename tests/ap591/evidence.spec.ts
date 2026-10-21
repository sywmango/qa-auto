import { test } from '@playwright/test';
import fs from 'fs';
import { clickButton, settle } from '../support/dream';
import { put, dateAfter } from '../support/form';
import { openSetting } from '../support/setting';
import { P, openTab } from '../support/pmexec';
import { okAndMessage, myWorks, openWork } from '../support/pmexec-data';

// 정기점검실행 (AP591) 오류·개선 화면 캡처 (저장하지 않음, 확정이 막히는 경우만 누름)
// 캡처 파일: playwright/.data/evidence/ap591-*.png (결과 보고서에 들어감)

test.setTimeout(300_000);
const DIR = 'playwright/.data/evidence';
fs.mkdirSync(DIR, { recursive: true });

test.describe('AP591 오류 캡처', () => {
  test('TC_024 카렌다(월간) 검색 Setting 은 담당자·작업명 Y 인데 화면에 없음', async ({ page }) => {
    const f = await openTab(page, 'cal');
    await page.screenshot({ path: `${DIR}/ap591-TC_024-screen.png` });
    await openSetting(page, f, 'search');
    await settle(page, 1000);
    await page.screenshot({ path: `${DIR}/ap591-TC_024-setting.png` });
  });

  test('TC_027 점검명을 비우고 확정 → 안내 없음', async ({ page }) => {
    // 어제 날짜 작업발행 건 (점검작업 테스트에서 만든 것)
    const day = dateAfter(-1);
    const { mine } = await myWorks(page);
    test.skip(!mine.some((r) => r['점검일자'] === day && r['점검작업상태'] === '작업발행'), `${day} 작업발행 건 없음`);
    const { d } = await openWork(page, day);
    await put(d.locator(`[id="${P}.pmiDesc"]`), '');
    await clickButton(d, '확정');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${DIR}/ap591-TC_027.png` });
    await okAndMessage(page);
  });

  test('EC_002 점검값 없이 확정 → 확인 후 안내 없이 작업발행 그대로', async ({ page }) => {
    const day = dateAfter(-1);
    const { mine } = await myWorks(page);
    test.skip(!mine.some((r) => r['점검일자'] === day && r['점검작업상태'] === '작업발행'), `${day} 작업발행 건 없음`);
    const { d } = await openWork(page, day);
    await clickButton(d, '확정');
    const msg = await okAndMessage(page);
    await page.screenshot({ path: `${DIR}/ap591-EC_002.png` });
    const st = (await myWorks(page)).mine.filter((r) => r['점검일자'] === day).map((r) => r['점검작업상태']);
    test.info().annotations.push({ type: '실제결과', description: `확정: ${msg} → ${day} 상태 ${st.join(',')}` });
  });
});
