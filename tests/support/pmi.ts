import { test, expect, Page, Frame } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { openMenu, waitFrame, clickButton, clickTab, settle, Grid, lovContentFrame, pickInLov } from './dream';
import { fillAllFields, listFields, saveForm, popupMessage, closeLov, Entered, TAG, put, dateAfter } from './form';

// 정기점검주기(AD230) 화면 부품: 상세 열기, 하위 목록(설비·표준작업·점검항목·첨부문서) 추가·삭제

export const F_COND = 'tabFrameTAB.workPmListInsList_workPmiMstr';
export const F_DETAIL = 'tabFrameTAB.workPmListRInsDetail_workPmListInsList';
export const L = {
  eq: 'tabFrameTAB.workPmListRInsEquipList_workPmListRInsDetail',
  std: 'tabFrameTAB.workPmStdPointHdrList_workPmListRInsDetail',
  pt: 'tabFrameTAB.maPmMstrPointList_workPmListRInsDetail',
  doc: 'tabFrameTAB.maPtDocLibList_workPmListRInsDetail',
};
export const D = {
  eq: /^tabFrameTAB\.workPmListRInsEquipDetail_workPmListRInsEquipList$/,
  pt: /^tabFrameTAB\.maPmMstrPoint\w*Detail_maPmMstrPointList$/,
  doc: /^tabFrameTAB\.maPtDocLibDetail_maPtDocLibList$/,
};


// 점검항목: [항목, 적정기준, 점검방법, 하한, 기준, 상한]
export const POINTS = [
  ['[sychoi] 임펠러 체결볼트 토크', '40~45 N·m', '토크렌치로 체결 토크 측정', '40', '42', '45'],
  ['[sychoi] 메인 베어링 표면온도', '70℃ 이하', '적외선 온도계로 운전 중 측정', '0', '50', '70'],
  ['[sychoi] 초퍼 모터 운전전류', '정격 18A 이하', '클램프미터로 무부하 운전 전류 측정', '0', '15', '18'],
  ['[sychoi] 하부 배출밸브 씰 누유', '누유 없음(10mm 이하 번짐)', '배출밸브 하부 육안 확인', '0', '0', '10'],
];

export const log = (s: string) => { if (process.env.QA_DEBUG) console.log('[sub]', new Date().toISOString().slice(11, 19), s); };

export async function openPm(page: Page, pmNo: string) {
  await openMenu(page, ['132', '372', '454']);
  await clickTab(page, '목록(조건)');
  const f = await waitFrame(page, F_COND);
  await f.locator('[id="maPmMstrCommonDTO.filterIsActiveDesc"]').fill('');
  await f.locator('[id="maPmMstrCommonDTO.pmNo"]').fill(pmNo);
  await f.locator('a.b_search:visible').first().click();
  await settle(page, 1500);
  await new Grid(f, '예방작업번호').clickCell('예방작업번호', pmNo);
  const d = await waitFrame(page, F_DETAIL);
  await expect(d.getByText(new RegExp(`정기점검주기설정\\s*:\\s*${pmNo}`))).toBeVisible({ timeout: 15_000 });
  await settle(page, 1500);
  return d;
}

/** 이름이 맞고 입력칸이 보이는 상세 프레임 (같은 이름 계열 프레임이 여럿 있을 수 있음) */
export async function detailFrame(page: Page, re: RegExp): Promise<Frame> {
  let found: Frame | undefined;
  await expect.poll(async () => {
    for (const f of page.frames()) {
      if (!re.test(f.name())) continue;
      const vis = await f.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('input[id*="DTO"], textarea[id*="DTO"]')]
        .some((e) => e.offsetWidth > 0 && !e.readOnly && e.type !== 'hidden')).catch(() => false);
      if (vis) { found = f; return true; }
    }
    return false;
  }, { message: `상세 프레임 ${re}`, timeout: 15_000 }).toBe(true);
  return found!;
}

/** 라벨로 값 지정 → fillAllFields 의 id 지정값으로 바꿈 */
export async function byLabel(scope: Frame, values: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const f of await listFields(scope)) if (!f.readonly && f.label in values) out[f.id] = values[f.label];
  return out;
}

