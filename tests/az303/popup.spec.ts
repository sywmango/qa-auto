import { test, expect, Page, Frame } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../support/site';
import { settle, clickButton, Grid, waitFrame, pickInLov, lovContentFrame } from '../support/dream';
import { put, saveForm, popupMessage, dateAfter, loginUserName, listFields, TAG } from '../support/form';
import { openSetting, checkAndClick, closePopups, settingRows, gridHeaders, rowByName, searchLabels } from '../support/setting';
import {
  openMenuByPath, listFrame, openApproval, approverCell, setApprover, clearApprover, confirmOk, requestApproval, approveInInbox, approvalPopup, clickAndCollect,
} from '../support/approval';
import { note, DAY, DAY_FLOW, state, keep, ensureDoc, openDayLog, dayList } from '../support/az303-data';

// 결재요청 팝업(AZ303) 기능 — 일일업무일지 [sychoi] 문서로 확인
// 문서 A: 팝업·결재자 목록·저장·기본결재자·필수결재자 확인, TC_021 에서 요청
// 문서 B: TC_015 기본결재자 불러오기, TC_022~025 요청·결재, EC_005
// 결재자는 로그인 사용자(최신영)만 넣음 (2026-10-26 사용자 요청). 기본결재자설정은 테스트 끝에 원래(비어 있음)대로 되돌림.

test.setTimeout(480_000);
const ME = '최신영';
const HEADERS = ['결재순서', '필수결재자?', '결재라인', '결재구분', '결재라인명', '결재자1', '부서1', '결재자2', '부서2', '결재자3', '부서3', '결재자4', '부서4', '결재자5', '부서5'];

const rowsOf = (grid: Frame) => new Grid(grid, '결재순서').rows();
const brief = (rows: Record<string, string>[]) => rows.map((r) => `${r['결재순서']} ${r['필수결재자?']} ${r['결재라인명']}: ${[1, 2, 3, 4, 5].map((i) => r[`결재자${i}`]).filter(Boolean).join(',') || '(없음)'}`).join(' / ');

async function popupOf(page: Page, key: string) {
  const title = await ensureDoc(page, key);
  const det = await openDayLog(page, title);
  const p = await openApproval(page, det);
  return { title, det, ...p };
}

async function closeApproval(page: Page) {
  await closePopups(page);
  await settle(page, 800);
}

/** 결재자 목록 [저장] → OK → 안내 */
async function saveGrid(page: Page, grid: Frame) {
  return (await clickAndCollect(page, grid, '저장')).join(' / ');
}

/** 결재자 목록 [저장] 후 [기본 결재자로 저장] ("저장후 사용하세요." — 먼저 저장해야 함) */
async function saveDefault(page: Page, grid: Frame) {
  const s = await saveGrid(page, grid);
  const d = (await clickAndCollect(page, grid, '기본 결재자로 저장')).join(' / ');
  return `[저장] "${s || '안내 없음'}" → [기본 결재자로 저장] "${d || '안내 없음'}"`;
}

/** 기본결재자설정 상세의 일일업무일지 결재자들 */
async function defaultApprovers(page: Page) {
  await openMenuByPath(page, ['개인설정', '기본결재자설정']);
  const l = await listFrame(page);
  await new Grid(l, '업무구분').clickCell('업무구분', DAY_FLOW, { dbl: true });
  await settle(page, 3000);
  const f = await waitFrame(page, /persApprWorkflowPhaseSetList/);
  return new Grid(f, '결재순서').rows();
}

/** 기본결재자설정(일일업무일지)의 결재순서 seq 행 상세에서 결재자1 을 name 으로 (빈 글자면 비움) 바꾸고 상세 [저장] */
async function setDefaultApprover(page: Page, seq: string, name: string) {
  await defaultApprovers(page);
  const set = await waitFrame(page, /persApprWorkflowPhaseSetList/);
  await new Grid(set, '결재순서').clickCell('결재순서', seq);
  await settle(page, 2500);
  let df: Frame | undefined;
  for (const f of page.frames()) if (f !== set && (await listFields(f).catch(() => [])).some((x) => x.label === '결재자1')) df = f;
  if (!df) throw new Error('기본결재자 상세(결재자1 칸) 없음');
  const id = (await listFields(df)).find((x) => x.label === '결재자1')!.id;
  if (name) {
    await df.locator(`[id="${id}"]`).locator('xpath=..').locator('p.open_spop').click({ timeout: 5_000 });
    await settle(page, 2000);
    for (const f of page.frames()) await f.evaluate(() => document.querySelectorAll<HTMLElement>('.dhx_popup_dhx_skyblue, .ui-datepicker').forEach((e) => (e.style.display = 'none'))).catch(() => {});
    await pickInLov(page, await lovContentFrame(page), name, '사원명');
    await settle(page, 1000);
  } else await put(df.locator(`[id="${id}"]`), '');
  return saveForm(page, df);
}

