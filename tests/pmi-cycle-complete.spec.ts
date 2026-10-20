import { test, expect, Page, Frame } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { openMenu, waitFrame, clickButton, clickTab, fieldValue, settle, Grid } from './support/dream';
import { fillAllFields, listFields, saveForm, popupMessage, put, dateAfter, chooseInLov, readFields } from './support/form';
import { F_COND, F_DETAIL, L, D, openPm, addEquip, detailFrame, uniqueName, PM_VALUES, pmValues, remember } from './support/pmi';

// 정기점검주기 (AD230) EC_001~005: 일정생성 → (작업발행) → 정기점검실행에서 작업완료(확정) → 이후 일정 재조정 확인
// 첫 일정을 몇일전 일정생성(7일) 안에 두면 일정생성 때 바로 작업이 발행됨 (8007 에서 확인) → 일정확정 단계 없이 실행에서 완료
// 규칙: 만든 주기·작업은 삭제하지 않음, 이름은 [sychoi] 로 시작, 담당자 본인

const EQUIP_1 = '100302AG13';
const STATE = path.join('playwright', '.data', 'pmi-complete-state.json');
const state: Record<string, string> = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
const saveState = () => fs.writeFileSync(STATE, JSON.stringify(state));
const note = (t: string) => test.info().annotations.push({ type: '실제결과', description: t });
const log = (s: string) => { if (process.env.QA_DEBUG) console.log('[cmp]', new Date().toISOString().slice(11, 19), s); };

/** 주기 만들기 + 설비 1대(최초작업예정일 start) + 일정생성 */
async function createPm(page: Page, key: string, sched: string, resched: string, start: string) {
  if (state[key]) return state[key];
  await openMenu(page, ['132', '372', '454']);
  await clickTab(page, '목록(조건)');
  const f = await waitFrame(page, F_COND);
  await clickButton(f, '생성');
  const d = await waitFrame(page, F_DETAIL);
  await settle(page, 1500);
  // UBM/RBM 은 일정생성방법을 먼저 고르면 칸이 바뀜: 주기 대신 사용량(시간), 몇시간(사용량)전, 사용/가동달력
  const name = `${uniqueName()} (${sched} 재조정 ${resched})`;
  const pv = pmValues(name);
  const base: Record<string, string | null> = sched === 'TBM' ? pv : {
    'maPmMstrDetailDTO.isActiveDesc': 'Y', 'maPmMstrDetailDTO.usage': '40', 'maPmMstrDetailDTO.woResBef': '80', // 첫 작업만 발행되도록 (200 이면 미래 계획까지 모두 발행되어 재조정 확인이 어려움)
    'maPmMstrDetailDTO.predWoTimeMin': pv['maPmMstrDetailDTO.predWoTimeMin'], 'maPmMstrDetailDTO.remark': pv['maPmMstrDetailDTO.remark'],
    // 테스트용 달력 (평일 1교대 480분 = 8시간/일)
    'maPmMstrDetailDTO.lnWrkListDesc': sched === 'RBM' ? '[sychoi] Mixer 가동달력' : '[sychoi] Mixer 사용달력',
  };
  if (sched !== 'TBM') { await chooseInLov(page, d, 'maPmMstrDetailDTO.scheduleTypeDesc', sched); await settle(page, 1500); }
  await fillAllFields(page, d, {
    ...base,
    'maPmMstrDetailDTO.description': name,
    'maPmMstrDetailDTO.scheduleTypeDesc': sched,
    'maPmMstrDetailDTO.isReschedDesc': resched,
  });
  const setv = await readFields(d);
  const msg = await saveForm(page, d);
  const pmNo = await fieldValue(d, 'maPmMstrDetailDTO.pmNo');
  state[`${key}_입력`] = Object.values(setv).filter((x) => /일정생성|사용량|달력|주기|재조정|몇/.test(x.label)).map((x) => `${x.label}=${x.value}`).join(', ');
  remember(pmNo);
  state[key] = pmNo;
  saveState();
  log(`${key}: 예방작업번호 ${pmNo} 저장 "${msg}"`);
  await openPm(page, pmNo);
  await addEquip(page, EQUIP_1, start, `${sched} 일정 재조정 확인용`);
  const d2 = await openPm(page, pmNo);
  await clickButton(d2, '일정생성');
  await settle(page, 800);
  const ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
  if (await ok.isVisible().catch(() => false)) await ok.click();
  await settle(page, 3000);
  log(`${key}: 일정생성 "${await popupMessage(page)}"`);
  return pmNo;
}