export const rowsOf = async (page: Page, kind: keyof typeof L, header: string) => new Grid(await waitFrame(page, L[kind]), header).rows();
export const fmt = (e: Entered) => Object.values(e).map((x) => `${x.label}=${x.value}`).join(', ');

/** 저장/선택 뒤 뜨는 "저장하시겠습니까?" OK */
export async function confirmOk(page: Page) {
  const ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
  if (await ok.isVisible().catch(() => false)) await ok.click().catch(() => ok.click({ force: true }));
  await settle(page, 1500);
  return popupMessage(page);
}

/** 목록에서 key 열 값이 value 인 행만 체크해서 삭제 */
export async function deleteRow(page: Page, kind: keyof typeof L, header: string, key: string, value: string) {
  return deleteRowWhere(page, kind, header, (r) => r[key] === value, `${key}=${value}`);
}

/** 목록에서 조건에 맞는 첫 행만 체크해서 삭제 */
export async function deleteRowWhere(page: Page, kind: keyof typeof L, header: string, match: (r: Record<string, string>) => boolean, what: string) {
  const lf = await waitFrame(page, L[kind]);
  const g = new Grid(lf, header);
  const rows = await g.rows();
  const idx = rows.findIndex(match);
  if (idx < 0) throw new Error(`삭제할 행 없음: ${what}`);
  await g.check(idx);
  await clickButton(lf, '삭제');
  await settle(page, 800);
  return confirmOk(page);
}

// ---- 목록별 추가 ----

export async function addEquip(page: Page, code: string, date: string, remark: string) {
  await clickButton(await waitFrame(page, L.eq), '생성');
  await settle(page, 1500);
  await pickInLov(page, await lovContentFrame(page), code, '설비번호');
  const ed = await detailFrame(page, D.eq);
  const entered = await fillAllFields(page, ed, { 'workPmListEquipDetailDTO.initWrkDate': date, 'workPmListEquipDetailDTO.remark': remark });
  const msg = await saveForm(page, ed);
  return { entered, msg };
}

export async function addStd(page: Page, exclude: string[], equipName: string) {
  await clickButton(await waitFrame(page, L.std), '생성');
  await settle(page, 2000);
  let lov = await lovContentFrame(page);
  // 목록(조건) 탭에서 전체 표준작업을 불러와, 설비에 맞는 것(Mixer/혼합/믹서)을 우선 고름
  const pop = page.frames().find((x) => x.name() === 'popupIframe1');
  const cond = pop?.getByText('목록(조건)', { exact: true }).first();
  if (cond && (await cond.isVisible().catch(() => false))) {
    await cond.click();
    await settle(page, 1500);
    lov = await lovContentFrame(page);
    await lov.locator('a.b_search:visible').first().click().catch(() => {});
    await settle(page, 2000);
  }
  const g = new Grid(lov, '표준작업명');
  const rows = await g.rows();
  const ok = rows.filter((r) => r['표준작업번호'] && !exclude.includes(r['표준작업번호']) && /적용|^$/.test(r['작성상태'] ?? ''));
  const pick = ok.find((r) => /mixer|믹서|혼합/i.test(`${r['표준작업명']} ${r['설비종류']}`)) ?? ok[0];
  log(`표준작업 후보 ${rows.length}건, 고른 것 ${pick ? `${pick['표준작업번호']} ${pick['표준작업명']}` : '없음'}`);
  if (!pick) { await closeLov(page); return { picked: null as null | Record<string, string>, msg: '고를 표준작업 없음' }; }
  await g.check(rows.indexOf(pick));
  await clickButton(lov, '선택');
  await settle(page, 1500);
  const msg = await confirmOk(page);
  return { picked: pick, msg };
}

export async function addPoint(page: Page, p: string[], step: number) {
  await clickButton(await waitFrame(page, L.pt), '생성');
  await settle(page, 1500);
  // 생성하면 수치/판정 선택 팝업이 뜸 → 수치값
  const lov = await lovContentFrame(page);
  await lov.locator('div.gridbox:visible .objbox td:visible', { hasText: /^\s*수치값\s*$/ }).first().click();
  await clickButton(lov, '선택');
  await settle(page, 2000);
  const pd = await detailFrame(page, D.pt);
  const over = await byLabel(pd, { '점검순서': String(step), '점검항목': p[0], '적정기준': p[1], '점검방법': p[2], '하한값': p[3], '기준값': p[4], '상한값': p[5] });
  const entered = await fillAllFields(page, pd, { ...over, 'maPmMstrPointDetailDTO.remark': '정기점검 시 함께 확인' });
  const msg = await saveForm(page, pd);
  return { entered, msg };
}

