import { Page, Frame } from '@playwright/test';
import { settle, clickButton, Grid } from './dream';
import { fillAllFields, saveForm, dateAfter, listFields, put, chooseInLov } from './form';
import { openMenuByPath, listFrame, clickAndCollect, closeAllPopups } from './approval';

// 결재요청(AZ303) — [생성]이 없는 실행 메뉴(순회점검실행·점검Group실행)용 [sychoi] 데이터 흐름
// 주기(Route) 생성 → [일정생성] → 계획 목록에서 [일정발행] → 실행 목록의 작업 상세

export type Chain = {
  cycle: string[]; plan: string[]; exec: string[];
  /** 생성 직후 고르는 팝업(점검Group 종류 등) */
  pre?: (page: Page) => Promise<void>;
  overrides?: Record<string, string | null>;
  /** 라벨 → 값 (예: { '최초작업예정일': '2026-10-27', '근무달력': '기본 달력' }) */
  labels?: Record<string, string | null>;
  nameHeader: string; // 계획·실행 목록에서 작업 이름 열
  listTab?: string; // 계획·실행 화면의 목록 탭 이름
};

const log = (s: string) => { if (process.env.QA_DEBUG) console.log('[chain]', new Date().toISOString().slice(11, 19), s); };

async function clickTabText(page: Page, text?: string) {
  if (!text) return;
  for (const f of page.frames()) {
    const t = f.locator('a.tb_menu:visible', { hasText: new RegExp(`^\\s*${text}\\s*$`) }).first();
    if (await t.isVisible().catch(() => false)) { await t.click(); await settle(page, 2500); return; }
  }
}

/** 주기 생성 → 일정생성. 만든 작업 이름을 돌려줌 */
export async function createCycle(page: Page, c: Chain, stamp: string) {
  await openMenuByPath(page, c.cycle);
  const list = await listFrame(page);
  const before = new Set(page.frames());
  await clickButton(list, '생성');
  await settle(page, 3000);
  if (c.pre) await c.pre(page);
  // 상세: [저장] 버튼과 보이는 입력칸이 있는 detail.do 프레임 (숨은 같은 이름 프레임이 있을 수 있음)
  let det: Frame | undefined;
  for (let i = 0; i < 10 && !det; i++) {
    for (const f of page.frames().reverse().filter((x) => /detail\.do/i.test(x.url()))) {
      const ok = await f.evaluate(() => !!document.querySelector('a.b_save') && [...document.querySelectorAll<HTMLElement>('input[id*="DTO"]')].some((e) => e.offsetWidth > 0)).catch(() => false);
      if (ok) { det = f; break; }
    }
    if (!det) await page.waitForTimeout(1000);
  }
  if (!det) throw new Error('주기 생성 상세가 열리지 않음');
  const name = `[sychoi] AZ303 ${stamp}`;
  // 라벨로 준 값(이름·최초작업예정일·근무달력 등)을 칸 id 로 바꿈
  const byLabel: Record<string, string | null> = { ...(c.labels ?? {}) };
  const ov: Record<string, string | null> = { ...(c.overrides ?? {}) };
  for (const f of await listFields(det)) {
    if (f.label in byLabel) ov[f.id] = byLabel[f.label];
    if (!f.readonly && f.kind === 'text' && /점검명|작업명/.test(f.label) && !(f.id in ov)) ov[f.id] = name;
  }
  const fl = await listFields(det);
  log(`주기 상세 ${det.name()} 칸 ${fl.map((f) => `${f.label}${f.readonly ? '(ro)' : ''}`).join(',')}`);
  const filled = await fillAllFields(page, det, ov, 'AZ303');
  // 읽기전용이지만 돋보기로 고르는 칸(근무달력명 등)
  for (const f of fl) if (f.readonly && f.kind === 'lov' && byLabel[f.label] && !(await det.locator(`[id="${f.id}"]`).inputValue())) {
    await chooseInLov(page, det, f.id, byLabel[f.label]!);
    log(`${f.label} Lov 에서 ${byLabel[f.label]}`);
  }
  const nameField = Object.entries(filled).find(([, v]) => v.value === name) ?? Object.entries(filled).find(([, v]) => v.value.startsWith('[sychoi]'));
  const msg = await saveForm(page, det);
  log(`주기 저장 "${msg}" ${nameField?.[1].value}`);
  await closeAllPopups(page);
  const gen = await clickAndCollect(page, det, '일정생성');
  log(`일정생성 ${gen.join(' / ')}`);
  await closeAllPopups(page);
  return { name: nameField?.[1].value ?? name, how: `주기 생성 "${nameField?.[1].value}" [저장] "${msg || '안내 없음'}" → [일정생성] "${gen.join(' / ') || '안내 없음'}"` };
}

