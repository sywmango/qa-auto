import { test, expect, Page, Frame } from '@playwright/test';
import fs from 'fs';
import { openMenu, waitFrame, clickButton, clickTab, settle, Grid, lovContentFrame, pickInLov, escapeRe } from './support/dream';
import { fillAllFields, listFields, saveForm, popupMessage, closeLov, dateAfter, Entered } from './support/form';

// 테스트로 만든 정기점검주기(8001, 8004)의 하위 목록 확인
// 목록마다: 기본 항목이 없으면 하나 추가 → 추가 항목 하나 더 추가(행 +1 확인) → 그 추가 항목만 삭제(행 -1 확인)
// 규칙: 테스트가 추가한 항목만 삭제, 하위 목록은 비지 않게 1건 이상 남김, 예방작업 자체는 삭제하지 않음

const F_COND = 'tabFrameTAB.workPmListInsList_workPmiMstr';
const F_DETAIL = 'tabFrameTAB.workPmListRInsDetail_workPmListInsList';
const L = {
  eq: 'tabFrameTAB.workPmListRInsEquipList_workPmListRInsDetail',
  std: 'tabFrameTAB.workPmStdPointHdrList_workPmListRInsDetail',
  pt: 'tabFrameTAB.maPmMstrPointList_workPmListRInsDetail',
  doc: 'tabFrameTAB.maPtDocLibList_workPmListRInsDetail',
};
const D = {
  eq: /^tabFrameTAB\.workPmListRInsEquipDetail_workPmListRInsEquipList$/,
  pt: /^tabFrameTAB\.maPmMstrPoint\w*Detail_maPmMstrPointList$/,
  doc: /^tabFrameTAB\.maPtDocLibDetail_maPtDocLibList$/,
};

const PM: Record<string, { equip: string; extraEquip: string; equipName: string }> = {
  '8001': { equip: '100302AG13', extraEquip: '100305AG17', equipName: 'High Speed Mixer(세종파마텍)' },
  '8004': { equip: '100305AG17', extraEquip: '100302AG13', equipName: 'High Speed Mixer(금성산기)' },
};

// 점검항목: [항목, 적정기준, 점검방법, 하한, 기준, 상한]
const POINTS = [
  ['[sychoi] 임펠러 체결볼트 토크', '40~45 N·m', '토크렌치로 체결 토크 측정', '40', '42', '45'],
  ['[sychoi] 메인 베어링 표면온도', '70℃ 이하', '적외선 온도계로 운전 중 측정', '0', '50', '70'],
  ['[sychoi] 초퍼 모터 운전전류', '정격 18A 이하', '클램프미터로 무부하 운전 전류 측정', '0', '15', '18'],
  ['[sychoi] 하부 배출밸브 씰 누유', '누유 없음(10mm 이하 번짐)', '배출밸브 하부 육안 확인', '0', '0', '10'],
];

function note(t: string) { test.info().annotations.push({ type: '실제결과', description: t }); }
const log = (s: string) => { if (process.env.QA_DEBUG) console.log('[sub]', new Date().toISOString().slice(11, 19), s); };

