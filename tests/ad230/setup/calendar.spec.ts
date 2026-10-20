import { test, Page, Frame } from '@playwright/test';
import fs from 'fs';
import { openMenu, settle, Grid, clickButton, lovContentFrame } from '../../support/dream';
import { fillAllFields, listFields, saveForm, chooseInLov, closeLov } from '../../support/form';

// EC_001~004 준비: 테스트용 가동달력·사용달력 (사용자 허락 2026-10-19). 이름 [sychoi]. 삭제하지 않음.
const CAL = 'playwright/.data/calendars.json';
const cal: Record<string, string> = fs.existsSync(CAL) ? JSON.parse(fs.readFileSync(CAL, 'utf8')) : {};
const save = () => fs.writeFileSync(CAL, JSON.stringify(cal));
const note = (t: string) => test.info().annotations.push({ type: '실제결과', description: t });
const RUN_NAME = '[sychoi] Mixer 가동달력';

async function detail(page: Page, re: RegExp): Promise<Frame> {
  for (let i = 0; i < 10; i++) {
    for (const f of page.frames()) if (re.test(f.name()) && (await listFields(f).catch(() => [])).some((x) => !x.readonly)) return f;
    await page.waitForTimeout(1000);
  }
  throw new Error(`상세 프레임 없음 ${re}`);
}

async function lovOptions(page: Page, d: Frame, id: string) {
  await d.locator(`[id="${id}"]`).locator('xpath=..').locator('p.open_spop').click();
  await settle(page, 1500);
  const lov = await lovContentFrame(page);
  const t = (await lov.locator('div.gridbox:visible .objbox td:visible').allInnerTexts()).map((x) => x.trim()).filter(Boolean);
  await closeLov(page);
  return t;
}

async function openRunCal(page: Page) {
  await openMenu(page, ['769', '760']);
  await settle(page, 2500);
  const cell = page.mainFrame().locator('div.gridbox:visible .objbox td:visible', { hasText: new RegExp(`^\\s*${RUN_NAME.replace(/[[\]]/g, '\\$&')}\\s*$`) }).first();
  if (!(await cell.isVisible().catch(() => false))) return false;
  await cell.click();
  await settle(page, 3000);
  return true;
}

test('가동달력 만들기 + 요일별 기본값', async ({ page }) => {
  test.setTimeout(600_000);
  const out: string[] = [];
  if (!(await openRunCal(page))) {
    await clickButton(page.mainFrame(), '생성');
    await settle(page, 2500);
    const d = await detail(page, /^tabFrameTAB\.mgrCalLineTimeSetDetail_/);
    const methodId = (await listFields(d)).find((x) => x.label === '가동시간 설정방법')?.id;
    if (methodId) out.push(`가동시간 설정방법 선택지: ${(await lovOptions(page, d, methodId)).join(', ')}`);
    const ids = Object.fromEntries((await listFields(d)).map((x) => [x.label, x.id]));
    const e = await fillAllFields(page, d, {
      [ids['가동달력명']]: RUN_NAME, [ids['공장명']]: '대전센터', [ids['비고']]: 'High Speed Mixer RBM 정기점검 확인용 (평일 1교대 480분)',
      ...(ids['설비명'] ? { [ids['설비명']]: null } : {}), ...(ids['위치명'] ? { [ids['위치명']]: null } : {}),
    });
    out.push(`가동달력 입력: ${Object.values(e).map((x) => `${x.label}=${x.value}`).join(', ')} 저장 "${(await saveForm(page, d)) || '없음'}"`);
    await openRunCal(page);
  }
  const dowName = 'tabFrameTAB.mgrCalLineTimeDowSetList_mgrCalLineTimeSetDetail';
  for (const day of ['월', '화', '수', '목', '금']) {
    const dow = page.frames().find((f) => f.name() === dowName)!;
    if ((await new Grid(dow, '요일').rows()).some((r) => r['요일'] === day)) continue;
    await clickButton(dow, '생성');
    await settle(page, 2000);
    const dd = await detail(page, /Detail_mgrCalLineTimeDowSetList$/);
    const ids = Object.fromEntries((await listFields(dd)).map((x) => [x.id.split('.').pop(), x.id]));
    await chooseInLov(page, dd, ids.dowDesc, day);
    await fillAllFields(page, dd, { [ids.dayRunTime]: '480', [ids.nightRunTime]: '0', [ids.extraRunTime]: '0', [ids.ucnt]: '1', [ids.ordNo]: String(['월', '화', '수', '목', '금'].indexOf(day) + 1) });
    await saveForm(page, dd);
    await openRunCal(page);
  }
  const rows = await new Grid(page.frames().find((f) => f.name() === dowName)!, '요일').rows();
  out.push(`요일별 기본값: ${rows.map((r) => `${r['요일']} ${r['1교대 가동시간(분)']}분`).join(', ')}`);
  const no = await page.frames().find((f) => /mgrCalLineTimeSetDetail_/.test(f.name()))!.evaluate(() => (document.querySelector('input[id$="lnWrkListNo"], input[id$="lnWrkListId"]') as HTMLInputElement | null)?.value ?? '');
  cal.run = RUN_NAME; cal.runNo = no; save();
  note(out.join('\n'));
  console.log(out.join('\n'));
});

