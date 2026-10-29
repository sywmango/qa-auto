import { test, expect, Page, Frame } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { openMenu, waitFrame, clickButton, clickTab, fieldValue, settle, Grid } from '../support/dream';
import { D, detailFrame, rowsOf, deleteRow, deleteRowWhere, addStd, addPoint, addDoc, fmt, POINTS, uniqueName, PM_VALUES, pmValues, remember, readPlans } from '../support/pmi';
import {
  fillAllFields, readFields, diffFields, diffWithRow, saveForm, popupMessage, chooseInLov, closeLov,
  listFields, dateAfter, Entered, TAG, leaveField, put,
} from '../support/form';

// 작업관리 > 정기점검작업 > 정기점검주기 (AD230) — 데이터를 만들고 바꾸는 케이스
// 순서가 필요한 흐름이라 한 파일에서 위에서 아래로 차례대로 실행합니다. (serial)
// 이 테스트가 만든 예방작업번호는 playwright/.data/pmi-created.json 에 기록합니다. (삭제하지 않음)
// 규칙: 만든 데이터의 작업명은 "[sychoi] "로 시작하고 실행마다 겹치지 않음, 사원 칸은 본인,
//       예방작업(주기) 자체는 절대 삭제하지 않음. 하위 항목은 테스트가 추가한 것만 지우고 다시 추가해 1건 이상 남김.

const MENU = ['132', '372', '454'];
const F_COND = 'tabFrameTAB.workPmListInsList_workPmiMstr';
const F_DETAIL = 'tabFrameTAB.workPmListRInsDetail_workPmListInsList';
const F_EQ_LIST = 'tabFrameTAB.workPmListRInsEquipList_workPmListRInsDetail';
const F_PT_LIST = 'tabFrameTAB.maPmMstrPointList_workPmListRInsDetail';
const STAMP = new Date().toISOString().slice(5, 16).replace(/[-T:]/g, '');
// test-results 폴더는 실행할 때마다 지워지므로 playwright/.data 에 보관
const STATE = path.join('playwright', '.data', 'pmi-state.json');


// 설비는 Lov에서 고름 (운영설비, 안성공장 고형제 라인)
const EQUIP_1 = '100302AG13';
const EQUIP_2 = '100305AG17';


const state: { pmNoEC011?: string; pmNoN?: string; pmNo?: string; name?: string; entered?: Entered; eq1Date?: string; eq2Date?: string } = {};

function note(text: string) {
  test.info().annotations.push({ type: '실제결과', description: text });
}

async function openCond(page: Page) {
  await openMenu(page, MENU);
  await clickTab(page, '목록(조건)');
  return waitFrame(page, F_COND);
}

/** 예방작업번호로 검색해서 상세를 엽니다. 시행여부 조건은 비웁니다. */
async function openPm(page: Page, pmNo: string) {
  const f = await openCond(page);
  await f.locator('[id="maPmMstrCommonDTO.filterIsActiveDesc"]').fill('');
  await f.locator('[id="maPmMstrCommonDTO.pmNo"]').fill(pmNo);
  await f.locator('a.b_search:visible').first().click();
  await settle(page, 1500);
  const rows = await new Grid(f, '예방작업번호').rows();
  await new Grid(f, '예방작업번호').clickCell('예방작업번호', pmNo);
  const d = await waitFrame(page, F_DETAIL);
  await expect(d.getByText(new RegExp(`정기점검주기설정\\s*:\\s*${pmNo}`))).toBeVisible({ timeout: 15_000 });
  await settle(page, 1500);
  return { f, d, rows };
}

/** 하위 목록 프레임 (상세가 열린 뒤) */
const sub = (page: Page, name: string) => waitFrame(page, name);