/** 정기점검계획 목록(조건)에서 이 주기의 계획 */
async function plans(page: Page, pmNo: string) {
  await openMenu(page, ['132', '372', '358']);
  await clickTab(page, '목록(조건)');
  const f = page.frames().find((x) => /workCalPmRInsPeriodList_/.test(x.name()))!;
  await put(f.locator('[id$="filterStartDate"]').first(), dateAfter(-60));
  await put(f.locator('[id$="filterEndDate"]').first(), dateAfter(400));
  await f.locator('[id$="filterPmNo"]').first().fill(pmNo);
  await f.locator('a.b_search:visible').first().click();
  await settle(page, 2500);
  const rows = await new Grid(f, '예방작업번호').rows();
  return rows.filter((r) => r['예방작업번호'] === pmNo).map((r) => ({ plan: r['초기계획'], adj: r['일정조정'], done: r['완료일자'], status: r['일정상태'] }));
}
const fmtPlans = (ps: Awaited<ReturnType<typeof plans>>) => ps.slice(0, 6).map((p) => `${p.adj}${p.adj !== p.plan ? `(초기 ${p.plan})` : ''} ${p.status}${p.done ? ` 완료 ${p.done}` : ''}`).join(', ');

/** 정기점검실행에서 이 주기의 첫 작업을 열어 점검값을 넣고 실시일 doneDate 로 확정 */
async function completeWork(page: Page, pmNo: string, doneDate: string) {
  await openMenu(page, ['132', '372', '944']);
  await clickTab(page, '목록(조건)');
  const f = page.frames().find((x) => /workPmiList_/.test(x.name()))!;
  await put(f.locator('[id$="filterStartDate"]').first(), dateAfter(-60));
  await put(f.locator('[id$="filterEndDate"]').first(), dateAfter(60));
  await f.locator('[id$="filterPmNo"]').first().fill(pmNo);
  await f.locator('a.b_search:visible').first().click();
  await settle(page, 2500);
  const g = new Grid(f, '설비번호');
  const rows = await g.rows();
  if (!rows.length) return { msg: '정기점검실행에 작업 없음', work: '' };
  const first = rows.sort((a, b) => a['점검일자'].localeCompare(b['점검일자']))[0];
  await g.clickCell('점검일자', first['점검일자']);
  await settle(page, 3000);
  const d = await waitFrame(page, /^tabFrameTAB\.workPmiDetail_workPmiList$/);
  const work = `${await fieldValue(d, 'workPmiDetailDTO.pminslistId').catch(() => '')} (점검일자 ${first['점검일자']}, 상태 ${first['점검작업상태']})`;
  // 점검항목마다 점검값 입력 (기준값)
  const pl = page.frames().find((x) => x.name() === 'tabFrameTAB.workPmiPointList_workPmiDetail');
  if (pl) {
    const pts = await new Grid(pl, '점검항목').rows().catch(() => []);
    for (const p of pts) {
      await new Grid(pl, '점검항목').clickCell('점검순서', p['점검순서']);
      await settle(page, 2000);
      const pd = page.frames().find((x) => /PointDetail_workPmiPointList$/.test(x.name()));
      if (!pd) continue;
      const fsx = (await listFields(pd)).filter((x) => !x.readonly);
      const over: Record<string, string> = {};
      for (const x of fsx) if (/점검값/.test(x.label)) over[x.id] = p['기준값'] || '1';
      await fillAllFields(page, pd, over);
      await saveForm(page, pd);
    }
  }
  // 실시 시간
  const dd = await waitFrame(page, /^tabFrameTAB\.workPmiDetail_workPmiList$/);
  const ids = (await listFields(dd)).map((x) => x.id);
  const idOf = (k: string) => ids.find((i) => i.endsWith(`.${k}`));
  for (const [k, v] of [['wkorDate', doneDate], ['startDate', doneDate], ['startTime', '09:00'], ['endDate', doneDate], ['endTime', '09:45']] as const) {
    const id = idOf(k);
    if (id) await put(dd.locator(`[id="${id}"]`), v);
  }
  if (idOf('remark')) await put(dd.locator(`[id="${idOf('remark')}"]`), '임펠러 체결 토크·베어링 온도 이상 없음');
  const sm = await saveForm(page, dd);
  const d3 = await waitFrame(page, /^tabFrameTAB\.workPmiDetail_workPmiList$/);
  await clickButton(d3, '확정');
  await settle(page, 1000);
  const ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
  const confirmShown = await ok.isVisible().catch(() => false);
  if (confirmShown) await ok.click();
  // 확정 결과 안내는 '확인' 버튼 없는 알림(잠깐 떴다 사라짐)으로 뜨기도 함 → 화면의 짧은 '…니다.' 문장도 읽음
  let toast = '';
  for (let i = 0; i < 6 && !toast; i++) {
    for (const fr of page.frames()) {
      const t = await fr.evaluate(() => [...document.querySelectorAll<HTMLElement>('div, p, span')]
        .filter((e) => e.offsetWidth > 0 && e.children.length === 0 && /니다\.?$/.test(e.innerText.trim()) && e.innerText.length < 80)
        .map((e) => e.innerText.trim())[0] ?? '').catch(() => '');
      if (t) { toast = t; break; }
    }
    if (!toast) await page.waitForTimeout(500);
  }
  await settle(page, 2000);
  const cm = (await popupMessage(page)) || toast;
  await page.screenshot({ path: test.info().outputPath('after-confirm.png') });
  return { msg: `저장 "${sm || '없음'}", 확정 ${confirmShown ? '확인창 OK' : '확인창 없음'} "${cm || '없음'}"`, work };
}

