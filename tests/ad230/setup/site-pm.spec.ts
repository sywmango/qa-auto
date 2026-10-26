import { test, expect, Page } from '@playwright/test';
import { openMenu, waitFrame, clickButton, clickTab, fieldValue, settle, Grid, lovContentFrame } from '../../support/dream';
import { fillAllFields, saveForm, closeLov, dateAfter, popupMessage } from '../../support/form';
import { L, openPm, addEquip, addPoint, rowsOf, POINTS, uniqueName, pmValues } from '../../support/pmi';
import { SITE, siteData, saveSiteData } from '../../support/site';

// 사이트(mssql 등)에 [sychoi] 정기점검주기 준비: 주기 생성(모든 칸) → 설비 1대 → 점검항목 2개 → 일정생성
// 만든 번호는 playwright/.data/<사이트>/site-data.json 에 기록 (공통 Setting·정기점검실행 테스트가 씀)
// 이미 기록된 주기가 있으면 다시 만들지 않음. 기본 사이트(oracle)는 8007 이 있으므로 실행하지 않음
// 실행: $env:QA_SITE="mssql"; $env:RUN_AD230='1'; npx playwright test ad230/setup/site-pm
// 다음 단계(작업발행)는 site-work.spec.ts (새 번호를 읽어야 해서 따로 실행)

const MENU = ['132', '372', '454'];
const F_COND = 'tabFrameTAB.workPmListInsList_workPmiMstr';
const F_DETAIL = 'tabFrameTAB.workPmListRInsDetail_workPmListInsList';
const STAMP = new Date().toISOString().slice(5, 16).replace(/[-T:]/g, '');
const note = (t: string) => test.info().annotations.push({ type: '실제결과', description: t });

test.describe.configure({ mode: 'serial', timeout: 600_000 });
test.skip(!SITE, '기본 사이트는 [sychoi] 주기 8007 을 씀');

async function openCond(page: Page) {
  await openMenu(page, MENU);
  await clickTab(page, '목록(조건)');
  return waitFrame(page, F_COND);
}

/** 설비 Lov 첫 화면에서 운영 중인 설비 하나의 설비번호 (설비를 주기에 붙이기만 하고 설비 자체는 바꾸지 않음) */
async function pickEquipCode(page: Page) {
  await openPm(page, siteData.pmNo!);
  await clickButton(await waitFrame(page, L.eq), '생성');
  await settle(page, 2000);
  const lov = await lovContentFrame(page);
  const rows = await new Grid(lov, '설비번호').rows();
  await closeLov(page);
  const row = rows.find((r) => r['설비번호']);
  expect(row, '설비 Lov 에 설비').toBeTruthy();
  return { code: row!['설비번호'], name: row!['설비명'] ?? '' };
}

test('[sychoi] 정기점검주기 만들기', async ({ page }) => {
  if (siteData.pmNo) { note(`이미 있음: ${siteData.pmNo}`); return; }
  const f = await openCond(page);
  await clickButton(f, '생성');
  const d = await waitFrame(page, F_DETAIL);
  await settle(page, 1500);
  const name = uniqueName('정기점검');
  const values = pmValues(name);
  delete values['maPmMstrDetailDTO.wrkcalListDesc']; // '기본 달력' 은 oracle 이름 → 이 사이트 근무달력 Lov 의 첫 항목
  const entered = await fillAllFields(page, d, values, STAMP);
  const msg = await saveForm(page, d);
  const pmNo = await fieldValue(d, 'maPmMstrDetailDTO.pmNo');
  note(`${SITE} 정기점검주기 ${pmNo || '(번호 없음)'} '${name}' 저장 ("${msg || '없음'}") / 입력 ${Object.values(entered).map((e) => `${e.label}=${e.value}`).join(', ')}`);
  expect(pmNo, '예방작업번호').toBeTruthy();
  saveSiteData({ pmNo, name });
});

test('[sychoi] 정기점검주기에 설비 붙이기', async ({ page }) => {
  if (siteData.eqNo) { note(`이미 있음: ${siteData.eqNo}`); return; }
  const eq = await pickEquipCode(page);
  const workDate = dateAfter(1);
  await openPm(page, siteData.pmNo!);
  const r = await addEquip(page, eq.code, workDate, `${eq.code} 월간 점검 대상`);
  const rows = await rowsOf(page, 'eq', '최초작업예정일');
  note(`설비 ${eq.code}(${eq.name}) 추가, 최초작업예정일 ${workDate} ("${r.msg || '없음'}") → 목록 ${rows.map((x) => `${x['설비번호']}:${x['최초작업예정일']}`).join(', ')}`);
  expect(rows.some((x) => x['설비번호'] === eq.code)).toBe(true);
  saveSiteData({ eqNo: eq.code, workDate });
});

test('[sychoi] 정기점검주기에 점검항목 넣고 일정생성', async ({ page }) => {
  await openPm(page, siteData.pmNo!);
  let pts = await rowsOf(page, 'pt', '점검항목');
  for (const [i, p] of POINTS.slice(0, 2).entries()) {
    if (pts.some((r) => r['점검항목'] === p[0])) continue;
    await addPoint(page, p, i + 1);
    pts = await rowsOf(page, 'pt', '점검항목');
  }
  const { d } = { d: await openPm(page, siteData.pmNo!) };
  await clickButton(d, '일정생성');
  await settle(page, 800);
  const ok = page.getByText('OK', { exact: true }).first();
  if (await ok.isVisible().catch(() => false)) await ok.click();
  await settle(page, 3000);
  note(`점검항목 ${pts.map((r) => r['점검항목']).join(', ')} / 일정생성 "${(await popupMessage(page)) || '없음'}"`);
  expect(pts.length).toBeGreaterThanOrEqual(2);
});