test.describe('AD230 정기점검주기 (생성·수정·일정)', () => {
  test.setTimeout(240_000);
  // 실패한 테스트가 있어도 다음 테스트가 이어지도록, 앞 단계 결과(예방작업번호 등)는 파일로 주고받습니다.
  test.beforeEach(() => { if (fs.existsSync(STATE)) Object.assign(state, JSON.parse(fs.readFileSync(STATE, 'utf8'))); });
  test.afterEach(() => { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(state)); });

  test('AD230_TC_018 생성 시 기본값을 확인한다.', async ({ page }) => {
    const f = await openCond(page);
    await clickButton(f, '생성');
    const d = await waitFrame(page, F_DETAIL);
    await settle(page, 1500);
    const v = await readFields(d);
    const get = (id: string) => v[`maPmMstrDetailDTO.${id}`]?.value ?? '';
    const pmNo = await fieldValue(d, 'maPmMstrDetailDTO.pmNo');
    note(`작업종류=${await fieldValue(d, 'maPmMstrDetailDTO.woTypeDesc')}, 작업형태=${await fieldValue(d, 'maPmMstrDetailDTO.pmTypeDesc')}, 예방작업번호=${pmNo}, 시행여부=${get('isActiveDesc')}, 일정생성방법=${get('scheduleTypeDesc')}, 몇일전=${get('woResBef')}, 공장=${get('plantDesc')}, 부서명=${get('deptDesc')}`);
    expect.soft(await fieldValue(d, 'maPmMstrDetailDTO.woTypeDesc')).toBe('정기점검');
    expect.soft(await fieldValue(d, 'maPmMstrDetailDTO.pmTypeDesc')).toBe('정기점검');
    expect.soft(pmNo).toMatch(/^\d+$/);
    expect.soft(get('isActiveDesc')).toBe('Y');
    expect.soft(get('scheduleTypeDesc')).toBe('TBM');
    expect.soft(get('woResBef')).toBe('7');
    expect.soft(get('deptDesc')).not.toBe('');
  });

  test('AD230_TC_020 필수값을 하나씩 비우고 저장한다.', async ({ page }) => {
    test.setTimeout(900_000); // 필수 칸마다 저장·안내 확인·되돌리기
    const f = await openCond(page);
    await clickButton(f, '생성');
    const d = await waitFrame(page, F_DETAIL);
    await settle(page, 1500);
    await fillAllFields(page, d, PM_VALUES, STAMP);
    const required = (await listFields(d)).filter((x) => x.required && !x.readonly);
    const log: string[] = [`필수 표시 칸: ${required.map((r) => r.label).join(', ')}`];
    for (const r of required) {
      const before = await fieldValue(d, r.id);
      await put(d.locator(`[id="${r.id}"]`), '');
      const msg = await saveForm(page, d);
      log.push(`${r.label} 비움 → "${msg || '(메시지 없음)'}"`);
      expect.soft(msg, `${r.label} 누락 시 필수 안내`).toMatch(/필수/);
      // 원래 값 되돌리기
      if (r.kind === 'lov') await chooseInLov(page, d, r.id, before);
      else await put(d.locator(`[id="${r.id}"]`), before);
    }
    note(log.join('\n'));
    // 이 폼은 저장하지 않고 떠남
  });

  test('AD230_TC_019 필수값을 모두 넣어 정기점검주기를 생성한다. (모든 칸 입력)', async ({ page }) => {
    const f = await openCond(page);
    await clickButton(f, '생성');
    const d = await waitFrame(page, F_DETAIL);
    await settle(page, 1500);
    const name = uniqueName();
    const entered = await fillAllFields(page, d, pmValues(name), STAMP);
    const msg = await saveForm(page, d);
    const pmNo = await fieldValue(d, 'maPmMstrDetailDTO.pmNo');
    remember(pmNo);
    state.pmNo = pmNo;
    state.name = name;
    state.entered = entered;
    // 다시 열어서 칸마다 비교
    const { d: d2, rows } = await openPm(page, pmNo);
    const now = await readFields(d2);
    const diff = diffFields(entered, now);
    const row = rows.find((r) => r['예방작업번호'] === pmNo) ?? {};
    const lr = diffWithRow(entered, row);
    note(`예방작업번호 ${pmNo} 저장 (메시지: "${msg || '없음'}")\n입력 ${Object.keys(entered).length}칸: ${Object.values(entered).map((e) => `${e.label}=${e.value}`).join(', ')}\n상세 비교: ${diff.length ? diff.join(' / ') : '모두 일치'}\n목록 비교(${lr.compared}칸): ${lr.diff.length ? lr.diff.join(' / ') : '모두 일치'}`);
    expect(rows.some((r) => r['예방작업번호'] === pmNo), '목록에 새 행').toBe(true);
    expect.soft(diff).toEqual([]);
    expect.soft(lr.diff).toEqual([]);
  });

  test('AD230_TC_021 저장된 정기점검주기를 수정한다.', async ({ page }) => {
    const { d } = await openPm(page, state.pmNo!);
    const changes: Record<string, string> = {
      // 이전 실행에서 붙은 표시는 떼고 한 번만 붙임
      // 작업명은 100바이트(UTF-8)를 넘으면 안내 없이 저장되지 않음(EC_013) → 짧은 표시만 붙임
      'maPmMstrDetailDTO.description': `${state.name!.replace(/( \((점검항목 )?보완\))+$/, '')} (보완)`,
      'maPmMstrDetailDTO.predWoTimeMin': '45',
      'maPmMstrDetailDTO.remark': '임펠러 체결 토크 재확인 항목 추가',
    };
    for (const [id, v] of Object.entries(changes)) {
      await d.locator(`[id="${id}"]`).fill(v);
      await leaveField(d.locator(`[id="${id}"]`));
    }
    const entered = await readFields(d);
    const msg = await saveForm(page, d);
    const { d: d2, rows } = await openPm(page, state.pmNo!);
    const diff = diffFields(entered, await readFields(d2));
    const row = rows.find((r) => r['예방작업번호'] === state.pmNo) ?? {};
    note(`작업명·예상작업시간·비고 수정 저장 (메시지 "${msg || '없음'}") → 상세 비교 ${diff.length ? diff.join(' / ') : '모두 일치'}, 목록 작업명="${row['작업명']}"`);
    expect.soft(diff).toEqual([]);
    expect.soft(row['작업명']).toBe(changes['maPmMstrDetailDTO.description']);
    state.entered = entered;
    state.name = changes['maPmMstrDetailDTO.description'];
  });

  test('AD230_TC_022 필수값을 지우고 수정한다.', async ({ page }) => {
    const { d } = await openPm(page, state.pmNo!);
    await put(d.locator('[id="maPmMstrDetailDTO.description"]'), '');
    const msg = await saveForm(page, d);
    const { d: d2 } = await openPm(page, state.pmNo!);
    const desc = await fieldValue(d2, 'maPmMstrDetailDTO.description');
    note(`작업명 비우고 저장 → "${msg || '(메시지 없음)'}", 다시 열었을 때 작업명="${desc}"`);
    expect.soft(msg).toMatch(/필수/);
    expect(desc).not.toBe('');
  });

  test('AD230_TC_032 설비를 추가한다. (Lov 선택)', async ({ page }) => {
    const { d } = await openPm(page, state.pmNo!);
    const log: string[] = [];
    for (const [code, days] of [[EQUIP_1, 7], [EQUIP_2, 10]] as const) {
      const eq = await sub(page, F_EQ_LIST);
      await clickButton(eq, '생성');
      await settle(page, 1500);
      // 생성하면 설비 Lov 가 자동으로 열림 → 설비번호로 골라서 선택
      const popup = page.frames().find((x) => x.name() === 'popupIframe1');
      const ed = await detailFrame(page, D.eq);
      if (popup && (await popup.locator('div.b_pwin_close').isVisible().catch(() => false))) {
        const { lovContentFrame, pickInLov } = await import('../support/dream');
        const lov = await lovContentFrame(page);
        await pickInLov(page, lov, code, '설비번호');
      } else {
        await chooseInLov(page, ed, 'workPmListEquipDetailDTO.equipDesc', code);
      }
      const date = dateAfter(days);
      const entered = await fillAllFields(page, ed, { 'workPmListEquipDetailDTO.initWrkDate': date, 'workPmListEquipDetailDTO.remark': `${code} 월간 점검 대상` }, STAMP);
      const msg = await saveForm(page, ed);
      const rows = await new Grid(await sub(page, F_EQ_LIST), '최초작업예정일').rows();
      const row = rows.find((r) => r['설비번호'] === code);
      log.push(`${code}: 저장("${msg || '없음'}"), 목록 ${row ? `설비명=${row['설비명']}, 최초작업예정일=${row['최초작업예정일']}, 설비위치=${row['설비위치']}` : '행 없음'} / 입력 ${Object.values(entered).map((e) => `${e.label}=${e.value}`).join(', ')}`);
      expect.soft(row, `${code} 목록에 추가`).toBeTruthy();
      expect.soft(row?.['최초작업예정일']).toBe(date);
      if (code === EQUIP_1) state.eq1Date = date; else state.eq2Date = date;
    }
    note(log.join('\n'));
    void d;
  });

  test('AD230_TC_033 설비를 필수값 없이 추가한다.', async ({ page }) => {
    await openPm(page, state.pmNo!);
    const eq = await sub(page, F_EQ_LIST);
    await clickButton(eq, '생성');
    await settle(page, 1500);
    await closeLov(page);
    const ed = await detailFrame(page, D.eq);
    const msg = await saveForm(page, ed);
    note(`설비 없이 저장 → "${msg || '(메시지 없음)'}"`);
    expect(msg).toMatch(/필수/);
  });

  test('AD230_EC_014 같은 설비를 중복 추가한다.', async ({ page }) => {
    await openPm(page, state.pmNo!);
    const eq = await sub(page, F_EQ_LIST);
    await clickButton(eq, '생성');
    await settle(page, 1500);
    const { lovContentFrame, pickInLov } = await import('../support/dream');
    await pickInLov(page, await lovContentFrame(page), EQUIP_1, '설비번호');
    const ed = await detailFrame(page, D.eq);
    const dup = dateAfter(20);
    await put(ed.locator('[id="workPmListEquipDetailDTO.initWrkDate"]'), dup);
    const msg = await saveForm(page, ed);
    const rows = await new Grid(await sub(page, F_EQ_LIST), '최초작업예정일').rows();
    const n = rows.filter((r) => r['설비번호'] === EQUIP_1).length;
    // 중복으로 들어갔으면 이 테스트가 넣은 행(최초작업예정일 = dup)만 지워서 이후 일정생성에 영향이 없게 함
    let cleaned = '';
    if (n > 1) {
      const m = await deleteRowWhere(page, 'eq', '최초작업예정일', (r) => r['설비번호'] === EQUIP_1 && r['최초작업예정일'] === dup, `${EQUIP_1} ${dup}`);
      cleaned = ` → 테스트가 넣은 중복 행(${dup}) 삭제 ("${m || '없음'}")`;
    }
    note(`이미 있는 설비 ${EQUIP_1} 다시 추가 → 메시지 "${msg || '없음'}", 목록의 ${EQUIP_1} 행 수 ${n} (중복 허용됨)${cleaned}`);
    expect(n, '같은 설비가 두 번 들어가면 안 됨').toBe(1);
  });

  test('AD230_TC_034 설비의 최초작업예정일·시행여부를 수정한다.', async ({ page }) => {
    await openPm(page, state.pmNo!);
    const eq = await sub(page, F_EQ_LIST);
    await new Grid(eq, '최초작업예정일').clickCell('설비번호', EQUIP_2);
    await settle(page, 1500);
    const ed = await detailFrame(page, D.eq);
    const date = dateAfter(12);
    await put(ed.locator('[id="workPmListEquipDetailDTO.initWrkDate"]'), date);
    await put(ed.locator('[id="workPmListEquipDetailDTO.remark"]'), '점검 시작일 조정');
    const msg = await saveForm(page, ed);
    const row = (await new Grid(await sub(page, F_EQ_LIST), '최초작업예정일').rows()).find((r) => r['설비번호'] === EQUIP_2);
    note(`${EQUIP_2} 최초작업예정일 ${state.eq2Date} → ${date} 저장("${msg || '없음'}"), 목록 값 ${row?.['최초작업예정일']}`);
    expect(row?.['최초작업예정일']).toBe(date);
    state.eq2Date = date;
  });

  test('AD230_TC_038 점검항목을 직접 추가한다. (모든 칸 입력)', async ({ page }) => {
    await openPm(page, state.pmNo!);
    const rows = await rowsOf(page, 'pt', '점검항목');
    const p = POINTS.find((x) => !rows.some((r) => r['점검항목'] === x[0]))!;
    const a = await addPoint(page, p, rows.length + 1);
    const after = await rowsOf(page, 'pt', '점검항목');
    const row = after.find((r) => r['점검항목'] === p[0]);
    note(`점검항목 ${rows.length} → ${after.length}행 (저장 메시지 "${a.msg || '없음'}") / 입력 ${fmt(a.entered)}
목록: ${row ? `점검방법=${row['점검방법']}, 적정기준=${row['적정기준']}` : '행 없음'}`);
    expect(after.length).toBe(rows.length + 1);
    expect.soft(row?.['점검방법']).toBe(p[2]);
    expect.soft(row?.['적정기준']).toBe(p[1]);
  });

  test('AD230_TC_039 표준항목을 선택하여 점검항목을 추가한다.', async ({ page }) => {
    // 표준항목선택 팝업은 이 주기에 붙은 표준작업의 점검항목을 보여줌 →
    // 테스트용 표준작업(믹서, [sychoi] High Speed Mixer 정기점검 표준작업)이 없으면 먼저 붙임
    const STD_NO = JSON.parse(fs.readFileSync(path.join('playwright', '.data', 'stdwork.json'), 'utf8')).no as string;
    await openPm(page, state.pmNo!);
    let stds = await rowsOf(page, 'std', '표준작업명');
    let stdNote = `표준작업 ${stds.map((r) => r['표준작업번호']).join(', ')}`;
    if (!stds.some((r) => r['표준작업번호'] === STD_NO)) {
      const a = await addStd(page, stds.map((r) => r['표준작업번호']), '');
      stds = await rowsOf(page, 'std', '표준작업명');
      stdNote += ` → 표준작업 ${a.picked?.['표준작업번호']} ${a.picked?.['표준작업명']} 추가`;
      // 테스트가 넣었던 분석기용 1642 는 이 설비와 맞지 않으므로 Mixer 표준작업이 붙은 뒤 삭제
      if (stds.some((r) => r['표준작업번호'] === STD_NO) && stds.some((r) => r['표준작업번호'] === '1642')) {
        await deleteRow(page, 'std', '표준작업명', '표준작업번호', '1642');
        stdNote += ', 1642(분석기용) 삭제';
      }
    }
    await openPm(page, state.pmNo!);
    const pt = await sub(page, F_PT_LIST);
    const before = (await new Grid(pt, '점검항목').rows()).length;
    await clickButton(pt, '표준항목선택');
    await settle(page, 2500);
    const { lovContentFrame } = await import('../support/dream');
    let picked = '';
    try {
      const lov = await lovContentFrame(page);
      const total = await lov.evaluate(() => (document.body.innerText.match(/Total\s*:\s*[\d,]+\s*\/\s*[\d,]+/g) || []).pop() || '');
      // 주기에 아직 없는 표준점검항목 행을 체크 (같은 항목이 이미 있으면 중복으로 막힐 수 있음)
      const have = (await new Grid(pt, '점검항목').rows()).map((r) => r['점검항목']);
      const lrows = await new Grid(lov, '점검항목').rows();
      const idx = Math.max(0, lrows.findIndex((r) => !have.includes(r['점검항목'])));
      await new Grid(lov, '점검항목').check(idx);
      picked = `"${lrows[idx]?.['점검항목']}" 체크`;
      await clickButton(lov, '선택');
      await settle(page, 1500);
      const okBtn = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
      if (await okBtn.isVisible().catch(() => false)) { await okBtn.click(); picked += ', 확인창 OK'; }
      await settle(page, 2000);
      picked += ` (팝업 ${total})`;
    } catch (e) {
      picked = `팝업에서 고를 데이터 없음: ${String(e).split('\n')[0].slice(0, 80)}`;
      await closeLov(page);
    }
    const msg = await popupMessage(page);
    const after = (await new Grid(await sub(page, F_PT_LIST), '점검항목').rows()).length;
    note(`${stdNote}
표준항목선택: ${picked}, 메시지 "${msg || '없음'}", 점검항목 ${before} → ${after}행`);
    expect(after).toBeGreaterThan(before);
  });

  test('AD230_TC_040 점검항목의 기준값을 수정한다.', async ({ page }) => {
    await openPm(page, state.pmNo!);
    const pt = await sub(page, F_PT_LIST);
    const rows = await new Grid(pt, '점검항목').rows();
    const target = rows.find((r) => r['점검항목'].startsWith(TAG)) ?? rows[0];
    await new Grid(pt, '점검항목').clickCell('점검항목', target['점검항목']);
    await settle(page, 1500);
    const pd = await detailFrame(page, D.pt);
    const value = '체결 토크 42±2 N·m (분기 재확인)';
    await put(pd.locator('[id="maPmMstrPointDetailDTO.fitBasis"]'), value);
    const msg = await saveForm(page, pd);
    const after = await new Grid(await sub(page, F_PT_LIST), '점검항목').rows();
    const shown = after.find((r) => r['점검항목'] === target['점검항목'])?.['적정기준'];
    note(`"${target['점검항목']}" 적정기준 "${target['적정기준']}" → "${value}" 저장("${msg || '없음'}"), 목록 값 "${shown}"`);
    expect(shown).toBe(value);
  });

  test('AD230_TC_041 점검항목을 삭제한다. (체크O / 체크X)', async ({ page }) => {
    await openPm(page, state.pmNo!);
    let rows = await rowsOf(page, 'pt', '점검항목');
    // 지울 항목을 먼저 하나 더 추가해서, 삭제 후에도 점검항목이 남게 함
    const p = POINTS.find((x) => !rows.some((r) => r['점검항목'] === x[0]))!;
    await addPoint(page, p, rows.length + 1);
    rows = await rowsOf(page, 'pt', '점검항목');
    const pt = await sub(page, F_PT_LIST);
    // 체크 없이 삭제
    await clickButton(pt, '삭제');
    await settle(page, 800);
    // 확인창이 뜨면 아무것도 지우지 않도록 Cancel
    const msgNo = await popupMessage(page);
    const c0 = page.getByText('Cancel', { exact: true }).filter({ visible: true }).first();
    if (await c0.isVisible().catch(() => false)) await c0.click();
    // 방금 추가한 항목만 체크 후 삭제
    const msg = await deleteRow(page, 'pt', '점검항목', '점검항목', p[0]);
    const after = await rowsOf(page, 'pt', '점검항목');
    note(`체크 없이 삭제 → "${msgNo || '(메시지 없음)'}" / "${p[0]}" 체크 삭제 → ${rows.length} → ${after.length}행 ("${msg || '없음'}"), 남은 항목 ${after.map((r) => r['점검항목']).join(', ')}`);
    expect.soft(msgNo).toMatch(/선택/);
    expect(after.length).toBe(rows.length - 1);
    expect(after.length).toBeGreaterThan(0);
  });

  test('AD230_TC_042 첨부문서를 등록하고 삭제한다. (삭제 후 다시 등록)', async ({ page }) => {
    // 문서 제목은 이 주기의 점검 종류에 맞춤 (예: [sychoi] 메인 베어링 윤활 점검 작업표준서)
    const base = `${TAG} ${(state.name ?? '').replace(/^\[sychoi\] High Speed Mixer\([^)]*\) /, '').replace(/ \(.*\)$/, '') || '정기점검'} 작업표준서`;
    await openPm(page, state.pmNo!);
    const before = (await rowsOf(page, 'doc', '제목')).length;
    const a = await addDoc(page, base, 'HighSpeedMixer_점검기준서.txt');
    const rows = await rowsOf(page, 'doc', '제목');
    note(`첨부문서 저장("${a.msg || '없음'}", 파일 ${a.hasFile ? '첨부' : '칸 없음'}) → ${before} → ${rows.length}행 / 입력 ${fmt(a.entered)}`);
    expect(rows.length).toBe(before + 1);
    // 방금 추가한 문서 삭제
    const msg2 = await deleteRow(page, 'doc', '제목', '제목', base);
    const after = (await rowsOf(page, 'doc', '제목')).length;
    // 빈 상태로 두지 않도록 다시 등록
    const again = await addDoc(page, `${base} 개정본`, 'HighSpeedMixer_점검기준서_개정.txt');
    const final = (await rowsOf(page, 'doc', '제목')).length;
    note(`첨부문서 삭제 → ${after}행 ("${msg2 || '없음'}"), 다시 등록("${again.msg || '없음'}") → ${final}행`);
    expect.soft(after).toBe(rows.length - 1);
    expect(final).toBeGreaterThan(0);
  });

  test('AD230_TC_027 TBM 정기점검주기의 일정을 생성한다.', async ({ page }) => {
    const { d } = await openPm(page, state.pmNo!);
    await clickButton(d, '일정생성');
    await settle(page, 800);
    const ok = page.getByText('OK', { exact: true }).first();
    if (await ok.isVisible().catch(() => false)) await ok.click();
    await settle(page, 3000);
    const msg = await popupMessage(page);
    const plans = await readPlans(page, d);
    const byEq: Record<string, string[]> = {};
    for (const p of plans) (byEq[p['설비번호']] ??= []).push(p['작업일자'] || p['점검일자'] || p['초기계획'] || '');
    note(`일정생성 메시지 "${msg || '없음'}", 계획 ${plans.length}건: ${Object.entries(byEq).map(([k, v]) => `${k} [${v.slice(0, 4).join(', ')}${v.length > 4 ? ' …' : ''}] ${v.length}건`).join(' / ')}\n최초작업예정일: ${EQUIP_1}=${state.eq1Date}, ${EQUIP_2}=${state.eq2Date}`);
    expect(plans.length).toBeGreaterThan(0);
    // 지금 설비 목록에 있는 설비마다 계획이 있어야 함 (TC_035 에서 EQUIP_2 를 지운 뒤면 EQUIP_1 만)
    const eqNow = (await rowsOf(page, 'eq', '최초작업예정일')).filter((r) => r['시행여부'] !== 'N').map((r) => r['설비번호']);
    expect.soft(Object.keys(byEq).sort(), '설비별 계획').toEqual([...new Set(eqNow)].sort());
    expect.soft(byEq[EQUIP_1]?.[0], `${EQUIP_1} 첫 일정 = 최초작업예정일`).toBe(state.eq1Date);
    test.info().annotations.push({ type: 'plans', description: JSON.stringify(byEq) });
  });

  test('AD230_EC_009 일정생성을 두 번 실행한다.', async ({ page }) => {
    const { d } = await openPm(page, state.pmNo!);
    const before = await readPlans(page, d);
    await clickButton(d, '일정생성');
    await settle(page, 800);
    const ok = page.getByText('OK', { exact: true }).first();
    if (await ok.isVisible().catch(() => false)) await ok.click();
    await settle(page, 3000);
    const msg = await popupMessage(page);
    const after = await readPlans(page, d);
    const keys = after.map((p) => `${p['설비번호']}|${p['작업일자'] || p['점검일자'] || p['초기계획']}`);
    const dup = keys.length - new Set(keys).size;
    note(`두 번째 일정생성 메시지 "${msg || '없음'}", 계획 ${before.length} → ${after.length}건, 같은 날짜 중복 ${dup}건`);
    expect(dup).toBe(0);
  });

  test('AD230_EC_015 일정생성 후 주기를 변경한다.', async ({ page }) => {
    let { d } = await openPm(page, state.pmNo!);
    const before = await readPlans(page, d);
    ({ d } = await openPm(page, state.pmNo!));
    await put(d.locator('[id="maPmMstrDetailDTO.cycle"]'), '2');
    const msg1 = await saveForm(page, d);
    ({ d } = await openPm(page, state.pmNo!));
    const kept = await readPlans(page, d);
    ({ d } = await openPm(page, state.pmNo!));
    await clickButton(d, '일정생성');
    await settle(page, 800);
    const ok = page.getByText('OK', { exact: true }).first();
    if (await ok.isVisible().catch(() => false)) await ok.click();
    await settle(page, 3000);
    const msg2 = await popupMessage(page);
    ({ d } = await openPm(page, state.pmNo!));
    const regen = await readPlans(page, d);
    const dates = (rows: Record<string, string>[]) => rows.filter((p) => p['설비번호'] === EQUIP_1).map((p) => p['작업일자'] || p['점검일자'] || p['초기계획']).join(', ');
    note(`주기 1→2 월 저장("${msg1 || '없음'}")\n① 저장 직후 계획 ${before.length} → ${kept.length}건 (${EQUIP_1}: ${dates(kept)})\n② 일정생성 다시 실행("${msg2 || '없음'}") 후 ${regen.length}건 (${EQUIP_1}: ${dates(regen)})`);
    expect.soft(kept.length, '주기만 바꾸면 기존 일정 유지').toBe(before.length);
    const d1 = regen.filter((p) => p['설비번호'] === EQUIP_1).map((p) => p['작업일자'] || p['점검일자'] || p['초기계획']).sort();
    if (d1.length >= 2) {
      const m = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7));
      expect.soft(m(d1[1]) - m(d1[0]), '다시 생성한 일정은 2개월 간격').toBe(2);
    }
  });

  test('AD230_TC_028 저장 전에 일정생성을 누른다.', async ({ page }) => {
    const f = await openCond(page);
    await clickButton(f, '생성');
    const d = await waitFrame(page, F_DETAIL);
    await settle(page, 1500);
    await put(d.locator('[id="maPmMstrDetailDTO.description"]'), `${TAG} 저장 전 일정생성 확인`);
    await clickButton(d, '일정생성');
    await settle(page, 800);
    const ok = page.getByText('OK', { exact: true }).first();
    const confirmShown = await ok.isVisible().catch(() => false);
    if (confirmShown) await ok.click();
    await settle(page, 2000);
    const msg = await popupMessage(page);
    note(`저장 전 일정생성 → 확인창 ${confirmShown ? '뜸' : '안 뜸'}, 메시지 "${msg || '(없음)'}"`);
    expect(msg, '저장이 필요하다는 안내').not.toBe('');
  });

  test('AD230_EC_011 주기에 잘못된 값을 넣는다.', async ({ page }) => {
    const f = await openCond(page);
    await clickButton(f, '생성');
    const d = await waitFrame(page, F_DETAIL);
    await settle(page, 1500);
    await fillAllFields(page, d, pmValues(uniqueName()), STAMP);
    const log: string[] = [];
    for (const v of ['0', '-1', '1.5', '가']) {
      await put(d.locator('[id="maPmMstrDetailDTO.cycle"]'), v);
      const shown = await fieldValue(d, 'maPmMstrDetailDTO.cycle');
      const msg = shown === '' ? '(입력 자체가 막힘)' : await saveForm(page, d);
      log.push(`"${v}" → 칸 값 "${shown}", 저장 안내 "${msg || '(없음)'}"`);
    }
    // 이 화면은 저장 성공 안내가 없으므로 다시 열어 실제로 저장됐는지, 주기가 몇으로 남았는지 확인
    const pm = await fieldValue(d, 'maPmMstrDetailDTO.pmNo');
    const exists = await openPm(page, pm).then(() => true).catch(() => false);
    const savedCycle = exists ? await fieldValue(await waitFrame(page, F_DETAIL), 'maPmMstrDetailDTO.cycle') : '';
    if (exists) { remember(pm); state.pmNoEC011 = pm; }
    log.push(exists ? `예방작업번호 ${pm} 이 저장되어 있음, 저장된 주기="${savedCycle}"` : '저장된 주기 없음');
    note(log.join('\n'));
    expect.soft(exists, '잘못된 주기 값으로는 저장되면 안 됨').toBe(false);
  });

  test('AD230_EC_013 작업명 최대 길이와 특수문자를 확인한다.', async ({ page }) => {
    const f = await openCond(page);
    await clickButton(f, '생성');
    const d = await waitFrame(page, F_DETAIL);
    await settle(page, 1500);
    const special = `${uniqueName()} <A&B> "정기" '보완'`;
    await fillAllFields(page, d, { ...pmValues(special) }, STAMP);
    const maxLen = await d.locator('[id="maPmMstrDetailDTO.description"]').getAttribute('maxlength');
    const msg = await saveForm(page, d);
    const pmNo = await fieldValue(d, 'maPmMstrDetailDTO.pmNo');
    remember(pmNo);
    const { d: d2 } = await openPm(page, pmNo);
    const back = await fieldValue(d2, 'maPmMstrDetailDTO.description');
    // 최대 길이: maxlength 가 있으면 그 이상 입력 시도
    const long = '가'.repeat(Number(maxLen || 300) + 20);
    await put(d2.locator('[id="maPmMstrDetailDTO.description"]'), long);
    const typed = (await fieldValue(d2, 'maPmMstrDetailDTO.description')).length;
    const msg2 = await saveForm(page, d2);
    const { d: d3 } = await openPm(page, pmNo);
    const after = await fieldValue(d3, 'maPmMstrDetailDTO.description');
    note(`특수문자 작업명 저장("${msg || '없음'}") → 다시 열었을 때 "${back}" (${back === special ? '같음' : '다름'})\n최대 길이: maxlength=${maxLen ?? '없음'}, ${long.length}자 입력 시도 → 칸에 ${typed}자, 저장 안내 "${msg2 || '(없음)'}", 다시 열었을 때 ${after.length}자 (${after === back ? '이전 값 그대로 = 저장 안 됨' : after.length === typed ? '전부 저장됨' : '잘려서 저장됨'})`);
    expect.soft(after === back && !msg2, '긴 값이 저장되지 않으면 안내가 있어야 함').toBe(false);
    expect.soft(back).toBe(special);
    expect.soft(/오류|exception|error/i.test(msg2), '긴 값 저장 시 시스템 오류가 나면 안 됨').toBe(false);
  });

  test('AD230_EC_008 시행여부 N 의 일정생성을 확인한다.', async ({ page }) => {
    test.setTimeout(420_000);
    // 이미 만든 미시행 주기가 있으면 다시 만들지 않음
    let pmNo = state.pmNoN ?? '';
    if (!pmNo) {
    const f = await openCond(page);
    await clickButton(f, '생성');
    const d = await waitFrame(page, F_DETAIL);
    await settle(page, 1500);
    await fillAllFields(page, d, { ...pmValues(`${uniqueName()} (미시행)`), 'maPmMstrDetailDTO.isActiveDesc': 'N' }, STAMP);
    await saveForm(page, d);
    pmNo = await fieldValue(d, 'maPmMstrDetailDTO.pmNo');
    remember(pmNo);
    state.pmNoN = pmNo;
    await openPm(page, pmNo);
    const eq = await sub(page, F_EQ_LIST);
    await clickButton(eq, '생성');
    await settle(page, 1500);
    const { lovContentFrame, pickInLov } = await import('../support/dream');
    await pickInLov(page, await lovContentFrame(page), EQUIP_1, '설비번호');
    const ed = await detailFrame(page, D.eq);
    await put(ed.locator('[id="workPmListEquipDetailDTO.initWrkDate"]'), dateAfter(7));
    await saveForm(page, ed);
    }
    let { d: d2 } = await openPm(page, pmNo);
    await clickButton(d2, '일정생성');
    await settle(page, 800);
    const ok = page.getByText('OK', { exact: true }).first();
    if (await ok.isVisible().catch(() => false)) await ok.click();
    await settle(page, 3000);
    const msg = await popupMessage(page);
    ({ d: d2 } = await openPm(page, pmNo));
    const plans = await readPlans(page, d2);
    note(`예방작업번호 ${pmNo} (시행여부 N) 일정생성 → 메시지 "${msg || '없음'}", 계획 ${plans.length}건`);
    expect(plans.length).toBe(0);
  });

  test('AD230_EC_016 일정이 생성된 정기점검주기를 삭제한다.', async ({ page }) => {
    // 예방작업(주기)은 절대 삭제하지 않는다는 규칙: 삭제 확인창이 뜨면 [Cancel]을 누르고 미수행으로 기록
    const { f } = await openPm(page, state.pmNo!);
    const g = new Grid(f, '예방작업번호');
    const rows = await g.rows();
    await g.check(rows.findIndex((r) => r['예방작업번호'] === state.pmNo));
    await clickButton(f, '삭제');
    await settle(page, 1000);
    const blockedMsg = await popupMessage(page);
    const cancel = page.getByText('Cancel', { exact: true }).first();
    const confirmShown = await cancel.isVisible().catch(() => false);
    if (confirmShown) await cancel.click();
    await settle(page, 1000);
    if (blockedMsg) {
      note(`삭제 버튼 → 확인창 전에 막힘: "${blockedMsg}"`);
      expect(blockedMsg).not.toBe('');
    } else {
      note('삭제 확인창이 떠서 [Cancel] — 실제 삭제 위험이 있어 미수행 (예방작업 삭제 금지 규칙)');
      test.info().annotations.push({ type: '미수행', description: '삭제 확인창까지 진행됨. 삭제 금지 규칙으로 OK를 누르지 않음' });
      test.skip(true, '삭제 금지 규칙으로 미수행');
    }
  });

  test('AD230_TC_037 표준작업을 추가하고 삭제한다. (삭제 후 다시 추가)', async ({ page }) => {
    await openPm(page, state.pmNo!);
    const existing = await rowsOf(page, 'std', '표준작업명');
    const before = existing.length;
    // 이미 붙어 있는 표준작업(예: TC_039 의 1683)은 빼고 다른 표준작업을 추가
    const a1 = await addStd(page, existing.map((r) => r['표준작업번호']), '');
    const mid = (await rowsOf(page, 'std', '표준작업명')).length;
    let afterDel = mid;
    let dmsg = '';
    if (a1.picked && mid > before) {
      dmsg = await deleteRow(page, 'std', '표준작업명', '표준작업번호', a1.picked['표준작업번호']);
      afterDel = (await rowsOf(page, 'std', '표준작업명')).length;
    }
    // 지운 뒤 목록이 비었으면 다시 추가 (비지 않게)
    const a2 = afterDel === 0 ? await addStd(page, [], '') : { picked: null as null | Record<string, string> };
    const final = (await rowsOf(page, 'std', '표준작업명')).length;
    note(`추가: ${a1.picked ? `${a1.picked['표준작업번호']} ${a1.picked['표준작업명']}` : '-'} ${before} → ${mid}행 ("${a1.msg || '없음'}")
삭제: ${mid} → ${afterDel}행 ("${dmsg || '없음'}")
${a2.picked ? `다시 추가: ${a2.picked['표준작업명']} → ` : '남은 표준작업 '}${final}행`);
    expect.soft(mid).toBe(before + 1);
    expect.soft(afterDel).toBe(mid - 1);
    expect(final).toBeGreaterThan(0);
  });

  test('AD230_TC_035 설비를 삭제한다. (체크O / 체크X)', async ({ page }) => {
    // 테스트가 추가한 두 번째 설비만 삭제, 첫 번째 설비는 남김
    await openPm(page, state.pmNo!);
    const lf = await sub(page, F_EQ_LIST);
    const g = new Grid(lf, '최초작업예정일');
    const rows = await g.rows();
    await clickButton(lf, '삭제');
    await settle(page, 800);
    const noSel = await popupMessage(page);
    const c0 = page.getByText('Cancel', { exact: true }).first();
    if (await c0.isVisible().catch(() => false)) await c0.click();
    await g.check(rows.findIndex((r) => r['설비번호'] === EQUIP_2));
    await clickButton(lf, '삭제');
    await settle(page, 800);
    const ok = page.getByText('OK', { exact: true }).first();
    if (await ok.isVisible().catch(() => false)) await ok.click();
    await settle(page, 1500);
    const msg = await popupMessage(page);
    const after = await new Grid(await sub(page, F_EQ_LIST), '최초작업예정일').rows();
    note(`체크 없이 삭제 → "${noSel || '(메시지 없음)'}" / ${EQUIP_2} 체크 삭제 → ${rows.length} → ${after.length}행 ("${msg || '없음'}"), 남은 설비 ${after.map((r) => r['설비번호']).join(', ')}`);
    expect.soft(noSel).toMatch(/선택/);
    expect(after.some((r) => r['설비번호'] === EQUIP_2)).toBe(false);
    expect(after.some((r) => r['설비번호'] === EQUIP_1)).toBe(true);
  });});