/** 승인Flow설정의 일일업무일지 승인순서 */
async function flowPhases(page: Page) {
  await openMenuByPath(page, ['운영기준설정', '승인Flow설정']);
  const l = await listFrame(page);
  const rows = await new Grid(l, '업무구분').rows();
  const flow = rows.find((r) => r['업무구분'] === DAY_FLOW && r['사용여부'] === 'Y') ?? rows.find((r) => r['업무구분'] === DAY_FLOW)!;
  await new Grid(l, '업무구분').clickCell('승인Flow 명', flow['승인Flow 명'], { dbl: true });
  await settle(page, 3000);
  const f = await waitFrame(page, /mgrWorkflowPhaseList/);
  return { flow, phases: await new Grid(f, '결재순서').rows(), frame: f };
}

/** 셀을 더블클릭했을 때 편집 칸(input)이 열리는지 */
async function cellEditable(page: Page, grid: Frame, seq: string, header: string) {
  const cell = await approverCell(grid, seq, header);
  await cell.dblclick();
  await settle(page, 600);
  const yes = (await cell.locator('input, textarea, select').count()) > 0;
  // (Escape 는 결재요청 팝업을 닫으므로 쓰지 않음)
  await grid.locator('.hdrcell', { hasText: '결재순서' }).first().click().catch(() => {});
  await settle(page, 400);
  return yes;
}

/** 문서 상세의 결재자목록 탭(아코디언) 행. 접혀 있으면 펼침 */
async function apprLine(page: Page, det: Frame) {
  const apl = await waitFrame(page, /maAppPrcList_maWoDayRptDetail/);
  const shown = () => apl.evaluate(() => [...document.querySelectorAll<HTMLElement>('div.gridbox')].some((g) => g.offsetWidth > 0)).catch(() => false);
  for (let i = 0; i < 3 && !(await shown()); i++) {
    await det.locator('.ac_menu', { hasText: '결재자목록' }).first().click();
    await settle(page, 1500);
  }
  return new Grid(apl, '결재순서').rows();
}

