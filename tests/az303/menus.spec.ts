import { test, expect, Page, Frame } from '@playwright/test';
import { settle, clickButton, Grid, lovContentFrame, escapeRe, pickInLov } from '../support/dream';
import { put, fillAllFields, saveForm, dateAfter, chooseInLov, listFields } from '../support/form';
import { approvalMenus, ApprovalMenu } from '../support/approval-menus';
import {
  openMenuByPath, listFrame, openApproval, setApprover, requestApproval, approveInInbox, flowPhasesOf, detailWithApproval, closeAllPopups, clickAndCollect, confirmOk,
} from '../support/approval';
import { note, keep, state } from '../support/az303-data';
import { EQ_NO, SITE, DATA_DIR } from '../support/site';
import fs from 'fs';
import path from 'path';

const EVID = path.join(DATA_DIR, 'evidence');

// 결재요청(AZ303) — 결재 메뉴 27개에서 [sychoi] 문서로 승인요청 → 결재대기 승인까지 (메뉴 하나 = 케이스 하나, AZ303_TC_026~052)
// 문서 준비: 기본은 목록 [생성] → 칸 채우기 → [저장]. 메뉴마다 다른 준비는 PREPARE 에.
// 결재요청 팝업 제목을 "[sychoi] AZ303 <코드> <시각>" 으로 바꿔 결재요청내역·결재대기에서 찾음.
// 결재자는 로그인 사용자(최신영)만 (2026-10-26 사용자 요청).

test.setTimeout(900_000);
const ME = '최신영';
const only = process.env.AZ303_ONLY?.split(',');
const stamp = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(5, 16).replace('T', ' ');

type Prepared = { detail: Frame; how: string } | { skip: string };

/** 기본 준비: 목록 [생성] → (생성 전에 고르는 팝업이 있으면 pre) → 보이는 칸 채우기 → [저장] → [승인요청] 이 보이는 상세 */
type Opt = { overrides?: Record<string, string | null>; pre?: (page: Page) => Promise<string> };
async function createGeneric(page: Page, m: ApprovalMenu, opt: Opt = {}): Promise<Prepared> {
  await openMenuByPath(page, m.path);
  const list = await listFrame(page);
  const before = new Set(page.frames());
  await clickButton(list, '생성');
  await settle(page, 3000);
  const preNote = opt.pre ? await opt.pre(page) : '';
  // 상세: [저장] 버튼과 보이는 입력칸이 있는 detail.do 프레임 (새로 생긴 것 먼저, 숨은 같은 이름 프레임은 뺌)
  let det: Frame | undefined;
  for (let i = 0; i < 8 && !det; i++) {
    const cands = page.frames().filter((f) => /detail\.do/i.test(f.url()) && f !== list).reverse();
    for (const f of [...cands.filter((x) => !before.has(x)), ...cands.filter((x) => before.has(x))]) {
      const ok = await f.evaluate(() => !!document.querySelector('a.b_save') && [...document.querySelectorAll<HTMLElement>('input[id*="DTO"], textarea[id*="DTO"]')].some((e) => e.offsetWidth > 0 && !(e as HTMLInputElement).readOnly)).catch(() => false);
      if (ok) { det = f; break; }
    }
    if (!det) await page.waitForTimeout(1000);
  }
  // 로그시트등록처럼 [저장]이 나중에 생기는 상세: 새로 생긴 detail.do 프레임
  det ??= page.frames().reverse().find((f) => /detail\.do/i.test(f.url()) && f !== list && !before.has(f));
  if (!det) throw new Error('생성 상세 화면이 열리지 않음');
  const filled = await fillAllFields(page, det, opt.overrides ?? {}, 'AZ303');
  const msg = await saveForm(page, det);
  await settle(page, 1500);
  // 고르지 못한 Lov 가 남아 있으면 [승인요청]을 가림 → 닫음
  await closeAllPopups(page);
  const d = await detailWithApproval(page);
  if (!d) throw new Error(`저장 후 [승인요청] 버튼 없음 (저장 안내 "${msg || '없음'}", 입력 ${Object.values(filled).map((x) => `${x.label}=${x.value}`).join(', ').slice(0, 300)})`);
  return { detail: d, how: `${preNote}[생성] → 칸 채움 → [저장] "${msg || '안내 없음'}"` };
}

