import { test, expect, Page, Frame } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { openMenu, waitFrame, clickButton, clickTab, fieldValue, settle, Grid, lovContentFrame } from './support/dream';
import { fillAllFields, saveForm, popupMessage, put, dateAfter, closeLov } from './support/form';
import { F_COND, F_DETAIL, L, D, openPm, detailFrame, rowsOf, addEquip, uniqueName, pmValues, remember, readPlans } from './support/pmi';

// 정기점검주기 (AD230) — 1차에서 미수행이었던 케이스 (2026-10-19 사용자 요청으로 추가 실행)
// TC_015 상세 표시 형식, TC_036 설비 탭 Excel, EC_010 설비 2대 일정, EC_006 주기구분별 간격, EC_007 월말 시작일, EC_012 몇일전 경계값
// 규칙: 만든 주기는 삭제하지 않음, 이름은 [sychoi] 로 시작, 담당자 본인

const EQUIP_1 = '100302AG13';
const EQUIP_2 = '100305AG17';
const STATE = path.join('playwright', '.data', 'pmi-extra-state.json');
// TC_015·TC_036·EC_010 은 생성·수정 묶음이 만든 주 주기(pmi-state.json 의 pmNo)에서 확인
const MAIN: string = fs.existsSync(path.join('playwright', '.data', 'pmi-state.json')) ? JSON.parse(fs.readFileSync(path.join('playwright', '.data', 'pmi-state.json'), 'utf8')).pmNo : '8007';
const state: { pmNo?: string } = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
const saveState = () => fs.writeFileSync(STATE, JSON.stringify(state));

function note(t: string) { test.info().annotations.push({ type: '실제결과', description: t }); }

/** 일정생성 → (확인창 OK) → 안내 메시지 */
async function generate(page: Page, d: Frame) {
  await clickButton(d, '일정생성');
  await settle(page, 800);
  const ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
  if (await ok.isVisible().catch(() => false)) await ok.click();
  await settle(page, 3000);
  return popupMessage(page);
}

