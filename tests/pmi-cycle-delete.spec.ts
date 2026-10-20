import { test, expect, Page } from '@playwright/test';
import { openMenu, waitFrame, clickButton, clickTab, fieldValue, settle, Grid } from './support/dream';
import { fillAllFields, saveForm, popupMessage, put, dateAfter } from './support/form';
import { F_COND, F_DETAIL, openPm, addEquip, uniqueName, PM_VALUES, remember } from './support/pmi';

// 정기점검주기 (AD230) 삭제 케이스 — 작업이 발행되기 전 상태의 주기만 삭제 (사용자 허락 2026-10-20)
// 삭제 대상은 이 테스트가 방금 만든 주기뿐. 다른 데이터는 삭제하지 않음.

const EQUIP_1 = '100302AG13';
const note = (t: string) => test.info().annotations.push({ type: '실제결과', description: t });
// 이전 실행에서 만들고 아직 지우지 못한 주기는 다시 만들지 않고 씀
import fs from 'fs';
const STATE = 'playwright/.data/pmi-delete-state.json';
const st: Record<string, string> = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
const keep = (k: string, v: string) => { st[k] = v; fs.writeFileSync(STATE, JSON.stringify(st)); };

async function createPm(page: Page, label: string) {
  await openMenu(page, ['132', '372', '454']);
  await clickTab(page, '목록(조건)');
  await clickButton(await waitFrame(page, F_COND), '생성');
  const d = await waitFrame(page, F_DETAIL);
  await settle(page, 1500);
  await fillAllFields(page, d, { ...PM_VALUES, 'maPmMstrDetailDTO.description': `${uniqueName()} (${label})` });
  await saveForm(page, d);
  const pmNo = await fieldValue(d, 'maPmMstrDetailDTO.pmNo');
  remember(pmNo);
  return pmNo;
}

/** 목록(조건)에서 예방작업번호로 검색한 행 */
async function listRows(page: Page, pmNo: string) {
  await openMenu(page, ['132', '372', '454']);
  await clickTab(page, '목록(조건)');
  const f = await waitFrame(page, F_COND);
  await f.locator('[id="maPmMstrCommonDTO.filterIsActiveDesc"]').fill('');
  await f.locator('[id="maPmMstrCommonDTO.pmNo"]').fill(pmNo);
  await f.locator('a.b_search:visible').first().click();
  await settle(page, 2000);
  return { f, rows: (await new Grid(f, '예방작업번호').rows()).filter((r) => r['예방작업번호'] === pmNo) };
}

/** 정기점검계획 목록(조건)의 이 주기 계획 */
async function plans(page: Page, pmNo: string) {
  await openMenu(page, ['132', '372', '358']);
  await clickTab(page, '목록(조건)');
  const f = page.frames().find((x) => /workCalPmRInsPeriodList_/.test(x.name()))!;
  await put(f.locator('[id$="filterStartDate"]').first(), dateAfter(-60));
  await put(f.locator('[id$="filterEndDate"]').first(), dateAfter(400));
  await f.locator('[id$="filterPmNo"]').first().fill(pmNo);
  await f.locator('a.b_search:visible').first().click();
  await settle(page, 2500);
  return (await new Grid(f, '예방작업번호').rows()).filter((r) => r['예방작업번호'] === pmNo);
}