/** 열린 선택 팝업에서 글자가 같은 셀들을 차례로 누르고 [선택] */
async function pickInPopup(page: Page, texts: string[]) {
  const lov = await lovContentFrame(page);
  // 글자마다 i 번째 그리드에서 고름 (작업종류·작업형태 둘 다 "정기수리" 처럼 글자가 같을 수 있음)
  for (const [i, t] of texts.entries()) {
    await lov.locator('div.gridbox:visible').nth(i).locator('.objbox td:visible', { hasText: new RegExp(`^\\s*${escapeRe(t)}\\s*$`) }).first().click();
    await page.waitForTimeout(600);
  }
  await clickButton(lov, '선택');
  await settle(page, 3000);
  return `[생성] 팝업에서 ${texts.join(' + ')} 선택 → `;
}

/** 결재완료된 [sychoi] 변경접수를 열고 하위 탭(아코디언)의 [생성] → 칸 채움 → [저장] */
async function mocChild(page: Page, tab: string, frameRe: RegExp): Promise<Prepared> {
  await openMenuByPath(page, ['변경관리', '변경접수']);
  for (const f of page.frames()) { const t = f.getByText('목록(조건)', { exact: true }).first(); if (await t.isVisible().catch(() => false)) { await t.click(); await settle(page, 2500); break; } }
  const list = await listFrame(page);
  const g = new Grid(list, '변경작업명');
  const row = (await g.rows()).find((r) => r['변경작업명'].startsWith('[sychoi]') && r['결재진행상태'] === '결재완료');
  if (!row) throw new Error('결재완료된 [sychoi] 변경접수 없음 (변경접수 케이스를 먼저 실행)');
  await list.locator('div.gridbox:visible .objbox tr:visible', { hasText: row['변경요청#'] }).first().locator('td:visible').nth(3).dblclick();
  await settle(page, 3500);
  let det: Frame | undefined;
  for (const f of page.frames().filter((x) => /mocRecDetail/.test(x.name()))) if (await f.locator('.ac_menu:visible', { hasText: tab }).count()) det = f;
  if (!det) throw new Error(`변경접수 상세에 ${tab} 탭 없음`);
  // 하위 탭은 아코디언: 이미 펼쳐져 있으면 누르면 접힘 → [생성]이 안 보일 때만 누름. 같은 이름 프레임이 여럿일 수 있어 [생성]이 보이는 것
  const visibleSub = async () => {
    for (const f of page.frames().filter((x) => frameRe.test(x.name()))) if (await f.locator('a.b_create:visible').count().catch(() => 0)) return f;
    return undefined;
  };
  let sub = await visibleSub();
  for (let i = 0; i < 3 && !sub; i++) {
    await det.locator('.ac_menu:visible', { hasText: tab }).first().click();
    await settle(page, 2000);
    sub = await visibleSub();
  }
  if (!sub) throw new Error(`${tab} 목록에 [생성] 버튼이 보이지 않음`);
  const before = new Set(page.frames());
  await clickButton(sub, '생성');
  await settle(page, 3000);
  // 하위 목록에서 [생성]하면 그 아래에 상세 프레임이 새로 생김 (예: mocRecCmteeList → mocRecCmteeDetail)
  const key = (sub.name().match(/TAB\.(\w+?)List_/) || [])[1] ?? '';
  const child = page.frames().reverse().find((f) => /detail\.do/i.test(f.url()) && (!before.has(f) || (key && f.name().includes(`${key}Detail`))));
  if (!child) throw new Error(`${tab} [생성] 상세가 열리지 않음`);
  await fillAllFields(page, child, {}, 'AZ303');
  const msg = await saveForm(page, child);
  await settle(page, 1500);
  await closeAllPopups(page);
  const d = await detailWithApproval(page);
  if (!d) throw new Error(`${tab} 저장 후 [승인요청] 버튼 없음 (저장 안내 "${msg || '없음'}")`);
  return { detail: d, how: `결재완료 [sychoi] 변경접수 #${row['변경요청#']} → ${tab} [생성] → 칸 채움 → [저장] "${msg || '안내 없음'}"` };
}

/**
 * 기존 작업 사용 (2026-10-27 사용자: 실행 메뉴 3개는 기존 건으로). 담당자가 로그인 사용자인 작업발행 건을 열고,
 * [승인요청](또는 결재요청)이 숨겨져 있고 [확정]만 보이면 [확정] 후 다시 열어 요청
 */