/** 계획 목록에서 이름이 같은 작업 체크 → [일정발행] */
export async function issuePlan(page: Page, c: Chain, name: string) {
  await openMenuByPath(page, c.plan);
  await clickTabText(page, c.listTab);
  const list = await listFrame(page);
  await widen(page, list, name);
  const rows = await new Grid(list, c.nameHeader).rows();
  const mine = rows.filter((r) => r[c.nameHeader] === name);
  log(`계획 ${mine.length}건: ${mine.map((r) => Object.values(r).slice(1, 5).join(' ')).join(' / ')}`);
  if (!mine.length) return `계획 목록에 "${name}" 없음 (전체 ${rows.length}행)`;
  await list.locator('div.gridbox:visible .objbox tr:visible', { hasText: name }).first().locator('img[src*="item_chk"]').first().click();
  await settle(page, 800);
  const btn = (await list.locator('a.b_schedcomplete:visible, a.b_exesched:visible').count()) ? (await list.locator('a.b_schedcomplete:visible').count() ? 'a.b_schedcomplete' : 'a.b_exesched') : '';
  if (!btn) return '일정발행 버튼 없음';
  const msgs = await clickAndCollect(page, list, (await list.locator(`${btn}:visible`).first().innerText()).trim());
  return `계획 ${mine.length}건 중 1건 [일정발행] "${msgs.join(' / ') || '안내 없음'}"`;
}

/** 실행 목록에서 이름이 같은 작업 상세 */
export async function openExec(page: Page, c: Chain, name: string): Promise<Frame | undefined> {
  await openMenuByPath(page, c.exec);
  await clickTabText(page, c.listTab);
  const list = await listFrame(page);
  await widen(page, list, name);
  const rows = await new Grid(list, c.nameHeader).rows();
  log(`실행 목록 ${rows.filter((r) => r[c.nameHeader] === name).length}건`);
  if (!rows.some((r) => r[c.nameHeader] === name)) return undefined;
  await new Grid(list, c.nameHeader).clickCell(c.nameHeader, name, { dbl: true });
  await settle(page, 3500);
  return page.frames().reverse().find((f) => /detail\.do/i.test(f.url()) && f !== list);
}

/** 목록 검색 기간을 지난 7일 ~ 앞 60일로 넓히고 검색 */
async function widen(page: Page, list: Frame, name?: string) {
  const fields = await listFields(list);
  const nameF = fields.find((f) => /^(점검명|작업명)$/.test(f.label) && !f.readonly);
  if (name && nameF) await put(list.locator(`[id="${nameF.id}"]`), name);
  const dates = fields.filter((f) => f.kind === 'date' && !f.readonly);
  if (dates[0]) await put(list.locator(`[id="${dates[0].id}"]`), dateAfter(-7));
  if (dates[1]) await put(list.locator(`[id="${dates[1].id}"]`), dateAfter(60));
  await clickButton(list, '검색').catch(() => {});
  await settle(page, 2500);
}

export const today = () => dateAfter(0);

/**
 * 순회점검계획 [일정추가] 팝업으로 [sychoi] Route 의 오늘 일정을 직접 추가
 * (Route [일정생성] 으로는 점검 항목이 없으면 일정이 안 생김)
 */
export async function addPatrolPlan(page: Page, c: Chain, routeName: string) {
  const { lovContentFrame, pickInLov } = await import('./dream');
  await openMenuByPath(page, c.plan);
  await clickTabText(page, c.listTab);
  const list = await listFrame(page);
  await clickButton(list, '일정추가');
  await settle(page, 3000);
  const pop = page.frames().find((f) => /lovWorkPlanPmiPatrolCreate/.test(f.url()))!;
  const fields = await listFields(pop);
  const no = fields.find((f) => f.label === '점검기준번호')!;
  await pop.locator(`[id="${no.id}"]`).locator('xpath=..').locator('p.open_spop').click({ timeout: 5_000 }).catch(() => {});
  await settle(page, 2000);
  await pickInLov(page, await lovContentFrame(page), routeName, '점검명');
  await settle(page, 1500);
  // 행추가 → 새 행 계획일자 = 오늘
  await clickButton(pop, '행추가');
  await settle(page, 1000);
  const set = await pop.evaluate((d) => {
    const w = window as any;
    const g = Object.keys(w).map((k) => { try { return w[k]; } catch { return null; } }).find((o) => o && typeof o.getColType === 'function' && typeof o.getRowsNum === 'function');
    if (!g) return 'grid 없음';
    const col = [...Array(g.getColumnsNum())].findIndex((_, i) => g.getColLabel(i) === '계획일자');
    const id = g.getRowId(g.getRowsNum() - 1);
    g.cells(id, col).setValue(d);
    g.cells(id, col).cell.wasChanged = true;
    return `${g.getRowsNum()}행, 계획일자 ${g.cells(id, col).getValue()}`;
  }, dateAfter(0));
  const msgs = await clickAndCollect(page, pop, '일정추가');
  await closeAllPopups(page);
  return `순회점검계획 [일정추가] 팝업: 점검기준 "${routeName}", ${set} → [일정추가] "${msgs.join(' / ') || '안내 없음'}"`;
}