export async function addDoc(page: Page, title: string, fileName: string) {
  await clickButton(await waitFrame(page, L.doc), '생성');
  await settle(page, 1500);
  const dd = await detailFrame(page, D.doc);
  const file = test.info().outputPath(fileName);
  fs.writeFileSync(file, `${title.replace('[sychoi] ', '')}\n1. 임펠러 체결 상태\n2. 베어링 이상음·온도\n3. 배출밸브 씰 누유\n4. 안전 인터록 작동\n`);
  const fi = dd.locator('input[type=file]').first();
  const hasFile = (await fi.count()) > 0;
  if (hasFile) await fi.setInputFiles(file);
  const over = await byLabel(dd, { '제목': title });
  const entered = await fillAllFields(page, dd, over);
  const msg = await saveForm(page, dd);
  return { entered, msg, hasFile };
}

// ---- 주기 만들기·일정 조회 공용 ----

const CREATED = path.join('playwright', '.data', 'pmi-created.json');
const NAMES = path.join('playwright', '.data', 'pmi-names.json');
const STAMP = new Date().toISOString().slice(5, 16).replace(/[-T:]/g, '');

/** 테스트가 만든 예방작업번호 기록 (삭제하지 않음) */
export function remember(pmNo: string) {
  const list: string[] = fs.existsSync(CREATED) ? JSON.parse(fs.readFileSync(CREATED, 'utf8')) : [];
  if (!list.includes(pmNo)) list.push(pmNo);
  fs.mkdirSync(path.dirname(CREATED), { recursive: true });
  fs.writeFileSync(CREATED, JSON.stringify(list));
}

/** 정기점검 종류: 작업명 뒤에 붙는 이름, 비고(점검 내용), 예상작업시간(분) — 붙이는 설비(High Speed Mixer)에 맞는 실제 점검 */
export const PM_KINDS: { kind: string; remark: string; minutes: string }[] = [
  { kind: '임펠러·초퍼 체결 상태 점검', remark: '임펠러·초퍼 체결볼트 풀림, 블레이드 손상 여부 확인', minutes: '40' },
  { kind: '메인 베어링 윤활 점검', remark: '메인 베어링 그리스 보충, 운전 중 온도·이상음 확인', minutes: '30' },
  { kind: '구동 V벨트 장력 점검', remark: 'V벨트 장력·마모 상태, 풀리 정렬 확인', minutes: '30' },
  { kind: '배출밸브 씰 누유 점검', remark: '배출밸브 O-ring·가스켓 상태, 하부 누유 흔적 확인', minutes: '25' },
  { kind: '주전동기 절연저항 측정', remark: '메가테스터로 주전동기 절연저항 측정 (1MΩ 이상 정상)', minutes: '45' },
  { kind: '안전 인터록 작동 점검', remark: '뚜껑 개방 시 정지 인터록, 비상정지 버튼 작동 확인', minutes: '20' },
  { kind: '진동·소음 측정', remark: '운전 중 베어링 하우징 진동(mm/s)과 이상 소음 측정', minutes: '30' },
  { kind: '쟈켓 냉각수 라인 점검', remark: '냉각수 입·출구 온도 차, 호스·피팅 누수 확인', minutes: '25' },
  { kind: '제어반 단자 조임 점검', remark: '제어반 단자 풀림·발열 흔적, 접지선 체결 확인', minutes: '35' },
  { kind: '분해 세척 정밀점검', remark: '임펠러 분해 세척, 씰·가스켓 교체 필요 여부 판단', minutes: '120' },
  { kind: '스크래퍼 블레이드 마모 점검', remark: '스크래퍼 블레이드 마모량 측정, 보울 내벽 긁힘 확인', minutes: '30' },
  { kind: '공압 실린더 작동 점검', remark: '뚜껑 승강 실린더 작동 속도, 공압 누설 확인', minutes: '25' },
];