async function existingWork(page: Page, path: string[], tab: string, nameH: string, ownerH: string, statusH: string, confirmFirst = false): Promise<Prepared> {
  await openMenuByPath(page, path);
  for (const f of page.frames()) { const t = f.locator('a.tb_menu:visible', { hasText: new RegExp(`^\s*${escapeRe(tab)}\s*$`) }).first(); if (await t.isVisible().catch(() => false)) { await t.click(); await settle(page, 2500); break; } }
  const list = await listFrame(page);
  const rows = await new Grid(list, nameH).rows();
  // 후보 순서: 내 작업발행 → 내 작업 → 작업완료 → 작업발행 (상세에 [승인요청]이 보이는 첫 건)
  const score = (r: Record<string, string>) => (r[ownerH] === ME ? 0 : 2) + (r[statusH] === '작업발행' ? 0 : r[statusH] === '작업완료' ? 1 : 3);
  const cands = rows.map((r, i) => ({ r, i })).sort((x, y) => score(x.r) - score(y.r)).slice(0, 6);
  const tried: string[] = [];
  for (const { r, i } of cands) {
    await list.locator('div.gridbox:visible .objbox tr:visible').filter({ has: list.locator('td') }).nth(i).locator('td:visible').nth(3).dblclick().catch(() => {});
    await settle(page, 3500);
    let d = await detailWithApproval(page);
    let conf = '';
    if (!d && confirmFirst && r[ownerH] === ME) {
      // 점검Group실행은 [확정] 해야 [결재요청]이 보임 (2026-10-28 사용자)
      let det: Frame | undefined;
      for (const f of page.frames()) if (/detail\.do/i.test(f.url()) && (await f.locator('a.b_confirm:visible').count().catch(() => 0))) det = f;
      if (det) {
        const msgs = await clickAndCollect(page, det, '확정');
        await confirmOk(page).catch(() => {});
        await settle(page, 3000);
        await closeAllPopups(page);
        d = await detailWithApproval(page);
        conf = ` → [확정] "${msgs.join(' / ') || '안내 없음'}"`;
      }
    }
    tried.push(`${r[nameH]}(${r[statusH]}, ${r[ownerH]})${conf ? ' 확정' : ''}${d ? ' ✓' : ''}`);
    if (d) return { detail: d, how: `기존 작업 "${r[nameH]}" (${statusH} ${r[statusH]}, ${ownerH} ${r[ownerH]}) 상세${conf}` };
  }
  throw new Error(`${path.at(-1)} 기존 작업 상세에 [승인요청] 없음 — 확인한 건: ${tried.join(' / ')}`);
}

/**
 * 점검Group실행 (2026-10-28 사용자 B안): 내 담당 건이 없어 다른 담당자의 작업발행 건 한 건만 사용.
 * 설비별점검항목마다 점검값(기준값) 입력·저장 → 상세 [확정] → [결재요청]이 보이는 상세
 */
async function groupExec(page: Page, path: string[]): Promise<Prepared> {
  await openMenuByPath(page, path);
  for (const f of page.frames()) { const t = f.locator('a.tb_menu:visible', { hasText: /^\s*목록\s*$/ }).first(); if (await t.isVisible().catch(() => false)) { await t.click(); await settle(page, 2500); break; } }
  const list = await listFrame(page);
  const rows = await new Grid(list, '점검명').rows();
  const score = (r: Record<string, string>) => (r['담당자(실행)'] === ME ? 0 : 1) + (r['일정상태'] === '작업발행' ? 0 : 5);
  const pick = rows.map((r, i) => ({ r, i })).sort((x, y) => score(x.r) - score(y.r))[0];
  if (!pick || pick.r['일정상태'] !== '작업발행') throw new Error('점검Group실행 작업발행 건 없음');
  await list.locator('div.gridbox:visible .objbox tr:visible').filter({ has: list.locator('td') }).nth(pick.i).locator('td:visible').nth(3).dblclick();
  await settle(page, 3500);
  const ready = await detailWithApproval(page);
  const who = `기존 작업 "${pick.r['점검명']}" (작업발행, 담당자 ${pick.r['담당자(실행)']})`;
  if (ready) return { detail: ready, how: `${who} 상세 (이미 확정)` };
  // 점검항목 목록 프레임: 점검값 열이 있는 보이는 그리드
  let pl: Frame | undefined;
  for (const f of page.frames()) if (/PointList/i.test(f.name()) && (await f.locator('div.gridbox:visible').count().catch(() => 0))) pl = f;
  if (!pl) throw new Error(`설비별점검항목 목록 없음 (프레임: ${page.frames().map((f) => f.name()).filter(Boolean).join(', ')})`);
  const pts = await new Grid(pl, '점검항목').rows();
  const log: string[] = [];
  for (const [k, p] of pts.entries()) {
    const before = new Set(page.frames());
    await pl.locator('div.gridbox:visible .objbox tr:visible').filter({ has: pl.locator('td') }).nth(k).locator('td:visible').nth(6).click();
    await settle(page, 2500);
    let pd: Frame | undefined;
    for (const f of page.frames()) if (await f.locator('[id$=".resultValue"]:visible').count().catch(() => 0)) pd = f;
    // 판정값 항목은 점검값 칸 없이 점검결과(기본 정상)만 있음 → 그 상세를 그대로 저장
    if (!pd) for (const f of page.frames()) if (/PointDetail/i.test(f.name()) && !/Photo/i.test(f.name()) && (await f.locator('a.b_save:visible').count().catch(() => 0))) pd = f;
    if (!pd) { log.push(`${p['점검항목']}: 점검값 상세가 안 열림 (새 프레임: ${page.frames().filter((f) => !before.has(f)).map((f) => f.name()).join(', ') || '없음'})`); continue; }
    const v = p['기준값'] || p['하한값'] || '1';
    const hasVal = (await pd.locator('[id$=".resultValue"]:visible').count()) > 0;
    if (hasVal) await put(pd.locator('[id$=".resultValue"]:visible').first(), v);
    const msg = await saveForm(page, pd);
    log.push(`${p['점검항목']}(${p['수치/판정']}): ${hasVal ? `점검값 ${v}` : '점검결과 정상 그대로'} 저장 "${msg || '안내 없음'}"`);
  }
  await closeAllPopups(page);
  let det: Frame | undefined;
  for (const f of page.frames()) if (await f.locator('a.b_confirm:visible').count().catch(() => 0)) det = f;
  if (!det) throw new Error(`[확정] 버튼 없음 — 점검값: ${log.join(' / ')}`);
  const msgs = await clickAndCollect(page, det, '확정');
  await confirmOk(page).catch(() => {});
  await settle(page, 3000);
  await closeAllPopups(page);
  const d = await detailWithApproval(page);
  const how = `${who} → 점검값 ${log.join(' / ')} → [확정] "${msgs.join(' / ') || '안내 없음'}"`;
  if (!d) throw new Error(`확정 후 [결재요청] 없음 — ${how}`);
  return { detail: d, how };
}