async function openPm(page: Page, pmNo: string) {
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
async function detailFrame(page: Page, re: RegExp): Promise<Frame> {
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
async function byLabel(scope: Frame, values: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const f of await listFields(scope)) if (!f.readonly && f.label in values) out[f.id] = values[f.label];
  return out;
}

const rowsOf = async (page: Page, kind: keyof typeof L, header: string) => new Grid(await waitFrame(page, L[kind]), header).rows();
const fmt = (e: Entered) => Object.values(e).map((x) => `${x.label}=${x.value}`).join(', ');

/** 저장/선택 뒤 뜨는 "저장하시겠습니까?" OK */
async function confirmOk(page: Page) {
  const ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
  if (await ok.isVisible().catch(() => false)) await ok.click().catch(() => ok.click({ force: true }));
  await settle(page, 1500);
  return popupMessage(page);
}

/** 목록에서 key 열 값이 value 인 행만 체크해서 삭제 */
async function deleteRow(page: Page, kind: keyof typeof L, header: string, key: string, value: string) {
  const lf = await waitFrame(page, L[kind]);
  const g = new Grid(lf, header);
  const rows = await g.rows();
  const idx = rows.findIndex((r) => r[key] === value);
  if (idx < 0) throw new Error(`삭제할 행 없음: ${key}=${value}`);
  await g.check(idx);
  await clickButton(lf, '삭제');
  await settle(page, 800);
  return confirmOk(page);
}

// ---- 목록별 추가 ----

async function addEquip(page: Page, code: string, date: string, remark: string) {
  await clickButton(await waitFrame(page, L.eq), '생성');
  await settle(page, 1500);
  await pickInLov(page, await lovContentFrame(page), code, '설비번호');
  const ed = await detailFrame(page, D.eq);
  const entered = await fillAllFields(page, ed, { 'workPmListEquipDetailDTO.initWrkDate': date, 'workPmListEquipDetailDTO.remark': remark });
  const msg = await saveForm(page, ed);
  return { entered, msg };
}

async function addStd(page: Page, exclude: string[], equipName: string) {
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

async function addPoint(page: Page, p: string[], step: number) {
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

async function addDoc(page: Page, title: string, fileName: string) {
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

// ---- 테스트 ----

test.describe('정기점검주기 하위 목록', () => {
  test.setTimeout(300_000);

  for (const [pmNo, pm] of Object.entries(PM)) {
    test(`${pmNo} 설비 추가·삭제`, async ({ page }) => {
      const out: string[] = [];
      await openPm(page, pmNo);
      let rows = await rowsOf(page, 'eq', '최초작업예정일');
      if (!rows.some((r) => r['설비번호'] === pm.equip)) {
        const a = await addEquip(page, pm.equip, dateAfter(14), `${pm.equipName} 정기점검 대상 설비`);
        out.push(`기본 설비 ${pm.equip} 추가 ("${a.msg || '없음'}")`);
        rows = await rowsOf(page, 'eq', '최초작업예정일');
      }
      const before = rows.length;
      const a = await addEquip(page, pm.extraEquip, dateAfter(21), '동일 라인 설비 추가 점검 대상');
      const mid = await rowsOf(page, 'eq', '최초작업예정일');
      const row = mid.find((r) => r['설비번호'] === pm.extraEquip);
      out.push(`추가: ${pm.extraEquip} 저장("${a.msg || '없음'}") → ${before} → ${mid.length}행, 목록 최초작업예정일=${row?.['최초작업예정일']} / 입력 ${fmt(a.entered)}`);
      const dm = await deleteRow(page, 'eq', '최초작업예정일', '설비번호', pm.extraEquip);
      const after = await rowsOf(page, 'eq', '최초작업예정일');
      out.push(`삭제: ${pm.extraEquip} ("${dm || '없음'}") → ${mid.length} → ${after.length}행, 남은 설비 ${after.map((r) => r['설비번호']).join(', ')}`);
      note(out.join('\n'));
      expect.soft(mid.length, '추가 후 행 +1').toBe(before + 1);
      expect.soft(row?.['최초작업예정일']).toBe(dateAfter(21));
      expect(after.some((r) => r['설비번호'] === pm.extraEquip), '추가한 설비 삭제됨').toBe(false);
      expect(after.some((r) => r['설비번호'] === pm.equip), '기본 설비 남음').toBe(true);
    });

    test(`${pmNo} 표준작업 추가·삭제`, async ({ page }) => {
      const out: string[] = [];
      await openPm(page, pmNo);
      let rows = await rowsOf(page, 'std', '표준작업명');
      if (!rows.length) {
        const a = await addStd(page, [], pm.equipName);
        out.push(`기본 표준작업 추가: ${a.picked ? `${a.picked['표준작업번호']} ${a.picked['표준작업명']} (${a.picked['설비종류']})` : '-'} ("${a.msg || '없음'}")`);
        rows = await rowsOf(page, 'std', '표준작업명');
      }
      const before = rows.length;
      const a = await addStd(page, rows.map((r) => r['표준작업번호']), pm.equipName);
      const mid = await rowsOf(page, 'std', '표준작업명');
      out.push(`추가: ${a.picked ? `${a.picked['표준작업번호']} ${a.picked['표준작업명']}` : '-'} ("${a.msg || '없음'}") → ${before} → ${mid.length}행`);
      let after = mid;
      if (a.picked && mid.length > before) {
        const dm = await deleteRow(page, 'std', '표준작업명', '표준작업번호', a.picked['표준작업번호']);
        after = await rowsOf(page, 'std', '표준작업명');
        out.push(`삭제: ${a.picked['표준작업번호']} ("${dm || '없음'}") → ${mid.length} → ${after.length}행`);
      }
      note(out.join('\n'));
      expect.soft(mid.length, '추가 후 행 +1').toBe(before + 1);
      expect.soft(after.length, '삭제 후 행 -1').toBe(before);
      expect(after.length, '표준작업 1건 이상 남음').toBeGreaterThan(0);
    });

    test(`${pmNo} 점검항목 추가·삭제`, async ({ page }) => {
      const out: string[] = [];
      await openPm(page, pmNo);
      let rows = await rowsOf(page, 'pt', '점검항목');
      const unused = POINTS.filter((p) => !rows.some((r) => r['점검항목'] === p[0]));
      if (!rows.length) {
        const p = unused.shift()!;
        const a = await addPoint(page, p, 1);
        out.push(`기본 점검항목 "${p[0]}" 추가 ("${a.msg || '없음'}") / 입력 ${fmt(a.entered)}`);
        rows = await rowsOf(page, 'pt', '점검항목');
      }
      const before = rows.length;
      const p = unused.shift()!;
      const a = await addPoint(page, p, before + 1);
      const mid = await rowsOf(page, 'pt', '점검항목');
      out.push(`추가: "${p[0]}" ("${a.msg || '없음'}") → ${before} → ${mid.length}행 / 입력 ${fmt(a.entered)}`);
      const dm = await deleteRow(page, 'pt', '점검항목', '점검항목', p[0]);
      const after = await rowsOf(page, 'pt', '점검항목');
      out.push(`삭제: "${p[0]}" ("${dm || '없음'}") → ${mid.length} → ${after.length}행, 남은 항목 ${after.map((r) => r['점검항목']).join(', ')}`);
      note(out.join('\n'));
      expect.soft(mid.length, '추가 후 행 +1').toBe(before + 1);
      expect(after.some((r) => r['점검항목'] === p[0]), '추가한 항목 삭제됨').toBe(false);
      expect(after.length, '점검항목 1건 이상 남음').toBeGreaterThan(0);
    });

    test(`${pmNo} 첨부문서 추가·삭제`, async ({ page }) => {
      const out: string[] = [];
      const base = `[sychoi] ${pm.equipName} 정기점검 기준서`;
      const extra = `${base} 개정본`;
      await openPm(page, pmNo);
      let rows = await rowsOf(page, 'doc', '제목');
      if (!rows.length) {
        const a = await addDoc(page, base, 'HighSpeedMixer_정기점검기준서.txt');
        out.push(`기본 문서 "${base}" 추가 ("${a.msg || '없음'}", 파일 ${a.hasFile ? '첨부' : '칸 없음'})`);
        rows = await rowsOf(page, 'doc', '제목');
      }
      const before = rows.length;
      const a = await addDoc(page, extra, 'HighSpeedMixer_정기점검기준서_개정.txt');
      const mid = await rowsOf(page, 'doc', '제목');
      out.push(`추가: "${extra}" ("${a.msg || '없음'}", 파일 ${a.hasFile ? '첨부' : '칸 없음'}) → ${before} → ${mid.length}행 / 입력 ${fmt(a.entered)}`);
      const dm = await deleteRow(page, 'doc', '제목', '제목', extra);
      const after = await rowsOf(page, 'doc', '제목');
      out.push(`삭제: "${extra}" ("${dm || '없음'}") → ${mid.length} → ${after.length}행`);
      note(out.join('\n'));
      expect.soft(mid.length, '추가 후 행 +1').toBe(before + 1);
      expect(after.some((r) => r['제목'] === extra), '추가한 문서 삭제됨').toBe(false);
      expect(after.length, '첨부문서 1건 이상 남음').toBeGreaterThan(0);
    });
  }
});

void escapeRe;