/**
 * 달력 일별 데이터를 평일마다 하루씩 넣음 (생성 → 상세에 하루씩)
 * kind: 가동달력(1교대 480분) / 사용달력(사용횟수 8)
 */
async function fillDaily(page: Page, o: { menu: string[]; dto: string; nameLabel: string; calName: string; values: Record<string, string>; from: number; to: number }) {
  const { put, popupMessage } = await import('../../support/form');
  const { openLov } = await import('../../support/dream');
  const days: string[] = [];
  for (let i = o.from; i <= o.to; i++) {
    const d = new Date(Date.now() + i * 86400_000 + 9 * 3600_000); // KST 기준 날짜
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    days.push(d.toISOString().slice(0, 10));
  }
  const out: string[] = [];
  let done = 0;
  await openMenu(page, o.menu);
  await settle(page, 2500);
  await popupMessage(page);
  const f = page.mainFrame();
  /** 달력 Lov: 검색용은 체크박스, 상세용은 행 클릭 → [선택] (값이 늦게 들어오므로 확인하며 기다림) */
  const pickCal = async (scope: Frame, id: string) => {
    const lov = await openLov(page, scope, id);
    const g = new Grid(lov, o.nameLabel);
    const rows = await g.rows();
    const idx = rows.findIndex((r) => r[o.nameLabel] === o.calName);
    if (await lov.locator('div.gridbox:visible .objbox tr:visible img[src*="item_chk"]').count()) await g.check(idx);
    else await g.clickCell(o.nameLabel, o.calName);
    await clickButton(lov, '선택');
    for (let i = 0; i < 10 && (await scope.locator(`[id="${id}"]`).inputValue()) !== o.calName; i++) await page.waitForTimeout(500);
    return scope.locator(`[id="${id}"]`).inputValue();
  };
  out.push(`검색 달력: ${await pickCal(f, `${o.dto}.filterLnWrkListDesc`)}`);
  await put(f.locator(`[id="${o.dto}.filterStartWrkDate"]`), days[0]);
  await put(f.locator(`[id="${o.dto}.filterEndWrkDate"]`), days[days.length - 1]);
  await page.keyboard.press('Escape');
  await f.locator('a.b_search:visible').first().click({ force: true });
  await settle(page, 2500);
  await popupMessage(page);
  const have = (await new Grid(f, '일정조정 일자').rows().catch(() => [])).map((r) => r['일정조정 일자']);
  out.push(`이미 있는 날짜 ${have.length}건`);
  for (const day of days) {
    if (have.includes(day)) continue;
    await page.keyboard.press('Escape');
    await f.locator('a:visible', { hasText: /^\s*생성\s*$/ }).first().click({ force: true });
    await settle(page, 1500);
    // 이전 입력이 남아 "수정중입니다. 취소하시겠습니까?" 가 뜨면 OK (이전 행은 이미 저장됨)
    const ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
    if (await ok.isVisible().catch(() => false)) { await ok.click(); await settle(page, 1000); }
    let d: Frame | undefined;
    for (const fr of page.frames()) {
      const fsx = await listFields(fr).catch(() => []);
      if (fsx.some((x) => x.label === '일정조정 일자' && !/filter/i.test(x.id))) { d = fr; break; }
    }
    if (!d) { out.push(`${day}: 상세 없음`); break; }
    const fsx = (await listFields(d)).filter((x) => !/filter/i.test(x.id));
    const id = (label: string) => fsx.find((x) => x.label === label)?.id ?? '';
    if (!(await d.locator(`[id="${id(o.nameLabel)}"]`).inputValue())) await pickCal(d, id(o.nameLabel));
    await put(d.locator(`[id="${id('일정조정 일자')}"]`), day);
    await page.keyboard.press('Escape');
    // 날짜 선택 달력이 열려 있으면 다른 칸을 가리므로 라벨을 눌러 닫음
    await d.locator('label:visible').first().click({ force: true }).catch(() => {});
    for (const [label, v] of Object.entries(o.values)) if (id(label)) await put(d.locator(`[id="${id(label)}"]`), v);
    const msg = await saveForm(page, d);
    if (msg) out.push(`${day}: "${msg}"`);
    done++;
    if (process.env.QA_DEBUG) console.log('[cal]', day, msg || '저장');
  }
  await f.locator('a.b_search:visible').first().click({ force: true });
  await settle(page, 2500);
  const after = await new Grid(f, '일정조정 일자').rows().catch(() => []);
  out.push(`평일 ${days.length}일 중 새로 ${done}일 입력 → 목록 ${after.length}건 (${after[0]?.['일정조정 일자']} ~ ${after[after.length - 1]?.['일정조정 일자']})`);
  return out;
}