/** 기존 데이터 상세의 [개정] → (Revision 팝업이 뜨면 채우고 저장) → [승인요청]이 보이는 상세 */
async function revise(page: Page, what: string): Promise<Prepared> {
  // 앞 실행에서 개정만 하고 요청하지 못한 건이면 이미 [승인요청]이 보임 → 바로 요청
  const ready = await detailWithApproval(page);
  if (ready) return { detail: ready, how: `${what} (이미 개정 중) 상세` };
  let det: Frame | undefined;
  for (const f of page.frames()) if (await f.locator('a.b_revision:visible').count().catch(() => 0)) det = f;
  if (!det) throw new Error(`${what} 상세에 [개정] 버튼 없음`);
  const msgs = await clickAndCollect(page, det, '개정');
  await settle(page, 2000);
  const pop = await revisionPopup(page);
  await closeAllPopups(page);
  let d = await detailWithApproval(page);
  if (!d) {
    // 개정 후 상세가 수정 가능해지면 바뀐 칸이 없어도 [저장] 후 [승인요청]이 나올 수 있음
    for (const f of page.frames()) if (await f.locator('a.b_save:visible').count().catch(() => 0) && /detail\.do/i.test(f.url())) { await saveForm(page, f); break; }
    await closeAllPopups(page);
    d = await detailWithApproval(page);
  }
  if (!d) throw new Error(`${what} [개정] "${msgs.join(' / ')}" ${pop} 후 [승인요청] 버튼 없음`);
  return { detail: d, how: `${what} 상세 [개정] "${msgs.join(' / ') || '안내 없음'}" → ${pop}` };
}

/** "Revision 제정" 팝업: 비어 있는 칸을 [sychoi] 값으로 채우고 [저장] */
async function revisionPopup(page: Page) {
  const pop = page.frames().find((f) => /popupIframe/.test(f.name()) && /Rev/.test(f.url()));
  if (!pop) return '';
  // 이름(설비명·계측기명)은 [sychoi] 로, 부모 설비 Lov(선택 칸)는 위치 트리라 건너뜀
  const ov: Record<string, string | null> = { 'commRevCommonDTO.parentEquipDesc': null, 'commRevCommonDTO.description': `[sychoi] 제개정 ${stamp()}` };
  const filled = await fillAllFields(page, pop, ov, stamp().replace(/\D/g, ''));
  const msgs = await clickAndCollect(page, pop, '저장');
  await settle(page, 3000);
  return `Revision 팝업 (${Object.values(filled).map((x) => `${x.label}=${x.value}`).join(', ').slice(0, 150)}) [저장] "${msgs.join(' / ') || '안내 없음'}" → `;
}

