import { test, Page, Frame } from '@playwright/test';
import { openMenu, waitFrame, clickButton, clickTab, settle, Grid, lovContentFrame, pickInLov } from './support/dream';
import { put, dateAfter, saveForm, popupMessage, chooseInLov } from './support/form';
import { F_COND, L, D, openPm, detailFrame, rowsOf, deleteRowWhere } from './support/pmi';

// 보고서용 오류 증적 캡처 (테스트 데이터만 사용, 바꾼 값은 되돌림)
const EV = 'playwright/.data/evidence';
const shot = (page: Page, name: string) => page.screenshot({ path: `${EV}/err-${name}.png` });

/** 정기점검계획 목록(조건)에서 이 주기의 계획 (기간 지정) */
async function planList(page: Page, pmNo: string, from: string, to: string) {
  await openMenu(page, ['132', '372', '358']);
  await clickTab(page, '목록(조건)');
  const f = page.frames().find((x) => /workCalPmRInsPeriodList_/.test(x.name()))!;
  await put(f.locator('[id$="filterStartDate"]').first(), from);
  await put(f.locator('[id$="filterEndDate"]').first(), to);
  await f.locator('[id$="filterPmNo"]').first().fill(pmNo);
  await page.keyboard.press('Escape');
  await f.locator('a.b_search:visible').first().click({ force: true });
  await settle(page, 2500);
  return f;
}

/** 프레임 안 요소가 보이도록 스크롤 */
async function scrollTo(frame: Frame, text: string) {
  await frame.getByText(text).first().scrollIntoViewIfNeeded().catch(() => {});
}

test.describe('오류 증적', () => {
  test.setTimeout(600_000);

  test('TC_004 Total 불일치 (8007)', async ({ page }) => {
    await openMenu(page, ['132', '372', '454']);
    await clickTab(page, '목록(조건)');
    const f = await waitFrame(page, F_COND);
    await f.locator('[id="maPmMstrCommonDTO.filterIsActiveDesc"]').fill('');
    await f.locator('[id="maPmMstrCommonDTO.pmNo"]').fill('8007');
    await f.locator('a.b_search:visible').first().click();
    await settle(page, 2500);
    await shot(page, 'TC_004');
  });

  test('EC_001·EC_003 재조정 Y 완료 후 계획 (8060, 8061)', async ({ page }) => {
    await planList(page, '8060', '2026-10-01', '2026-12-31');
    await shot(page, 'EC_001');
    await planList(page, '8061', '2026-10-01', '2026-12-31');
    await shot(page, 'EC_003');
  });

  test('EC_010 2월 이후 말일로 바뀜 (8007)', async ({ page }) => {
    await planList(page, '8007', '2027-01-01', '2027-09-30');
    await shot(page, 'EC_010');
  });

  test('EC_006 2일 주기 일요일 누락 (8017 다시 생성)', async ({ page }) => {
    // 8017 을 2 일 주기로 바꿔 일정생성 → 캡처 → 원래 값(1 주 주기)으로 되돌림
    let d = await openPm(page, '8017');
    const before = { cycle: await d.locator('[id="maPmMstrDetailDTO.cycle"]').inputValue(), period: await d.locator('[id="maPmMstrDetailDTO.periodTypeDesc"]').inputValue() };
    await chooseInLov(page, d, 'maPmMstrDetailDTO.periodTypeDesc', '일 주기');
    d = await waitFrame(page, /workPmListRInsDetail_workPmListInsList$/);
    await put(d.locator('[id="maPmMstrDetailDTO.cycle"]'), '2');
    await saveForm(page, d);
    // 설비 최초작업예정일 2026-11-16 (월)
    await openPm(page, '8017');
    await new Grid(await waitFrame(page, L.eq), '최초작업예정일').clickCell('설비번호', '100302AG13');
    await settle(page, 1500);
    const ed = await detailFrame(page, D.eq);
    await put(ed.locator('[id="workPmListEquipDetailDTO.initWrkDate"]'), '2026-11-16');
    await saveForm(page, ed);
    d = await openPm(page, '8017');
    await clickButton(d, '일정생성');
    await settle(page, 800);
    const ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
    if (await ok.isVisible().catch(() => false)) await ok.click();
    await settle(page, 3000);
    await popupMessage(page);
    await planList(page, '8017', '2026-11-14', '2026-12-10');
    await shot(page, 'EC_006');
    // 되돌림
    d = await openPm(page, '8017');
    await chooseInLov(page, d, 'maPmMstrDetailDTO.periodTypeDesc', before.period);
    d = await waitFrame(page, /workPmListRInsDetail_workPmListInsList$/);
    await put(d.locator('[id="maPmMstrDetailDTO.cycle"]'), before.cycle);
    await saveForm(page, d);
  });

  test('EC_011 주기 0 저장됨 (8013)', async ({ page }) => {
    let d = await openPm(page, '8013');
    const before = await d.locator('[id="maPmMstrDetailDTO.cycle"]').inputValue();
    await put(d.locator('[id="maPmMstrDetailDTO.cycle"]'), '0');
    await saveForm(page, d);
    d = await openPm(page, '8013');
    await scrollTo(d, '주기');
    await shot(page, 'EC_011');
    await put(d.locator('[id="maPmMstrDetailDTO.cycle"]'), before || '1');
    await saveForm(page, d);
  });

  test('EC_014 같은 설비 중복 추가 (8007)', async ({ page }) => {
    await openPm(page, '8007');
    await clickButton(await waitFrame(page, L.eq), '생성');
    await settle(page, 1500);
    await pickInLov(page, await lovContentFrame(page), '100302AG13', '설비번호');
    const ed = await detailFrame(page, D.eq);
    const dup = dateAfter(25);
    await put(ed.locator('[id="workPmListEquipDetailDTO.initWrkDate"]'), dup);
    await put(ed.locator('[id="workPmListEquipDetailDTO.remark"]'), '중복 추가 확인 (증적 후 삭제)');
    await saveForm(page, ed);
    await openPm(page, '8007');
    const eq = await waitFrame(page, L.eq);
    await eq.locator('div.gridbox:visible').first().scrollIntoViewIfNeeded();
    await shot(page, 'EC_014');
    // 테스트가 방금 넣은 중복 행만 삭제
    const rows = await rowsOf(page, 'eq', '최초작업예정일');
    if (rows.filter((r) => r['설비번호'] === '100302AG13').length > 1)
      await deleteRowWhere(page, 'eq', '최초작업예정일', (r) => r['설비번호'] === '100302AG13' && r['최초작업예정일'] === dup, `100302AG13 ${dup}`);
  });
});