test('가동달력 일별 가동시간 (평일 480분)', async ({ page }) => {
  test.setTimeout(1_500_000);
  const out = await fillDaily(page, { menu: ['769', '211'], dto: 'maLineRunPlanDTO', nameLabel: '가동달력명', calName: RUN_NAME, values: { '1교대 가동시간(분)': '480', '2교대 가동시간(분)': '0', '3교대 가동시간(분)': '0', '비고': 'Mixer 1라인 주간 1교대 가동' }, from: -3, to: 45 });
  cal.runDaily = 'ok'; save();
  note(out.join('\n'));
  console.log(out.join('\n'));
});

const USE_NAME = '[sychoi] Mixer 사용달력';

test('사용달력 만들기', async ({ page }) => {
  test.setTimeout(300_000);
  await openMenu(page, ['769', '1011']);
  await settle(page, 2500);
  const exists = page.mainFrame().locator('div.gridbox:visible .objbox td:visible', { hasText: /^\s*\[sychoi\] Mixer 사용달력\s*$/ }).first();
  if (await exists.isVisible().catch(() => false)) { console.log('이미 있음'); return; }
  await clickButton(page.mainFrame(), '생성');
  await settle(page, 2500);
  const d = await detail(page, /^tabFrameTAB\.mgrUsageCalSetDetail_/);
  const e = await fillAllFields(page, d, {
    'mgrUsageCalSetDTO.lnWrkListDesc': USE_NAME, 'mgrUsageCalSetDTO.runTimeSettingDesc': '내부', 'mgrUsageCalSetDTO.plantDesc': '대전센터',
    'mgrUsageCalSetDTO.remark': 'High Speed Mixer UBM 정기점검 확인용 (평일 하루 8시간 사용)',
  });
  const msg = await saveForm(page, d);
  const t = `사용달력 입력: ${Object.values(e).map((x) => `${x.label}=${x.value}`).join(', ')} 저장 "${msg || '없음'}"`;
  cal.use = USE_NAME; save();
  note(t);
  console.log(t);
});

test('사용달력 일별 사용 (평일 8)', async ({ page }) => {
  test.setTimeout(1_500_000);
  const out = await fillDaily(page, { menu: ['769', '1013'], dto: 'mgrUsageCalSetDayDTO', nameLabel: '사용달력명', calName: USE_NAME, values: { '사용횟수': '8', '비고': 'Mixer 1라인 주간 8시간 사용' }, from: -3, to: 45 });
  cal.useDaily = 'ok'; save();
  note(out.join('\n'));
  console.log(out.join('\n'));
});