/** 실행마다 겹치지 않는 작업명: [sychoi] + 설비 + 점검 종류 (설비는 실제로 붙이는 설비) */
export function uniqueName(equip = 'High Speed Mixer(세종파마텍)'): string {
  const used: string[] = fs.existsSync(NAMES) ? JSON.parse(fs.readFileSync(NAMES, 'utf8')) : [];
  for (const k of PM_KINDS) {
    const name = `${TAG} ${equip} ${k.kind}`;
    if (!used.includes(name)) {
      used.push(name);
      fs.mkdirSync(path.dirname(NAMES), { recursive: true });
      fs.writeFileSync(NAMES, JSON.stringify(used));
      return name;
    }
  }
  return `${TAG} ${equip} 정기점검 ${STAMP}`;
}

/** 작업명에 맞는 비고·예상작업시간을 넣은 PM 기본값 */
export function pmValues(name: string): Record<string, string | null> {
  const k = PM_KINDS.find((x) => name.includes(x.kind));
  return {
    ...PM_VALUES,
    'maPmMstrDetailDTO.description': name,
    ...(k ? { 'maPmMstrDetailDTO.remark': k.remark, 'maPmMstrDetailDTO.predWoTimeMin': k.minutes } : {}),
  };
}

// PM 상세 폼에서 정해 두는 값 (나머지 칸은 fillAllFields 가 채움)
export const PM_VALUES: Record<string, string | null> = {
  // 작업명은 테스트마다 uniqueName() 으로 넣음
  'maPmMstrDetailDTO.isActiveDesc': 'Y',
  'maPmMstrDetailDTO.scheduleTypeDesc': 'TBM',
  'maPmMstrDetailDTO.cycle': '1',
  'maPmMstrDetailDTO.periodTypeDesc': '월 주기',
  'maPmMstrDetailDTO.woResBef': '7',
  'maPmMstrDetailDTO.wrkcalListDesc': '기본 달력',
  'maPmMstrDetailDTO.isReschedDesc': 'N',
  'maPmMstrDetailDTO.predWoTimeMin': '40',
  'maPmMstrDetailDTO.remark': '임펠러 체결 상태, 베어링 이상음, 씰 누유 확인',
};

/** Linked > 점검일정 새 창에서 이 예방작업번호의 계획 목록을 읽습니다. */
export async function readPlans(page: Page, d: Frame) {
  // Linked 메뉴가 펼쳐질 때까지 (한 번에 안 펼쳐지는 경우가 있음)
  const link = d.locator('a.link_pmrinssched');
  for (let i = 0; i < 3 && !(await link.isVisible().catch(() => false)); i++) {
    await clickButton(d, 'Linked');
    await page.waitForTimeout(1000);
  }
  const winP = page.context().waitForEvent('page', { timeout: 15_000 });
  await link.click();
  const win = await winP;
  await settle(win, 3000);
  // 새 창은 일정조정 일자가 '지난달 1일 ~ 오늘'로 걸려 있어 앞으로의 계획이 안 보임 → 오늘-30일 ~ 1년 뒤로 넓혀 다시 검색
  const range = win.locator('div.field', { has: win.locator('label', { hasText: /^\s*일정조정 일자\s*$/ }) }).locator('input:visible');
  if ((await range.count()) >= 2) {
    await put(range.nth(0), dateAfter(-30));
    await put(range.nth(1), dateAfter(400));
    await win.locator('a.b_search:visible').first().click();
    await settle(win, 3000);
  }
  let rows: Record<string, string>[] = [];
  for (let i = 0; i < 10 && !rows.length; i++) {
    for (const fr of win.frames()) {
      const has = await fr.evaluate(() => [...document.querySelectorAll('.hdrcell')].some((h) => (h as HTMLElement).innerText.trim() === '예방작업번호')).catch(() => false);
      if (has) { rows = await new Grid(fr, '예방작업번호').rows(); break; }
    }
    if (!rows.length) await win.waitForTimeout(1000);
  }
  await win.close();
  return rows;
}