/** 주기구분 Lov 에서 '일/주/월/년' 이 들어간 항목 선택 */
async function setPeriod(page: Page, d: Frame, unit: string) {
  await d.locator('[id="maPmMstrDetailDTO.periodTypeDesc"]').locator('xpath=..').locator('p.open_spop').click();
  await settle(page, 1500);
  const lov = await lovContentFrame(page);
  const cells = lov.locator('div.gridbox:visible .objbox td:visible');
  const texts = (await cells.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  const want = texts.find((t) => t.startsWith(unit) && /주기/.test(t)) ?? texts.find((t) => t.startsWith(unit));
  if (!want) { await closeLov(page); throw new Error(`주기구분 Lov 에 "${unit}" 없음: ${texts.join(', ')}`); }
  await cells.filter({ hasText: new RegExp(`^\\s*${want}\\s*$`) }).first().click();
  await clickButton(lov, '선택');
  await settle(page, 1000);
  return want;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
/** 시작일에서 k번째 예정일 (월·년은 말일 넘치면 그 달 말일) */
function nominal(start: string, unit: string, n: number, k: number) {
  const s = parse(start);
  if (unit === '일') return ymd(new Date(s.getFullYear(), s.getMonth(), s.getDate() + n * k));
  if (unit === '주') return ymd(new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7 * n * k));
  const months = unit === '월' ? n * k : 12 * n * k;
  const last = new Date(s.getFullYear(), s.getMonth() + months + 1, 0).getDate();
  return ymd(new Date(s.getFullYear(), s.getMonth() + months, Math.min(s.getDate(), last)));
}
const daysBetween = (a: string, b: string) => Math.round((parse(a).getTime() - parse(b).getTime()) / 86400_000);
const planDate = (p: Record<string, string>) => p['초기계획'] || p['작업일자'] || p['점검일자'] || '';

/** 계획 날짜가 시작일 기준 주기와 맞는지 (휴일이면 앞 근무일로 당겨지므로 0~3일 이른 것은 허용) */
function checkIntervals(dates: string[], start: string, unit: string, n: number) {
  const bad: string[] = [];
  dates.forEach((dt, k) => {
    const nom = nominal(start, unit, n, k);
    const early = daysBetween(nom, dt);
    if (early < 0 || early > 3) bad.push(`${k + 1}번째 ${dt} (기대 ${nom})`);
  });
  return bad;
}

async function equipDates(page: Page, pmNo: string) {
  const d = await openPm(page, pmNo);
  const plans = await readPlans(page, d);
  const by: Record<string, string[]> = {};
  for (const p of plans) (by[p['설비번호']] ??= []).push(planDate(p));
  for (const k of Object.keys(by)) by[k].sort();
  return by;
}

test.describe('AD230 정기점검주기 (추가 실행)', () => {
  test.setTimeout(600_000);
  test.afterEach(saveState);

  test('AD230_TC_015 (상세) 데이터 표시 형식을 확인한다.', async ({ page }) => {
    const d = await openPm(page, MAIN);
    const nums = ['cycle', 'woResBef', 'predWoTimeMin'];
    const align: string[] = [];
    for (const id of nums) {
      const a = await d.locator(`[id="maPmMstrDetailDTO.${id}"]`).evaluate((e) => getComputedStyle(e).textAlign);
      align.push(`${id}=${a}`);
    }
    const eq = await waitFrame(page, L.eq);
    await new Grid(eq, '최초작업예정일').clickCell('설비번호', EQUIP_1);
    await settle(page, 1500);
    const ed = await detailFrame(page, D.eq);
    const date = await fieldValue(ed, 'workPmListEquipDetailDTO.initWrkDate');
    note(`숫자 칸 정렬: ${align.join(', ')} / 설비 최초작업예정일 "${date}"`);
    for (const a of align) expect.soft(a, '숫자는 오른쪽 정렬').toMatch(/=(right|end)$/);
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('AD230_TC_036 설비 목록을 Excel로 다운로드한다.', async ({ page }) => {
    await openPm(page, MAIN);
    const eq = await waitFrame(page, L.eq);
    const rows = await new Grid(eq, '최초작업예정일').rows();
    const winP = page.context().waitForEvent('page', { timeout: 15_000 });
    await clickButton(eq, 'Excel');
    const win = await winP;
    const file = await win.waitForEvent('download', { timeout: 60_000 });
    const saved = test.info().outputPath(file.suggestedFilename());
    await file.saveAs(saved);
    const buf = fs.readFileSync(saved);
    note(`파일 "${file.suggestedFilename()}" ${buf.length.toLocaleString()} bytes (설비 목록 ${rows.length}행: ${rows.map((r) => r['설비번호']).join(', ')}), 형식 ${buf.slice(0, 2).toString() === 'PK' ? 'xlsx(zip)' : '기타'}`);
    fs.mkdirSync(path.join('playwright', '.data', 'evidence'), { recursive: true });
    fs.copyFileSync(saved, path.join('playwright', '.data', 'evidence', `TC_036_${file.suggestedFilename()}`));
    expect(buf.length).toBeGreaterThan(0);
  });

  test('AD230_EC_010 설비가 여러 대인 주기의 일정을 생성한다.', async ({ page }) => {
    // 주 주기: 설비 1대(100302AG13, 최초 2026-10-26) → 두 번째 설비를 다른 최초작업예정일로 추가 후 일정생성
    await openPm(page, MAIN);
    let rows = await rowsOf(page, 'eq', '최초작업예정일');
    const date2 = dateAfter(10);
    if (!rows.some((r) => r['설비번호'] === EQUIP_2)) await addEquip(page, EQUIP_2, date2, '동일 라인 2호기 추가 점검 대상');
    rows = await rowsOf(page, 'eq', '최초작업예정일');
    const first: Record<string, string> = Object.fromEntries(rows.map((r) => [r['설비번호'], r['최초작업예정일']]));
    const d = await openPm(page, MAIN);
    const cycle = await fieldValue(d, 'maPmMstrDetailDTO.cycle');
    const msg = await generate(page, d);
    const by = await equipDates(page, MAIN);
    const lines = Object.entries(first).map(([eqNo, f]) => {
      const ds = by[eqNo] ?? [];
      const bad = checkIntervals(ds, f, '월', Number(cycle));
      return `${eqNo}: 최초작업예정일 ${f}, 계획 ${ds.length}건 [${ds.slice(0, 4).join(', ')}${ds.length > 4 ? ' …' : ''}] ${bad.length ? `간격 불일치 ${bad.join(', ')}` : '간격 일치'}`;
    });
    note(`${MAIN} (${cycle} 월 주기) 일정생성 안내 "${msg || '없음'}"\n${lines.join('\n')}`);
    for (const [eqNo, f] of Object.entries(first)) {
      expect.soft(by[eqNo]?.length ?? 0, `${eqNo} 계획`).toBeGreaterThan(0);
      if (by[eqNo]?.length) expect.soft(daysBetween(f, by[eqNo][0]), `${eqNo} 첫 계획 = 최초작업예정일`).toBeLessThanOrEqual(3);
    }
  });

  // 새 주기 하나를 만들고 같은 설비로 주기구분만 바꿔가며 일정생성 (다시 생성하면 앞으로의 계획을 새로 만듦: EC_015)
  // 시간이 오래 걸려 주기구분마다 테스트를 나눔 (결과는 같은 ID 로 합쳐 기록)
  const EC006_START = '2026-11-16';
  for (const unit of ['일', '주', '월', '년']) {
    test(`AD230_EC_006 주기구분별 일정 간격을 확인한다. (2 ${unit} 주기)`, async ({ page }) => {
      if (!state.pmNo) {
        await openMenu(page, ['132', '372', '454']);
        await clickTab(page, '목록(조건)');
        const f = await waitFrame(page, F_COND);
        await clickButton(f, '생성');
        const d = await waitFrame(page, F_DETAIL);
        await settle(page, 1500);
        await fillAllFields(page, d, { ...pmValues(`${uniqueName()} (주기구분 확인)`), 'maPmMstrDetailDTO.cycle': '2' });
        await saveForm(page, d);
        const pmNo = await fieldValue(d, 'maPmMstrDetailDTO.pmNo');
        remember(pmNo);
        state.pmNo = pmNo;
        saveState();
        await openPm(page, pmNo);
        await addEquip(page, EQUIP_1, EC006_START, '주기구분별 일정 간격 확인용');
      }
      const pmNo = state.pmNo!;
      // 설비 최초작업예정일을 월 중순(월요일)으로 맞춤 (EC_007 에서 1월 31일로 바꿨을 수 있음)
      await openPm(page, pmNo);
      let start = (await rowsOf(page, 'eq', '최초작업예정일')).find((r) => r['설비번호'] === EQUIP_1)?.['최초작업예정일'] ?? '';
      if (start !== EC006_START) {
        await new Grid(await waitFrame(page, L.eq), '최초작업예정일').clickCell('설비번호', EQUIP_1);
        await settle(page, 1500);
        const ed = await detailFrame(page, D.eq);
        await put(ed.locator('[id="workPmListEquipDetailDTO.initWrkDate"]'), EC006_START);
        await saveForm(page, ed);
        start = EC006_START;
      }
      let d = await openPm(page, pmNo);
      const label = await setPeriod(page, d, unit);
      d = await waitFrame(page, F_DETAIL);
      await put(d.locator('[id="maPmMstrDetailDTO.cycle"]'), '2');
      const sm = await saveForm(page, d);
      d = await openPm(page, pmNo);
      const saved = `${await fieldValue(d, 'maPmMstrDetailDTO.cycle')} ${await fieldValue(d, 'maPmMstrDetailDTO.periodTypeDesc')}`;
      const gm = await generate(page, d);
      const ds = ((await equipDates(page, pmNo))[EQUIP_1] ?? []).filter((x) => daysBetween(start, x) <= 3);
      const bad = checkIntervals(ds.slice(0, 10), start, unit, 2);
      note(`예방작업번호 ${pmNo}, 설비 ${EQUIP_1}, 최초작업예정일 ${start}
${label}: 저장 "${sm || '없음'}" → 저장값 ${saved}, 일정생성 "${gm || '없음'}" → 계획 ${ds.length}건 [${ds.slice(0, 6).join(', ')}${ds.length > 6 ? ' …' : ''}] ${ds.length ? (bad.length ? `간격 불일치 ${bad.join(', ')}` : '간격 일치 (휴일 앞당김 0~3일 허용)') : '계획 없음'}`);
      expect(ds.length, '계획 생성').toBeGreaterThan(0);
      expect.soft(bad).toEqual([]);
    });
  }

  test('AD230_EC_007 월말 시작일의 월 주기 일정을 확인한다.', async ({ page }) => {
    const pmNo = state.pmNo!;
    let d = await openPm(page, pmNo);
    await setPeriod(page, d, '월');
    d = await waitFrame(page, F_DETAIL);
    await put(d.locator('[id="maPmMstrDetailDTO.cycle"]'), '1');
    await saveForm(page, d);
    await openPm(page, pmNo);
    // 설비의 최초작업예정일을 1월 31일로
    const start = `${new Date().getFullYear() + 1}-01-31`;
    await new Grid(await waitFrame(page, L.eq), '최초작업예정일').clickCell('설비번호', EQUIP_1);
    await settle(page, 1500);
    const ed = await detailFrame(page, D.eq);
    await put(ed.locator('[id="workPmListEquipDetailDTO.initWrkDate"]'), start);
    const em = await saveForm(page, ed);
    d = await openPm(page, pmNo);
    const gm = await generate(page, d);
    const ds = ((await equipDates(page, pmNo))[EQUIP_1] ?? []).filter((x) => daysBetween(start, x) <= 3); // 시작일이 휴일이면 앞 근무일로 당겨짐
    const months = ds.slice(0, 6).map((x) => x.slice(0, 7));
    const dupOrSkip = months.some((m, i) => i > 0 && (Number(m.slice(5)) + 12 * Number(m.slice(0, 4))) - (Number(months[i - 1].slice(5)) + 12 * Number(months[i - 1].slice(0, 4))) !== 1);
    const bad = checkIntervals(ds.slice(0, 6), start, '월', 1);
    note(`최초작업예정일 ${start} 저장 ("${em || '없음'}"), 1 월 주기 일정생성 ("${gm || '없음'}") → ${ds.slice(0, 6).join(', ')}\n월 건너뜀/중복 ${dupOrSkip ? '있음' : '없음'}, ${bad.length ? `기대와 다름: ${bad.join(', ')}` : '2월은 말일(휴일이면 앞 근무일), 이후 달은 31일/말일 기준으로 맞음'}`);
    expect(ds.length, '계획 생성').toBeGreaterThan(1);
    expect(dupOrSkip, '달이 건너뛰거나 겹치면 안 됨').toBe(false);
    expect.soft(bad).toEqual([]);
  });

  test('AD230_EC_012 몇일전 일정생성? 경계값을 확인한다.', async ({ page }) => {
    const pmNo = state.pmNo!;
    const out: string[] = [];
    let d = await openPm(page, pmNo);
    await setPeriod(page, d, '주');
    d = await waitFrame(page, F_DETAIL);
    await put(d.locator('[id="maPmMstrDetailDTO.cycle"]'), '1');
    await saveForm(page, d);
    for (const v of ['0', '-1', '30', '400']) {
      await openPm(page, pmNo);
      d = await waitFrame(page, F_DETAIL);
      await put(d.locator('[id="maPmMstrDetailDTO.woResBef"]'), v);
      const shown = await fieldValue(d, 'maPmMstrDetailDTO.woResBef');
      const sm = await saveForm(page, d);
      await openPm(page, pmNo);
      const saved = await fieldValue(await waitFrame(page, F_DETAIL), 'maPmMstrDetailDTO.woResBef');
      out.push(`"${v}" → 칸 값 "${shown}", 저장 안내 "${sm || '없음'}", 다시 열었을 때 "${saved}"`);
    }
    d = await openPm(page, pmNo);
    const before = await fieldValue(d, 'maPmMstrDetailDTO.woResBef');
    const gm = await generate(page, d);
    const ds = (await equipDates(page, pmNo))[EQUIP_1] ?? [];
    out.push(`1 주 주기 + 몇일전 ${before} 으로 일정생성 ("${gm || '없음'}") → 계획 ${ds.length}건 [${ds.slice(0, 4).join(', ')} …]`);
    // 원래 값(7)으로 되돌림
    d = await openPm(page, pmNo);
    await put(d.locator('[id="maPmMstrDetailDTO.woResBef"]'), '7');
    await saveForm(page, d);
    note(out.join('\n'));
    test.info().annotations.push({ type: '판정', description: '주기(7일)보다 큰 몇일전 값이 막히는지 기록. 그 값만큼 앞서 작업이 생기는지는 정기점검실행 작업 생성 시점이라 EC_001~005 와 함께 확인' });
  });
});