/** 설비 최초작업예정일을 바꾸고 일정생성 다시 실행 (지난 날짜는 계획이 안 생기므로 몇일전 7일 안의 날짜로 → 바로 작업발행) */
async function restartAt(page: Page, pmNo: string, start: string) {
  await openPm(page, pmNo);
  await new Grid(await waitFrame(page, L.eq), '최초작업예정일').clickCell('설비번호', EQUIP_1);
  await settle(page, 1500);
  const ed = await detailFrame(page, D.eq);
  await put(ed.locator('[id="workPmListEquipDetailDTO.initWrkDate"]'), start);
  await saveForm(page, ed);
  const d = await openPm(page, pmNo);
  await clickButton(d, '일정생성');
  await settle(page, 800);
  const ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
  if (await ok.isVisible().catch(() => false)) await ok.click();
  await settle(page, 3000);
  await popupMessage(page);
}

/** 한 케이스: 주기 생성 → 완료 전 계획 → 첫 작업 완료(doneDate) → 완료 후 계획 */
async function runCase(page: Page, key: string, sched: string, resched: string, start: string, doneDate: string) {
  const pmNo = await createPm(page, key, sched, resched, start);
  let before = await plans(page, pmNo);
  if (!before.some((p) => p.adj === start)) { await restartAt(page, pmNo, start); before = await plans(page, pmNo); }
  const c = await completeWork(page, pmNo, doneDate);
  const after = await plans(page, pmNo);
  note(`예방작업번호 ${pmNo} (${state[`${key}_입력`] ?? `${sched}, 재조정 ${resched}`}), 설비 ${EQUIP_1} 최초작업예정일 ${start}\n완료 전 계획: ${fmtPlans(before) || '없음'}\n작업 ${c.work || '-'} 를 ${doneDate} 실시로 완료: ${c.msg}\n완료 후 계획: ${fmtPlans(after) || '없음'}`);
  return { pmNo, before, after, c };
}