/** 목록에서 체크하고 삭제 → 확인창 OK */
async function deletePm(page: Page, pmNo: string) {
  const { f, rows } = await listRows(page, pmNo);
  const g = new Grid(f, '예방작업번호');
  // 행을 한 번 눌러 선택(상세 열림)한 뒤 체크 (체크만 하면 삭제가 동작하지 않았음)
  await g.clickCell('예방작업번호', pmNo);
  await settle(page, 2000);
  const all = await g.rows();
  const idx = all.findIndex((r) => r['예방작업번호'] === pmNo);
  // 행을 누르면 체크가 같이 켜지는 경우가 있어, 체크가 꺼져 있을 때만 누름 (item_chk0 = 꺼짐, item_chk1 = 켜짐)
  const img = f.locator('div.gridbox:visible .objbox tr:visible img[src*="item_chk"]').nth(idx);
  if (process.env.QA_DEBUG) console.log('[del] 행 클릭 후 체크', await img.getAttribute('src'));
  if (/item_chk0/.test((await img.getAttribute('src')) ?? '')) await img.click();
  await settle(page, 500);
  if (process.env.QA_DEBUG) console.log('[del] 체크 상태', await img.getAttribute('src'));
  // 브라우저 기본 확인창(confirm)으로 뜨는 경우: Playwright 는 기본으로 '취소'하므로 직접 수락하고 문구를 기록
  let dialogMsg = '';
  page.once('dialog', async (dg) => { dialogMsg = `${dg.type()}: ${dg.message()}`; await dg.accept(); });
  await clickButton(f, '삭제');
  await settle(page, 1000);
  // 확인창이 늦게 뜰 수 있어 최대 8초 기다림
  const ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
  const confirm = await ok.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false);
  if (confirm) {
    const box = await ok.evaluate((b) => { let x: HTMLElement | null = b as HTMLElement; for (let i = 0; i < 4 && x; i++) x = x.parentElement; return (x?.innerText || '').replace(/\s+/g, ' ').slice(0, 80); });
    if (process.env.QA_DEBUG) console.log('[del] 확인창', box);
    dialogMsg = dialogMsg || `확인창 "${box.replace(/OK|Cancel/g, '').trim()}"`;
  }
  if (confirm) await ok.click();
  await settle(page, 2500);
  const msg = await popupMessage(page);
  await page.screenshot({ path: test.info().outputPath('after-delete.png') });
  return { before: rows.length, confirm: confirm || !!dialogMsg, msg: [dialogMsg, msg].filter(Boolean).join(' / ') };
}

test.describe('AD230 정기점검주기 (삭제)', () => {
  test.setTimeout(600_000);

  test('AD230_TC_023 선택한 정기점검주기를 삭제한다. (체크O)', async ({ page }) => {
    const pmNo = st.TC_023 ?? await createPm(page, '삭제 확인용');
    keep('TC_023', pmNo);
    const del = await deletePm(page, pmNo);
    const after = (await listRows(page, pmNo)).rows;
    note(`새로 만든 예방작업번호 ${pmNo} (설비·일정 없음) 체크 후 삭제 → 확인창 ${del.confirm ? '뜸 → OK' : '없음'}, 안내 "${del.msg || '없음'}", 목록 ${del.before} → ${after.length}행`);
    expect(after.length, '삭제 후 목록에서 사라져야 함').toBe(0);
  });

  test('AD230_EC_016 일정이 생성된 정기점검주기를 삭제한다. (작업 발행 전)', async ({ page }) => {
    const reuse = !!st.EC_016;
    const pmNo = st.EC_016 ?? await createPm(page, '일정 있는 주기 삭제 확인용');
    keep('EC_016', pmNo);
    if (!reuse) {
    await openPm(page, pmNo);
    // 몇일전 일정생성(7일)보다 먼 날로 시작 → 계획만 생기고 작업은 발행되지 않음
    await addEquip(page, EQUIP_1, dateAfter(30), '일정 있는 주기 삭제 확인용');
    const d = await openPm(page, pmNo);
    await clickButton(d, '일정생성');
    await settle(page, 800);
    const ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
    if (await ok.isVisible().catch(() => false)) await ok.click();
    await settle(page, 3000);
    await popupMessage(page);
    }
    const before = await plans(page, pmNo);
    const del = await deletePm(page, pmNo);
    const afterList = (await listRows(page, pmNo)).rows;
    const afterPlans = await plans(page, pmNo);
    note(`예방작업번호 ${pmNo}: 설비 ${EQUIP_1}, 최초작업예정일 ${dateAfter(30)}, 일정생성 → 계획 ${before.length}건 (상태 ${[...new Set(before.map((p) => p['일정상태']))].join(', ')})\n체크 후 삭제 → 확인창 ${del.confirm ? '뜸 → OK' : '없음'}, 안내 "${del.msg || '없음'}"\n삭제 후 정기점검주기 목록 ${afterList.length}행, 정기점검계획 ${afterPlans.length}건`);
    expect(before.length, '삭제 전 계획이 있어야 함').toBeGreaterThan(0);
    expect(afterList.length, '주기가 삭제되어야 함').toBe(0);
    expect.soft(afterPlans.length, '발행 전 계획도 함께 정리되어야 함').toBe(0);
  });
});