// [sychoi] 정기점검주기의 설비 (oracle 100302AG13, mssql 은 site-data.json). 설비 Lov 는 첫 칸이 위치 트리라 설비번호로 고름
const EQ = EQ_NO;
// 제개정 설정을 켠 사이트 (2026-10-27 사용자가 oracle·mssql 모두 켬). 끈 사이트가 생기면 AZ303_CONFIG_ON 에서 빼기
const CONFIG_ON = (process.env.AZ303_CONFIG_ON ?? 'mssql').split(',').filter(Boolean);
const NO_REV_SAVE = '결정 필요: 제개정 설정 Y 에서 [생성] → "Revision 제정" 팝업에 저장 버튼이 보이지 않아 Revision 을 시작할 수 없음 (기존 상세는 읽기전용, [승인요청] 숨김)';
const NO_CONFIG = '결정 필요: 제개정 설정(TACONFIG)이 N 이라 [승인요청] 버튼이 나오지 않음. 테스트하려면 설정을 잠시 Y 로 바꿔야 함';

const PREPARE: Record<string, (page: Page, m: ApprovalMenu) => Promise<Prepared>> = {
  // 제개정(설비·계측기·점검주기): 제개정 설정(TACONFIG)이 Y 일 때만 [승인요청]. oracle·mssql 모두 2026-10-27 사용자가 Y 로 켬
  // 원본 설비를 고치지 않도록 [sychoi] 설비·계측기·주기를 새로 만들어 요청
  // 설정 Y 이면 기존 상세는 읽기전용([승인요청]·[저장] 숨김) → [생성] → "Revision 제정" 팝업에서 [sychoi] 로 제정 → 상세 → 요청
  // (2026-10-27 처음엔 팝업에 저장 버튼이 없었고, 사용자가 버튼 권한을 열어 줌)
  // 설비 상세: 상위설비 Lov 는 위치 트리라 건너뜀, 폐기일자는 넣지 않음, 관리자(부) Lov 는 부서 필터로 최신영이 안 보여 건너뜀
  // 제정: [생성] → Revision 제정 팝업 저장 → [sychoi] 상세 칸 채움·저장 → [승인요청] (2026-10-27 빌드 후 다시 확인)
  // 설비 상세: 상위설비 Lov 는 위치 트리라 건너뜀, 폐기일자 안 넣음, 관리자(부) Lov 는 부서 필터로 최신영이 안 보여 건너뜀, 정렬값은 숫자
  EQUIPREV: (page, m) => createGeneric(page, m, { pre: revisionPopup, overrides: { 'maEqMstrDetailDTO.parentEquipDesc': null, 'maEqMstrDetailDTO.disusedDate': null, 'maEqMstrDetailDTO.subMngName': null, 'maEqMstrDetailDTO.ordNo': '10' } }),
  // 계측기 상세: 관리자(정) Lov 는 관리부서로 걸러져 → 관리부서를 QA팀으로 (그래야 최신영이 보임)
  EQTLREV: (page, m) => createGeneric(page, m, { pre: revisionPopup, overrides: { 'maEqMstrDetailDTO.deptDesc': 'QA팀', 'maEqMstrDetailDTO.parentEquipDesc': null, 'maEqMstrDetailDTO.disusedDate': null } }),
  PMINSREV: (page, m) => createGeneric(page, m, { pre: revisionPopup }),
  // 개정: 기존 데이터 상세 [개정] (기존 데이터 사용은 사용자 허락 2026-10-27)
  EQUIPREV_REV: async (page, m) => {
    // 기존 데이터 개정 (사용자 허락): 목록 위에서부터 [개정]이나 [승인요청]이 보이는 첫 건
    await openMenuByPath(page, m.path);
    const list = await listFrame(page);
    const rows = await new Grid(list, '설비번호').rows();
    for (const row of rows.slice(0, 6)) {
      await new Grid(list, '설비번호').clickCell('설비번호', row['설비번호'], { dbl: true });
      await settle(page, 3500);
      let ok = !!(await detailWithApproval(page));
      for (const f of page.frames()) if (await f.locator('a.b_revision:visible').count().catch(() => 0)) ok = true;
      if (ok) return revise(page, `기존 설비 ${row['설비번호']} ${row['설비명']}`);
    }
    throw new Error('기존 설비 상세에 [개정]·[승인요청]이 보이는 건 없음 (위 6건)');
  },

  // 2026-10-27 사용자: 생성 말고 기존 데이터 개정으로 (계측기는 기존 원본 계측기 1개 — 사용자 허락)
  EQTLREV_REV: async (page, m) => {
    // 기존 데이터 개정 (사용자 허락): 목록 위에서부터 [개정]이나 [승인요청]이 보이는 첫 건
    await openMenuByPath(page, m.path);
    const list = await listFrame(page);
    const rows = await new Grid(list, '계측기번호').rows();
    for (const row of rows.slice(0, 6)) {
      await new Grid(list, '계측기번호').clickCell('계측기번호', row['계측기번호'], { dbl: true });
      await settle(page, 3500);
      let ok = !!(await detailWithApproval(page));
      for (const f of page.frames()) if (await f.locator('a.b_revision:visible').count().catch(() => 0)) ok = true;
      if (ok) return revise(page, `기존 계측기 ${row['계측기번호']} ${row['계측기명']}`);
    }
    throw new Error('기존 계측기 상세에 [개정]·[승인요청]이 보이는 건 없음 (위 6건)');
  },

  // 정기점검주기 제개정: [생성] 의 "Revision 제정" 팝업에 저장 버튼이 없어 새 주기를 못 만듦 → 이미 있는 [sychoi] 주기(oracle 8007) 상세에서 요청
  PMINSREV_REV: async (page) => {
    const { openPm } = await import('../support/pmi');
    const { PM_NO } = await import('../support/site');
    await openPm(page, PM_NO);
    return revise(page, `기존 [sychoi] 정기점검주기 ${PM_NO}`);
  },
  // [생성]이 없거나 다른 메뉴의 일정·결재 흐름을 거쳐야 [승인요청]이 생기는 메뉴 (2026-10-27, 데이터 준비 방법 확인 중)
  PMIGRPRSLT: (page, m) => groupExec(page, m.path),
  PTRLRESULT: (page, m) => existingWork(page, m.path, '목록', '점검명', '담당자(실행)', '점검상태'),
  // 정기점검실행: [sychoi] 정기점검주기의 작업발행 점검작업 상세에 [승인요청] (작업완료 상세에는 없음). 없으면 오늘 날짜로 만듦 (AP591 부품)
  // 점검값이 비어 있으면 "점검값을 모두 입력해주십시오." → 점검값을 먼저 넣음
  PMINSRSLT: async (page) => {
    const { myWorks, openWork, ensureWork, fillPoints } = await import('../support/pmexec-data');
    let issued = (await myWorks(page)).mine.find((r) => r['점검작업상태'] === '작업발행');
    let how = '';
    if (!issued) { how = `${await ensureWork(page, dateAfter(0))} → `; issued = (await myWorks(page)).mine.find((r) => r['점검작업상태'] === '작업발행'); }
    await openWork(page, issued!['점검일자']);
    await fillPoints(page);
    const { d } = await openWork(page, issued!['점검일자']);
    return { detail: d, how: `${how}[sychoi] 점검작업 ${issued!['점검일자']} (작업발행) 점검값 입력 → 상세` };
  },
  // 정기수리계획에는 [생성]이 없어 수리작업실행에서 작업종류·작업형태 정기수리로 [sychoi] 작업을 만듦 (같은 상세 화면)
  // 결재요청을 부른 화면에 따라 업무구분이 정해짐 (수리작업실행에서 요청하면 "작업결과") → 정기수리계획 화면에서 기존 작업으로 요청 (2026-10-27 사용자)
  WOPLAN: (page, m) => existingWork(page, m.path, '기간(조건)', '작업명', '담당자(계획)', '일정상태'),
  // 변경위원회·변경작업: 결재완료된 [sychoi] 변경접수 상세의 하위 탭(변경위원회 / 변경작업항목)에서 [생성]
  MOCCMTEE: (page) => mocChild(page, '변경위원회', /mocRecCmteeList/),
  // 탭 이름이 사이트마다 다를 수 있어(oracle 변경작업항목) '변경작업' 으로 찾음
  MOCWORK: (page) => mocChild(page, '변경작업', /mocRecWorkList/),
  // 투자목록: [sychoi] 도입계획 생성(예산년은 연도) → 상태 "작성"에는 [승인요청]이 숨겨져 있어, 투자절차 첫 단계(품의)를 Edit 로 "진행" + 시작일자 오늘로 저장
  INVTLIST: async (page, m) => {
    // 구매절차는 절차(품의 등)가 있는 '기계장치 설비 도입' (mssql 첫 행 test2 는 절차가 없음)
    await createGeneric(page, m, { overrides: { 'invtDetailDTO.planYear': dateAfter(0).slice(0, 4), 'invtDetailDTO.invtDesc': '기계장치 설비 도입' } }).catch((e) => { if (!/승인요청\] 버튼 없음/.test(String(e))) throw e; });
    const det = page.frames().find((f) => /invtDetail_invtList/.test(f.name()))!;
    await det.locator('.ac_menu', { hasText: '투자절차' }).first().click().catch(() => {});
    await settle(page, 1500);
    let ph: Frame | undefined;
    for (let i = 0; i < 10 && !ph; i++) {
      for (const f of page.frames().filter((x) => /invtPhaseList/.test(x.name()))) if (await f.locator('a.b_edit:visible').count().catch(() => 0)) ph = f;
      if (!ph) { await page.frames().find((f) => /invtDetail_invtList/.test(f.name()))?.locator('.ac_menu:visible', { hasText: '투자절차' }).first().click().catch(() => {}); await page.waitForTimeout(1500); }
    }
    if (!ph) throw new Error('투자절차 [Edit] 버튼이 보이지 않음');
    await clickButton(ph, 'Edit');
    await settle(page, 1500);
    // 진행상태 칸: 더블클릭 → 돋보기 → 시스템코드(INVTPHASE_STATUS) Lov 에서 "진행"(P)
    const cell = ph.locator('.objbox tr:visible', { hasText: '품의' }).first().locator('td').nth(3);
    await cell.click();
    await cell.dblclick();
    await settle(page, 1000);
    await cell.locator('p.open_spop').click();
    await settle(page, 2000);
    await pickInLov(page, await lovContentFrame(page), '진행');
    await ph.locator('.hdrcell', { hasText: '정렬값' }).first().click().catch(() => {});
    await settle(page, 800);
    const set = { row: '품의', key: '진행', opts: ['W 대기', 'P 진행', 'C 완료'] };
    const msg = await saveForm(page, ph);
    await settle(page, 1500);
    await closeAllPopups(page);
    // 상세를 다시 열어 상태 확인
    const list = await listFrame(page);
    await clickButton(list, '검색').catch(() => {});
    await settle(page, 2000);
    const rows = await new Grid(list, '도입명').rows();
    const mine = rows.find((r) => r['도입명'].startsWith('[sychoi]'));
    if (mine) { await new Grid(list, '도입명').clickCell('도입명', mine['도입명'], { dbl: true }); await settle(page, 3000); }
    const d = await detailWithApproval(page);
    const st = await page.frames().find((f) => /invtDetail_invtList/.test(f.name()))?.locator('[id="invtDetailDTO.invtlistStatusDesc"]').inputValue().catch(() => '');
    if (!d) throw new Error(`투자절차 ${set.row} 진행상태 ${set.key}(선택지 ${set.opts.join(',')}) 저장 "${msg}" 후 상태 "${st}" — [승인요청] 버튼 없음`);
    return { detail: d, how: `[생성] → 칸 채움 → [저장] → 투자절차 ${set.row} 진행상태 ${set.key} 저장 → 상태 "${st}"` };
  },
  WORKFMEA: (page, m) => createGeneric(page, m, { overrides: { 'workFmeaDetailDTO.equipDesc': EQ } }),
  REQWORK: (page, m) => createGeneric(page, m, { overrides: { 'reqWorkDetailDTO.reqEquipDesc': EQ, 'reqWorkDetailDTO.recDeptDesc': 'QA팀' } }),
  // INVTLIST 생성은 예산년 '2026' 을 넣어야 저장됨: createGeneric(page, m, { overrides: { 'invtDetailDTO.planYear': '2026' } })
  PTREPAIR: (page, m) => createGeneric(page, m, { overrides: { 'maPtRepDetailDTO.equipName': EQ } }),
  MOCREQ: (page, m) => createGeneric(page, m, { overrides: { 'mocReqDTO.equipDesc': EQ } }),
  MOCREC: (page, m) => createGeneric(page, m, { overrides: { 'mocRecDTO.equipDesc': EQ } }),
  // [생성] → 로그시트등록생성 팝업: 로그시트# Lov 에서 첫 로그시트 → [생성] → 상세
  LOGSHEET: (page, m) => createGeneric(page, m, {
    pre: async (p) => {
      const pop = p.frames().find((f) => /popupIframe/.test(f.name()) && f.url().includes('logSheet'))!;
      await chooseInLov(p, pop, 'logSheetResultDTO.pmlslistNo');
      const no = await pop.locator('[id="logSheetResultDTO.description"]').inputValue().catch(() => '');
      // 같은 로그시트#·작성일자는 하나만 → 실행마다 다른 지난 날짜로 (분 단위로 바뀜)
      const day = dateAfter(-(1 + (Math.floor(Date.now() / 60000) % 300)));
      await put(pop.locator('[id="logSheetResultDTO.wkorDate"]'), day);
      // 날짜 칸을 벗어나도 달력이 남아 [생성]을 가림 → 빈 곳(로그시트명 라벨)을 눌러 닫음
      await pop.getByText('로그시트명', { exact: true }).first().click().catch(() => {});
      await p.waitForTimeout(800);
      await pop.locator('[id="CREATE"]').click();
      await settle(p, 3000);
      return `[생성] 팝업에서 로그시트 "${no}"·작성일자 ${day} → `;
    },
  }),
  WORKORDER: (page, m) => createGeneric(page, m, { pre: (p) => pickInPopup(p, ['고장작업', '설비정지']), overrides: { 'maWoResultMstrDetailDTO.equipDesc': EQ } }),
  // 하위작업자동집계 는 Y/N 칸인데 라벨에 '작업자'가 있어 사원으로 오인 → 건너뜀
  OHPLAN: (page, m) => createGeneric(page, m, { pre: (p) => pickInPopup(p, ['설비(일자)']), overrides: { 'workSDPlanDTO.isAutoSumDesc': null, 'workSDPlanDTO.eqlocDesc': null, 'workSDPlanDTO.equipDesc': EQ } }),
};