test.describe('AD230 정기점검주기 (작업완료 후 일정 재조정)', () => {
  test.setTimeout(900_000);

  test('AD230_EC_005 TBM 일정 재조정을 확인한다.', async ({ page }) => {
    // 지난 날짜는 계획이 안 생기고("미리 완료처리할 수 없습니다") 앞날짜로는 완료가 안 되므로,
    // 첫 일정을 3일 뒤(몇일전 7일 안 → 바로 작업발행)로 두고 오늘 실시로 완료 = 예정일보다 3일 일찍 완료 → 재조정 Y 면 오늘 기준으로 다음 일정
    const start = dateAfter(3), done = dateAfter(0);
    const r = await runCase(page, 'EC_005', 'TBM', 'Y', start, done);
    const next = r.after.find((p) => !p.done && p.adj > done);
    expect(r.after.some((p) => p.done), '첫 작업이 완료로 바뀜').toBe(true);
    // 완료일(오늘) + 1개월 근처로 다음 일정이 옮겨져야 함 (휴일이면 0~3일 앞당김)
    const [y, m, dd] = done.split('-').map(Number);
    const expectNext = `${new Date(y, m, dd).getFullYear()}-${String(new Date(y, m, dd).getMonth() + 1).padStart(2, '0')}-${String(new Date(y, m, dd).getDate()).padStart(2, '0')}`;
    note(`판정: 다음 일정 ${next?.adj} (기대: 완료일 ${done} + 1개월 = ${expectNext} 전후, 재조정이 안 되면 최초일 기준 ${r.before[1]?.adj})`);
    expect(next?.adj, '다음 일정이 완료일 기준으로 옮겨져야 함').not.toBe(r.before[1]?.adj);
  });
  for (const [id, sched, resched, title] of [
    ['AD230_EC_001', 'UBM', 'Y', 'UBM(사용달력)으로 일정을 생성한다. (재조정 Y)'],
    ['AD230_EC_002', 'UBM', 'N', 'UBM(사용달력)으로 일정을 생성한다. (재조정 N)'],
    ['AD230_EC_003', 'RBM', 'Y', 'RBM(가동달력)으로 일정을 생성한다. (재조정 Y)'],
    ['AD230_EC_004', 'RBM', 'N', 'RBM(가동달력)으로 일정을 생성한다. (재조정 N)'],
  ] as const) {
    test(`${id} ${title}`, async ({ page }) => {
      const start = dateAfter(3), done = dateAfter(0);
      const r = await runCase(page, id.slice(6), sched, resched, start, done);
      expect(r.before.length, `${sched} 로 계획이 생성되어야 함`).toBeGreaterThan(0);
      expect(r.after.some((p) => p.done), '첫 작업이 완료로 바뀜').toBe(true);
      // 완료한 첫 작업을 뺀 나머지(앞으로의) 계획 비교
      const restBefore = r.before.slice(1).map((p) => p.adj).join(', ');
      const restAfter = r.after.filter((p) => !p.done).map((p) => p.adj).join(', ');
      note(`판정: 완료 후 남은 계획 [${restAfter}] / 완료 전 [${restBefore}] → ${restAfter === restBefore ? '그대로' : '바뀜'} (재조정 ${resched} 기대: ${resched === 'Y' ? '완료일 기준으로 바뀜' : '그대로'})`);
      if (resched === 'Y') expect(restAfter).not.toBe(restBefore); else expect(restAfter).toBe(restBefore);
    });
  }
});