test.describe('AZ303 결재요청 팝업 (일일업무일지)', () => {
  test('AZ303_TC_001 결재요청 팝업을 연다.', async ({ page }) => {
    const { title, det: pop } = await popupOf(page, 'A');
    const v = {
      reqBy: await pop.locator('[id="appReqDetailDTO.reqByName"]').inputValue(),
      reqByRo: await pop.locator('[id="appReqDetailDTO.reqByName"]').evaluate((e: HTMLInputElement) => e.readOnly),
      date: await pop.locator('[id="appReqDetailDTO.reqDate"]').inputValue(),
      dateRo: await pop.locator('[id="appReqDetailDTO.reqDate"]').evaluate((e: HTMLInputElement) => e.readOnly),
      title: await pop.locator('[id="appReqDetailDTO.title"]').inputValue(),
    };
    const me = await loginUserName(page);
    note(`문서 "${title}" [승인요청] → 신청자 ${v.reqBy}(읽기전용 ${v.reqByRo}), 기안일자 ${v.date}(읽기전용 ${v.dateRo}), 제목 "${v.title}"`);
    expect.soft(v.reqBy).toBe(me);
    expect.soft(v.reqByRo).toBe(true);
    expect.soft(v.date).toBe(dateAfter(0));
    expect.soft(v.dateRo).toBe(true);
    expect(v.title).toBe(title);
  });

  test('AZ303_TC_002 팝업 크기를 확인한다.', async ({ page }) => {
    const { grid } = await popupOf(page, 'A');
    const cell = await approverCell(grid, '1', '결재자1');
    await cell.dblclick();
    await settle(page, 800);
    await cell.locator('p.open_spop').click();
    await settle(page, 2000);
    // 결재요청 팝업 창과 사원 Lov 창의 화면 위치 비교 (메인 화면 기준)
    const boxes = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('iframe[name^="popupIframe"]')]
      .filter((f) => f.offsetWidth > 0).map((f) => { const r = f.getBoundingClientRect(); return { name: f.name, x: r.x, y: r.y, w: r.width, h: r.height }; }));
    fs.mkdirSync(path.join(DATA_DIR, 'evidence'), { recursive: true });
    await page.screenshot({ path: path.join(DATA_DIR, 'evidence', 'az303-TC_002-autocomplete.png') });
    const [app, lov] = boxes;
    note(`팝업 위치: ${boxes.map((b) => `${b.name} ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}`).join(' / ')}`);
    expect(lov, '사원 Lov 가 열림').toBeTruthy();
    expect.soft(lov.x >= app.x - 1 && lov.y >= app.y - 1 && lov.x + lov.w <= app.x + app.w + 1 && lov.y + lov.h <= app.y + app.h + 1, '사원 Lov 가 결재요청 팝업 안').toBe(true);
    // 칸을 누르면 뜨는 사원 목록이 Lov 위에 남는지
    const leftover = await page.frames().reduce(async (acc, f) => (await acc) || (await f.locator('.dhx_popup_dhx_skyblue:visible').count().catch(() => 0)) > 0, Promise.resolve(false));
    if (leftover) note('결재자 칸을 누르면 뜨는 사원 목록(폭 약 87px, 글자 줄바꿈)이 사원 Lov 를 연 뒤에도 Lov 위에 남아 있음');
    await closeApproval(page);
  });

  test('AZ303_TC_003 제목 필수값을 확인한다.', async ({ page }) => {
    const { title, det: pop } = await popupOf(page, 'A');
    await setApprover(page, (await approvalPopup(page)).grid, '2', 1, ME);
    await put(pop.locator('[id="appReqDetailDTO.title"]'), '');
    const r = await requestApproval(page, pop);
    const { rows } = await dayList(page);
    const st = rows.find((x) => x['제목'] === title)?.['상태'];
    note(`제목 비우고 [승인요청] → 안내 "${r.msgs.join(' / ') || '없음'}", 팝업 닫힘 ${r.closed}, 문서 상태 ${st}`);
    expect.soft(r.msgs.join(' '), '필수 안내').toMatch(/필수|입력/);
    expect(st, '요청되지 않음').toBe('작성');
  });

  test('AZ303_TC_004 상세 [저장]으로 제목을 저장한다.', async ({ page }) => {
    const { title, det: pop } = await popupOf(page, 'A');
    const t2 = `${title} 결재`;
    await put(pop.locator('[id="appReqDetailDTO.title"]'), t2);
    const msg = await saveForm(page, pop);
    await closeApproval(page);
    const det = await openDayLog(page, title);
    const { det: pop2 } = await openApproval(page, det);
    const now = await pop2.locator('[id="appReqDetailDTO.title"]').inputValue();
    note(`제목 "${t2}" 저장 "${msg || '안내 없음'}" → 다시 열면 "${now}"`);
    expect(now).toBe(t2);
    // 다음 케이스를 위해 원래 제목으로
    await put(pop2.locator('[id="appReqDetailDTO.title"]'), title);
    await saveForm(page, pop2);
  });

  test('AZ303_TC_005 저장 시 신청자를 본인으로 갱신한다.', async ({ page }) => {
    const { det: pop } = await popupOf(page, 'A');
    await saveForm(page, pop);
    await closeApproval(page);
    const { det: pop2 } = await popupOf(page, 'A');
    const by = await pop2.locator('[id="appReqDetailDTO.reqByName"]').inputValue();
    note(`[저장] 후 다시 열면 신청자 ${by}`);
    expect(by).toBe(await loginUserName(page));
  });

  // 계정이 하나라 본인 계정으로: 결재자 저장 → 다시 열어 [승인요청] → 기안자(신청자) = 본인 (2026-10-28 사용자: 로직 동일, 내 계정으로)
  test('AZ303_TC_006 다른 계정이 저장한 건을 내가 요청하면 신청자가 나로 바뀐다.', async ({ page }) => {
    const title = await ensureDoc(page, 'E', true);
    let { grid } = await openApproval(page, await openDayLog(page, title));
    for (const seq of ['1', '2']) await setApprover(page, grid, seq, 1, ME);
    const saved = await saveGrid(page, grid);
    await closeApproval(page);
    const p2 = await openApproval(page, await openDayLog(page, title));
    const r = await requestApproval(page, p2.det);
    const line = await apprLine(page, await openDayLog(page, title));
    const drafter = line.find((x) => x['결재자구분'] === '기안자');
    note(`${TAG} 일지 "${title}" 결재자 저장 "${saved || '안내 없음'}" → 다시 열어 [승인요청] (팝업 닫힘 ${r.closed})
결재자목록: ${line.map((x) => `${x['결재순서']} ${x['결재자구분']} ${x['결재자']}`).join(' / ')}
(QA 계정이 하나라 본인 계정으로 확인, 2026-10-28 사용자 허락)`);
    expect(drafter?.['결재자'], '신청자(기안자) = 요청한 사람').toBe(await loginUserName(page));
    // 결재대기에서 본인이 승인해 결재완료로 남김
    await approveInInbox(page, title);
  });

  test('AZ303_TC_007 상세 Setting(Field 설정)을 확인한다.', async ({ page }) => {
    const { det: pop } = await popupOf(page, 'A');
    const sf = await openSetting(page, pop, 'search');
    const rows = await settingRows(sf);
    const r = await rowByName(sf, '기안일자');
    note(`Field 설정 ${rows.length}행: ${rows.map((x) => x.slice(1, 4).join(' ')).join(' / ')}`);
    expect(r, 'Field 설정에 기안일자').toBeTruthy();
    await checkAndClick(page, sf, r!.key, 'Hide Fields');
    await closePopups(page);
    const det = await openDayLog(page, state.A);
    const { det: p2 } = await openApproval(page, det);
    const hidden = await searchLabels(p2);
    const sf2 = await openSetting(page, p2, 'search');
    await checkAndClick(page, sf2, r!.key, 'Show Fields');
    await closePopups(page);
    const det3 = await openDayLog(page, state.A);
    const { det: p3 } = await openApproval(page, det3);
    const shown = await searchLabels(p3);
    note(`기안일자 Display N → 화면 라벨 ${hidden.filter(Boolean).join(',')} / 원복 후 ${shown.filter(Boolean).join(',')}`);
    expect.soft(hidden.some((l) => l.includes('기안일자')), 'N 이면 안 보임').toBe(false);
    expect(shown.some((l) => l.includes('기안일자')), '원복하면 보임').toBe(true);
  });

  test('AZ303_TC_008 결재라인을 승인Flow설정대로 불러온다.', async ({ page }) => {
    const { phases, flow } = await flowPhases(page);
    const { grid } = await popupOf(page, 'A');
    const rows = await rowsOf(grid);
    const a = phases.map((p) => [p['결재순서'], p['필수결재자?'], p['결재라인'], p['결재라인명']].join(' '));
    const b = rows.map((p) => [p['결재순서'], p['필수결재자?'], p['결재라인'], p['결재라인명']].join(' '));
    note(`승인Flow ${flow['승인Flow 명']}(사용 ${flow['사용여부']}): ${a.join(' / ')}\n팝업: ${b.join(' / ')}`);
    expect(b).toEqual(a);
  });

  test('AZ303_TC_009 목록 항목을 설계서와 비교한다.', async ({ page }) => {
    const { grid } = await popupOf(page, 'A');
    const h = (await gridHeaders(grid)).filter((x) => x !== 'null');
    note(`머리글: ${h.join(', ')}`);
    expect(h).toEqual(HEADERS);
  });

  test('AZ303_TC_010 목록은 결재자 칸만 편집된다.', async ({ page }) => {
    const { grid } = await popupOf(page, 'A');
    const res: Record<string, boolean> = {};
    for (const h of ['결재순서', '결재라인명', '부서1', '결재자1', '결재자3', '결재자5']) res[h] = await cellEditable(page, grid, '1', h);
    note(`1행 칸 편집 여부: ${Object.entries(res).map(([k, v]) => `${k}=${v ? '편집' : '안 됨'}`).join(', ')}`);
    expect.soft(res['결재순서']).toBe(false);
    expect.soft(res['결재라인명']).toBe(false);
    expect.soft(res['부서1']).toBe(false);
    expect.soft(res['결재자1']).toBe(true);
    expect.soft(res['결재자3']).toBe(true);
    expect(res['결재자5']).toBe(true);
  });

  test('AZ303_TC_011 결재자를 지정한다.', async ({ page }) => {
    const { grid } = await popupOf(page, 'A');
    await setApprover(page, grid, '1', 1, ME);
    const r = (await rowsOf(grid))[0];
    note(`결재자1 = ${r['결재자1']}, 부서1 = ${r['부서1']}`);
    expect.soft(r['결재자1']).toBe(ME);
    expect(r['부서1']).toMatch(/QA팀/);
  });

  test('AZ303_TC_012 목록 [저장]으로 결재자를 저장한다.', async ({ page }) => {
    let { grid } = await popupOf(page, 'A');
    await setApprover(page, grid, '1', 1, ME);
    await setApprover(page, grid, '2', 1, ME);
    const msg = await saveGrid(page, grid);
    await closeApproval(page);
    ({ grid } = await popupOf(page, 'A'));
    const rows = await rowsOf(grid);
    note(`결재자 지정 → [저장] "${msg || '안내 없음'}" → 다시 열기: ${brief(rows)}`);
    expect(rows.map((r) => r['결재자1'])).toEqual([ME, ME]);
  });

  test('AZ303_TC_013 결재자를 지우고 저장한다.', async ({ page }) => {
    let { grid } = await popupOf(page, 'A');
    await clearApprover(page, grid, '1', 1);
    const msg = await saveGrid(page, grid);
    await closeApproval(page);
    ({ grid } = await popupOf(page, 'A'));
    const rows = await rowsOf(grid);
    note(`1행 결재자1 지우고 [저장] "${msg || '안내 없음'}" → 다시 열기: ${brief(rows)}`);
    expect(rows[0]['결재자1']).toBe('');
  });

  test('AZ303_TC_014 [기본 결재자로 저장] 한다.', async ({ page }) => {
    const before = await defaultApprovers(page);
    keep({ defaultBefore: JSON.stringify(before.map((r) => [1, 2, 3, 4, 5].map((i) => r[`결재자${i}`]))) });
    const { grid } = await popupOf(page, 'A');
    await setApprover(page, grid, '1', 1, ME);
    await setApprover(page, grid, '2', 1, ME);
    const first = (await clickAndCollect(page, grid, '기본 결재자로 저장')).join(' / ');
    const msg = await saveDefault(page, grid);
    await closeApproval(page);
    const after = await defaultApprovers(page);
    note(`기본결재자설정(일일업무일지) 전: ${brief(before)}\n저장 전에 [기본 결재자로 저장] → "${first || '안내 없음'}"\n${msg} 후: ${brief(after)}`);
    expect(after.map((r) => r['결재자1'])).toEqual([ME, ME]);
  });

  test('AZ303_TC_015 기본결재자를 기본값으로 불러온다.', async ({ page }) => {
    // 새 문서 B (한 번도 [승인요청]을 열지 않은 문서)
    const title = await ensureDoc(page, 'B', true);
    const det = await openDayLog(page, title);
    const { grid } = await openApproval(page, det);
    const rows = await rowsOf(grid);
    note(`기본결재자 최신영/최신영 저장 상태에서 새 문서 "${title}" [승인요청] → ${brief(rows)}`);
    try {
      expect(rows.map((r) => r['결재자1'])).toEqual([ME, ME]);
    } finally {
      // 기본결재자설정 원복: 결재자를 비우고 [기본 결재자로 저장]
      const orig: string[][] = JSON.parse(state.defaultBefore || '[]');
      if (orig.every((r) => r.every((v) => !v))) {
        for (const seq of ['1', '2']) await clearApprover(page, grid, seq, 1);
        await saveDefault(page, grid);
        await closeApproval(page);
        const back = await defaultApprovers(page);
        note(`원복 후 기본결재자설정: ${brief(back)}`);
        expect.soft(back.every((r) => !r['결재자1']), '기본결재자 원복').toBe(true);
      } else note(`원래 기본결재자가 있어 원복하지 않음(확인 필요): ${state.defaultBefore}`);
    }
  });

  test('AZ303_TC_016 결재자 목록을 Excel 로 받는다.', async ({ page }) => {
    const { grid } = await popupOf(page, 'A');
    // Excel 은 새 창(about:blank)을 열어 내려받음 → 새 창·원래 창 어느 쪽이든 download 를 기다림
    const ctx = page.context();
    const dlP = new Promise<import('@playwright/test').Download>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Excel 내려받기 없음 (30초)')), 30_000);
      const take = (p: Page) => p.on('download', (d) => { clearTimeout(t); resolve(d); });
      take(page);
      ctx.on('page', take);
    });
    await clickButton(grid, 'Excel');
    const dl = await dlP;
    const file = test.info().outputPath(dl.suggestedFilename());
    await dl.saveAs(file);
    const size = fs.statSync(file).size;
    note(`Excel 내려받기: ${dl.suggestedFilename()} (${size} bytes)`);
    expect(size).toBeGreaterThan(0);
  });

  test('AZ303_TC_017 목록 Setting 을 확인한다.', async ({ page }) => {
    let { grid } = await popupOf(page, 'A');
    const sf = await openSetting(page, grid, 'list');
    const r = await rowByName(sf, '결재구분');
    expect(r, '목록 Setting 에 결재구분').toBeTruthy();
    await checkAndClick(page, sf, r!.key, 'Hide Column');
    await closePopups(page);
    ({ grid } = await popupOf(page, 'A'));
    const hidden = await gridHeaders(grid);
    const sf2 = await openSetting(page, grid, 'list');
    await checkAndClick(page, sf2, r!.key, 'Show Column');
    await closePopups(page);
    ({ grid } = await popupOf(page, 'A'));
    const shown = await gridHeaders(grid);
    note(`결재구분 Hide → 머리글 ${hidden.join(',')}\n원복 후 ${shown.join(',')}`);
    expect.soft(hidden.includes('결재구분'), 'Hide 하면 안 보임').toBe(false);
    expect(shown.includes('결재구분'), '원복하면 보임').toBe(true);
  });

  // 승인Flow 에 결재선변경가능 항목이 없어짐 → 결재자 변경은 결재요청 팝업(과 기본결재자설정, TC_019)에서 함 (2026-10-28 사용자)
  test('AZ303_TC_018 결재선변경가능 여부에 따라 결재자 추가·삭제가 된다.', async ({ page }) => {
    let { grid } = await popupOf(page, 'A');
    const before = await rowsOf(grid);
    await setApprover(page, grid, '1', 2, ME);
    const m1 = await saveGrid(page, grid);
    await closeApproval(page);
    ({ grid } = await popupOf(page, 'A'));
    const added = await rowsOf(grid);
    await clearApprover(page, grid, '1', 2);
    const m2 = await saveGrid(page, grid);
    await closeApproval(page);
    ({ grid } = await popupOf(page, 'A'));
    const removed = await rowsOf(grid);
    note(`결재요청 팝업 전: ${brief(before)}
1행 결재자2 = 최신영 추가 → [저장] "${m1 || '안내 없음'}" → 다시 열기: ${brief(added)}
1행 결재자2 삭제 → [저장] "${m2 || '안내 없음'}" → 다시 열기: ${brief(removed)}
(승인Flow설정에 결재선변경가능 항목이 없어 팝업에서 결재자 추가·삭제로 확인)`);
    expect.soft(added[0]['결재자2'], '추가').toBe(ME);
    expect(removed[0]['결재자2'], '삭제').toBe('');
  });

  // 설계서의 결재선(AN110) 메뉴는 지금 "개인설정 > 기본결재자설정" (2026-10-28 사용자)
  test('AZ303_TC_019 결재선(AN110) 같은 업무구분 값을 결재자로 불러온다.', async ({ page }) => {
    const before = await defaultApprovers(page);
    const orig = before.map((r) => [1, 2, 3, 4, 5].map((i) => r[`결재자${i}`]));
    const msgs: string[] = [];
    for (const r of before) msgs.push(await setDefaultApprover(page, r['결재순서'], ME));
    const msg = msgs.join(' / ');
    const saved = await defaultApprovers(page);
    try {
      const title = await ensureDoc(page, 'D', true);
      const det = await openDayLog(page, title);
      const { grid } = await openApproval(page, det);
      const rows = await rowsOf(grid);
      note(`기본결재자설정(일일업무일지) 전: ${brief(before)}
각 결재순서 상세 결재자1 = 최신영 → 상세 [저장] "${msg || '안내 없음'}" → ${brief(saved)}
새 일지 "${title}" [승인요청] → ${brief(rows)}`);
      expect(saved.map((r) => r['결재자1']), '기본결재자설정 저장').toEqual(before.map(() => ME));
      expect(rows.map((r) => r['결재자1']), '결재요청 팝업 결재자1').toEqual(saved.map(() => ME));
      await closeApproval(page);
    } finally {
      // 원복: 원래 비어 있던 칸은 비우고 저장
      for (const [k, r] of before.entries()) if (!orig[k][0]) await setDefaultApprover(page, r['결재순서'], '');
      const back = await defaultApprovers(page);
      note(`원복 후 기본결재자설정: ${brief(back)}`);
      expect.soft(back.map((r) => r['결재자1']), '기본결재자 원복').toEqual(orig.map((o) => o[0]));
    }
  });

  test('AZ303_EC_001 제목 길이 초과를 확인한다.', async ({ page }) => {
    const { title, det: pop } = await popupOf(page, 'A');
    const long = `${title} ` + '가'.repeat(200);
    await put(pop.locator('[id="appReqDetailDTO.title"]'), long);
    const msg = await saveForm(page, pop);
    await closeApproval(page);
    const { det: p2 } = await popupOf(page, 'A');
    const now = await p2.locator('[id="appReqDetailDTO.title"]').inputValue();
    note(`제목 ${long.length}자 [저장] → 안내 "${msg || '없음'}", 다시 열면 ${now.length}자`);
    if (now !== title) { await put(p2.locator('[id="appReqDetailDTO.title"]'), title); await saveForm(page, p2); }
    expect(msg, '길이 초과 안내').toMatch(/길이|초과|byte|바이트|자리/i);
  });

  test('AZ303_EC_002 같은 결재자를 같은 단계에 두 번 넣는다.', async ({ page }) => {
    let { grid } = await popupOf(page, 'A');
    await setApprover(page, grid, '2', 1, ME);
    await setApprover(page, grid, '2', 2, ME);
    const msg = await saveGrid(page, grid);
    await closeApproval(page);
    ({ grid } = await popupOf(page, 'A'));
    const r = (await rowsOf(grid))[1];
    await page.screenshot({ path: path.join(DATA_DIR, 'evidence', 'az303-EC_002-duplicate.png') }).catch(() => {});
    note(`2행 결재자1·2 = 최신영 [저장] → 안내 "${msg || '없음'}", 다시 열면 결재자1 ${r['결재자1']} 결재자2 ${r['결재자2'] || '(빈칸)'}`);
    // 정리: 결재자2 비움
    if (r['결재자2']) { await clearApprover(page, grid, '2', 2); await saveGrid(page, grid); }
    expect(!!msg || !r['결재자2'], '중복 안내 또는 한 명만 저장').toBe(true);
  });

  test('AZ303_EC_003 결재자 칸에 없는 이름을 직접 입력한다.', async ({ page }) => {
    let { grid } = await popupOf(page, 'A');
    const cell = await approverCell(grid, '1', '결재자3');
    await cell.dblclick();
    await settle(page, 600);
    await cell.locator('input').first().fill('없는사람');
    await grid.locator('.hdrcell', { hasText: '결재순서' }).first().click();
    await settle(page, 600);
    const msg = await saveGrid(page, grid);
    await closeApproval(page);
    ({ grid } = await popupOf(page, 'A'));
    const r = (await rowsOf(grid))[0];
    note(`1행 결재자3 에 "없는사람" 입력 → [저장] 안내 "${msg || '없음'}", 다시 열면 결재자3 "${r['결재자3']}"`);
    expect(r['결재자3']).not.toBe('없는사람');
  });

  test('AZ303_EC_004 저장하지 않고 닫으면 반영되지 않는다.', async ({ page }) => {
    let { grid } = await popupOf(page, 'A');
    const before = (await rowsOf(grid))[0]['결재자4'];
    await setApprover(page, grid, '1', 4, ME);
    await closeApproval(page);
    ({ grid } = await popupOf(page, 'A'));
    const now = (await rowsOf(grid))[0]['결재자4'];
    note(`1행 결재자4 = 최신영 지정 → 저장 없이 닫기 → 다시 열면 "${now}" (전 "${before}")`);
    expect(now).toBe(before);
  });

  test('AZ303_TC_020 필수결재자 Y 단계에 결재자가 없으면 요청되지 않는다.', async ({ page }) => {
    const { title, grid, det: pop } = await popupOf(page, 'A');
    for (const seq of ['1', '2']) for (const n of [1, 2, 3, 4, 5]) if ((await rowsOf(grid)).find((r) => r['결재순서'] === seq)?.[`결재자${n}`]) await clearApprover(page, grid, seq, n);
    await setApprover(page, grid, '1', 1, ME);
    // 결재자를 바꾼 뒤 저장하지 않고 [승인요청] 하면 "저장후 사용하세요." → 목록 [저장] 먼저
    const saved = await saveGrid(page, grid);
    const r = await requestApproval(page, pop);
    const { rows } = await dayList(page);
    const st = rows.find((x) => x['제목'] === title)?.['상태'];
    note(`목록 [저장] "${saved || '안내 없음'}"
1단계(N)만 최신영, 2단계(Y) 비우고 [승인요청] → 안내 "${r.msgs.join(' / ') || '없음'}", 문서 상태 ${st}`);
    expect.soft(r.msgs.join(' '), '필수결재자 안내').toMatch(/필수|결재자/);
    expect(st).toBe('작성');
  });

  test('AZ303_TC_021 필수결재자 N 단계에 결재자가 없으면 결재선에서 빠진다.', async ({ page }) => {
    const { title, grid, det: pop } = await popupOf(page, 'A');
    for (const n of [1, 2, 3, 4, 5]) if ((await rowsOf(grid))[0]?.[`결재자${n}`]) await clearApprover(page, grid, '1', n);
    await setApprover(page, grid, '2', 1, ME);
    await saveGrid(page, grid);
    const r = await requestApproval(page, pop);
    const { rows } = await dayList(page);
    const st = rows.find((x) => x['제목'] === title)?.['상태'];
    if (st === '결재요청') keep({ requestedA: title });
    const line = await apprLine(page, await openDayLog(page, title));
    note(`1단계(N) 비우고 2단계(Y) 최신영 [승인요청] → 안내 "${r.msgs.join(' / ') || '없음'}", 상태 ${st}\n결재자목록: ${line.map((x) => `${x['결재순서']} ${x['결재라인']} ${x['결재자구분']} ${x['결재자']}`).join(' / ')}`);
    expect.soft(st).toBe('결재요청');
    expect(line.some((x) => /파트장|과장/.test(x['결재라인'] + x['결재라인명'])), '비운 1단계는 결재선에 없음').toBe(false);
    keep({ requestedA: title });
  });

  test('AZ303_TC_022 승인요청 한다.', async ({ page }) => {
    const { title, grid, det: pop } = await popupOf(page, 'B');
    for (const seq of ['1', '2']) if (!(await rowsOf(grid)).find((r) => r['결재순서'] === seq)?.['결재자1']) await setApprover(page, grid, seq, 1, ME);
    // 저장하지 않고 요청 → 안내 확인 후, 목록 [저장] → 요청
    const unsaved = await requestApproval(page, pop);
    await saveGrid(page, grid);
    const r = await requestApproval(page, pop);
    note(`결재자 지정 후 저장 없이 [승인요청] → "${unsaved.msgs.join(' / ') || '없음'}"`);
    const { rows } = await dayList(page);
    const st = rows.find((x) => x['제목'] === title)?.['상태'];
    note(`결재자 최신영/최신영 [승인요청] → 안내 "${r.msgs.join(' / ') || '없음'}", 팝업 닫힘 ${r.closed}, 문서 상태 ${st}`);
    keep({ requestedB: title });
    expect.soft(r.closed, '팝업 닫힘').toBe(true);
    expect.soft(st).toBe('결재요청');
    expect(r.msgs.join(' '), '"결재요청 되었습니다" 안내').toMatch(/결재요청\s*되었습니다|요청되었습니다/);
  });

  test('AZ303_TC_023 요청 시 신청자·기안일자를 갱신한다.', async ({ page }) => {
    const title = state.requestedB;
    await openMenuByPath(page, ['개인설정', '결재요청내역']);
    const l = await listFrame(page);
    const req = (await new Grid(l, '제목').rows()).find((r) => r['제목'] === title);
    const line = await apprLine(page, await openDayLog(page, title));
    const drafter = line.find((x) => x['결재자구분'] === '기안자');
    note(`결재요청내역: ${JSON.stringify(req ?? '없음')}\n결재자목록: ${line.map((x) => `${x['결재순서']} ${x['결재자구분']} ${x['결재자']}`).join(' / ')}`);
    expect.soft(req?.['요청일자']).toBe(dateAfter(0));
    expect(drafter?.['결재자']).toBe(await loginUserName(page));
  });

  test('AZ303_TC_024 요청 후 화면 상태조건을 적용한다.', async ({ page }) => {
    const det = await openDayLog(page, state.requestedB);
    const btns = await det.evaluate(() => [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.offsetWidth > 0 && a.innerText.trim()).map((a) => a.innerText.trim()));
    const ro = await det.locator(`[id="${DAY}.title"]`).evaluate((e: HTMLInputElement) => e.readOnly || e.disabled);
    note(`결재요청 문서 상세 버튼: ${btns.filter((b) => !/\d$/.test(b)).join(', ')} / 제목 칸 읽기전용 ${ro}`);
    expect.soft(btns.includes('승인요청'), '[승인요청] 없음').toBe(false);
    expect(btns.includes('저장'), '[저장] 없음').toBe(false);
  });

  test('AZ303_TC_025 요청한 건을 결재한다.', async ({ page }) => {
    // 이번에 요청한 A·B + 앞 실행에서 요청만 하고 결재하지 못한 [sychoi] 일지
    await openMenuByPath(page, ['개인설정', '결재대기']);
    const left = (await new Grid(await listFrame(page), '요청일자').rows()).filter((r) => r['제목'].startsWith(TAG) && r['요청타입'] === DAY_FLOW).map((r) => r['제목']);
    const titles = [...new Set([state.requestedA, state.requestedB, ...left].filter(Boolean))];
    const done: string[] = [];
    for (const t of titles) done.push(`${t}: 승인 ${await approveInInbox(page, t)}번`);
    await openMenuByPath(page, ['개인설정', '결재요청내역']);
    const req = (await new Grid(await listFrame(page), '제목').rows()).filter((r) => titles.includes(r['제목']));
    await openMenuByPath(page, ['개인설정', '결재이력']);
    const hist = (await new Grid(await listFrame(page), '요청일자').rows()).filter((r) => titles.includes(r['제목']));
    const { rows } = await dayList(page);
    const st = rows.filter((x) => titles.includes(x['제목'])).map((x) => `${x['제목']}=${x['상태']}`);
    note(`${done.join(' / ')}\n결재요청내역: ${req.map((r) => `${r['제목']}=${r['요청상태']}`).join(', ')}\n결재이력: ${hist.length}건 / 문서 상태: ${st.join(', ')}`);
    expect.soft(req.every((r) => r['요청상태'] === '결재완료') && req.length === titles.length, '결재완료').toBe(true);
    expect.soft(hist.length, '결재이력').toBe(titles.length);
    expect(st.every((s) => /승인완료|결재완료/.test(s))).toBe(true);
  });

  test('AZ303_EC_005 결재가 끝난 문서는 다시 요청할 수 없다.', async ({ page }) => {
    const det = await openDayLog(page, state.requestedB);
    const n = await det.locator('a.b_approval:visible, a.b_apprequest:visible').count();
    note(`결재완료 문서 상세 [승인요청] 버튼 ${n ? '있음' : '없음'}`);
    expect(n).toBe(0);
  });
});