approvalMenus.forEach((m, i) => {
  const id = `AZ303_TC_${String(26 + i).padStart(3, '0')}`;
  if (only && !only.includes(m.code)) return;
  test(`${id} ${m.name}(${m.code}) 결재요청을 한다.`, async ({ page }) => {
    const p = await (PREPARE[m.code] ?? createGeneric)(page, m);
    if ('skip' in p) {
      test.info().annotations.push({ type: '미수행', description: p.skip });
      test.skip();
      return;
    }
    const { det: pop, grid } = await openApproval(page, p.detail);
    const lines = await new Grid(grid, '결재순서').rows();
    const title = `[sychoi] AZ303 ${m.code} ${stamp()}`;
    await put(pop.locator('[id="appReqDetailDTO.title"]'), title);
    for (const r of lines) if (!r['결재자1']) await setApprover(page, grid, r['결재순서'], 1, ME);
    // 결재자를 바꾼 뒤에는 목록 [저장]을 먼저 해야 함 ("저장후 사용하세요.")
    await clickAndCollect(page, grid, '저장');
    const req = await requestApproval(page, pop);
    // 증적: 요청 후 팝업이 안 닫혔으면 그 화면
    const ev = (n: string) => { fs.mkdirSync(EVID, { recursive: true }); return path.join(EVID, `az303-${m.code}-${n}.png`); };
    if (!req.closed) await page.screenshot({ path: ev('popup-open') }).catch(() => {});
    await closeAllPopups(page);
    keep({ [m.code]: title });

    await openMenuByPath(page, ['개인설정', '결재요청내역']);
    const sent = (await new Grid(await listFrame(page), '제목').rows()).find((r) => r['제목'] === title);
    if (sent && sent['요청타입'] !== m.name) await page.screenshot({ path: ev('type') }).catch(() => {});
    const approved = sent ? await approveInInbox(page, title) : 0;
    await openMenuByPath(page, ['개인설정', '결재요청내역']);
    const after = (await new Grid(await listFrame(page), '제목').rows()).find((r) => r['제목'] === title);
    const { flow, phases } = await flowPhasesOf(page, m.name);
    const a = phases.map((x) => `${x['결재순서']} ${x['필수결재자?']} ${x['결재라인명']}`);
    const b = lines.map((x) => `${x['결재순서']} ${x['필수결재자?']} ${x['결재라인명']}`);
    note(`${p.how}\n결재라인 ${b.join(' / ')} (승인Flow ${flow?.['승인Flow 명'] ?? '없음'}: ${a.join(' / ')})\n[승인요청] 안내 "${req.msgs.join(' / ') || '없음'}", 팝업 닫힘 ${req.closed}\n결재요청내역: ${sent ? `${sent['요청타입']} ${sent['요청상태']}` : '없음'} → 승인 ${approved}번 → ${after?.['요청상태'] ?? '없음'}`);
    expect.soft(b, '결재라인 = 승인Flow').toEqual(a);
    expect.soft(sent?.['요청타입'], '요청타입').toBe(m.name);
    expect.soft(sent?.['요청상태'], '요청 직후 결재요청').toBe('결재요청');
    expect(after?.['요청상태'], '승인 후 결재완료').toBe('결재완료');
  });
});
