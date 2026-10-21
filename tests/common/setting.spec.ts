import { test, expect, Page, Frame } from '@playwright/test';
import { settle } from '../support/dream';
import {
  openSetting, openTabSetting, openColSetting, checkAndClick, resetSetting, editSettingRow, editableColumns, settingRowTexts,
  settingRow, settingRows, rowByName, closePopups, listLength, setListLength, stepListLength, gridHeaders, headerWidth, gridBodyHeight, searchLabels, TD,
} from '../support/setting';
import { Screen, FieldTarget, ListTarget, TabTarget } from '../screens/types';
import { AD230 } from '../screens/ad230';
import { AD210 } from '../screens/ad210';
import { AP591 } from '../screens/ap591';

// Setting(사용자정의) 공통 테스트: 화면 정의(tests/screens)를 읽어 메뉴마다 같은 케이스를 만듭니다.
// - Field 설정(검색·상세): 숨기기/보이기, 정렬값, [초기화], Edit 가능 칸, Display 여부와 화면 비교
// - 목록 Setting: 칼럼 숨기기/보이기, 정렬값·너비, 리스트 길이(-/+, 숫자, [초기화]), [초기화], Edit 가능 칸, Background Color
// - Tab 설정: 탭 숨기기 → [초기화] → Edit 로 Y
// 사양 (사용자 확인): Edit 로 바꿀 수 있는 칸은 Display 여부·정렬값(목록은 너비도). 화면표시명·정렬·조회순서 읽기전용, Background Color 없음 = 정상.
//   바꾼 값은 다시 로그인 없이 바로 반영되어야 함. 리스트 길이는 [초기화]로 돌아오지 않음 = 정상. Setting 은 사용자별 저장.
// 바꾼 값은 각 테스트 끝에 원래대로 되돌립니다.
// 실행할 메뉴: RUN_AD230 / RUN_AD210 / RUN_AP591 이 켜진 메뉴만 (run-*.ps1 의 setting 단계)

const SCREENS: Screen[] = [AD230, AD210, AP591].filter((s) => process.env[`RUN_${s.code}`]);

test.describe.configure({ timeout: 240_000 });

const note = (t: string) => test.info().annotations.push({ type: '실제결과', description: t });
/** 보이는 라벨 (빈 라벨 제외) */
const labels = (f: Frame) => searchLabels(f).then((l) => l.filter(Boolean));
const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);

/**
 * anchor 바로 뒤로 옮길 정렬값: anchor 와 다음 행 정렬값 사이의 값 (anchor+1 이 다음 행과 같으면 그 사이가 없으므로 다음 행을 한 칸 밀지 않고 anchor 와 같은 값)
 * rows: 설정 목록 각 행의 보이는 칸 (체크, 정렬값, …)
 */
function orderAfter(rows: string[][], anchorOrder: string, selfOrder: string) {
  const a = Number(anchorOrder);
  const others = rows.map((x) => Number(x[1])).filter((o) => !Number.isNaN(o) && o > a && String(o) !== selfOrder);
  const next = others.length ? Math.min(...others) : a + 10;
  return String(next - a >= 2 ? Math.floor((a + next) / 2) : a);
}

/** 설정 행 찾기 (필드ID·칼럼ID 를 적어 둔 경우 맞는지도 확인) */
async function findRow(f: Frame, name: string, id?: string) {
  const r = await rowByName(f, name);
  expect(r, `${name} 설정 행`).toBeTruthy();
  if (id) expect(r!.key, `${name} 설정 행 ID`).toBe(id);
  return r!;
}

// ---------------- Field 설정 ----------------
function fieldCases(t: FieldTarget) {
  const setting = async (page: Page) => openSetting(page, await t.open(page), 'search');

  if (t.name) test(`${t.tc} ${t.title}: '${t.name}' 필드를 숨기고 다시 보이게 한다.`, async ({ page }) => {
    if (t.timeout) test.setTimeout(t.timeout);
    const name = t.name!;
    expect(await labels(await t.open(page)), '처음엔 보임').toContain(name);
    const r = await findRow(await setting(page), name, t.id);
    try {
      await checkAndClick(page, await setting(page), r.key, 'Hide Fields');
      const hidden = await labels(await t.open(page));
      note(`'${name}'(${r.key}) Display N → ${hidden.includes(name) ? '보임' : '안 보임'}`);
      expect(hidden, '숨긴 필드는 안 보여야 함').not.toContain(name);
    } finally {
      await checkAndClick(page, await setting(page), r.key, 'Show Fields');
    }
    const shown = await labels(await t.open(page));
    note(`Display Y 로 되돌림 → ${shown.includes(name) ? '다시 보임' : '안 보임'}`);
    expect(shown).toContain(name);
  });

  if (t.name && t.anchor) test(`${t.tc} ${t.title}: '${t.name}' 정렬값을 바꾼다.`, async ({ page }) => {
    if (t.timeout) test.setTimeout(t.timeout);
    const name = t.name!, anchor = t.anchor!;
    const before = await labels(await t.open(page));
    const sf = await setting(page);
    const r = await findRow(sf, name, t.id);
    const a = await findRow(sf, anchor);
    const order0 = r.tds[TD.order];
    const newOrder = orderAfter(await settingRows(sf), a.tds[TD.order], order0);
    try {
      await editSettingRow(page, sf, r.key, { [TD.order]: newOrder });
      const after = await labels(await t.open(page));
      note(`'${name}' 정렬값 ${order0} → ${newOrder}(${anchor} ${a.tds[TD.order]} 바로 뒤) → 라벨 '${after.join(', ')}'`);
      expect.soft(after.indexOf(name), `${anchor} 바로 뒤`).toBe(after.indexOf(anchor) + 1);
    } finally {
      await editSettingRow(page, await setting(page), r.key, { [TD.order]: order0 });
    }
    const restored = await labels(await t.open(page));
    note(`되돌림 → ${same(restored, before) ? '원래와 같음' : `다름: ${restored.join(', ')}`}`);
    expect(restored).toEqual(before);
  });

  if (t.name && t.reset) test(`${t.tc} ${t.title}: 초기화하면 기본 필드로 바로 돌아온다.`, async ({ page }) => {
    const name = t.name!;
    const before = await labels(await t.open(page));
    const sf = await setting(page);
    const r = await findRow(sf, name, t.id);
    await checkAndClick(page, sf, r.key, 'Hide Fields');
    const hidden = await labels(await t.open(page));
    await resetSetting(page, await setting(page));
    const after = await labels(await t.open(page));
    note(`'${name}' 숨김(${hidden.includes(name) ? '보임' : '안 보임'}) → [초기화] → ${after.includes(name) ? '바로 다시 보임' : '안 보임'}`);
    if (!after.includes(name)) await checkAndClick(page, await setting(page), r.key, 'Show Fields');
    expect(hidden).not.toContain(name);
    expect(after, '초기화 후 원래 필드').toEqual(before);
  });

  if (t.name && t.editable) test(`${t.tc} ${t.title}: Edit 모드에서 바꿀 수 있는 칸을 확인한다.`, async ({ page }) => {
    const sf = await setting(page);
    const r = await findRow(sf, t.name!, t.id);
    const ed = await editableColumns(page, sf, r.key); // 저장하지 않음
    await closePopups(page);
    const on = Object.entries(ed).filter(([, v]) => v).map(([k]) => k);
    note(`Edit 모드에서 수정 가능한 칸: ${on.join(', ')} (화면표시명 ${ed['화면표시명'] ? '수정 가능' : '읽기전용'})`);
    expect.soft(on.some((k) => /정렬값/.test(k)), '정렬값 수정 가능').toBe(true);
    expect.soft(ed['화면표시명'], '화면표시명 읽기전용 (사양)').toBeFalsy();
  });

  if (t.compare) test(`${t.tc} ${t.title}: Display 여부와 화면을 비교한다.`, async ({ page }) => {
    const f = await t.open(page);
    const shown = await labels(f);
    const rows = (await settingRows(await openSetting(page, f, 'search'))).map((x) => ({ name: x[2], disp: x[3], id: x[4] })).filter((x) => x.id);
    const yNotShown = rows.filter((x) => x.disp === 'Y' && !shown.includes(x.name)).map((x) => `${x.name}(${x.id})`);
    const nShown = rows.filter((x) => x.disp === 'N' && shown.includes(x.name)).map((x) => x.name);
    note(`Field 설정 ${rows.length}행: ${rows.map((x) => `${x.name}=${x.disp}`).join(', ')}\n화면 라벨: ${shown.join(', ')}\nDisplay Y 인데 안 보이는 필드: ${yNotShown.join(', ') || '없음'} / N 인데 보이는 필드: ${nShown.join(', ') || '없음'}`);
    expect.soft(yNotShown, 'Display Y 필드는 화면에 보여야 함').toEqual([]);
    expect.soft(nShown, 'Display N 필드는 화면에 안 보여야 함').toEqual([]);
  });
}

// ---------------- 목록 Setting ----------------
function listCases(t: ListTarget) {
  const setting = async (page: Page, f?: Frame) => {
    const lf = f ?? (await t.open(page));
    return t.single ? openColSetting(page, lf) : openSetting(page, lf, 'list');
  };

  test(`${t.tc} ${t.title}: '${t.col}' 칼럼을 숨기고 다시 보이게 한다.`, async ({ page }) => {
    if (t.timeout) test.setTimeout(t.timeout);
    const f = await t.open(page);
    expect(await gridHeaders(f), '처음엔 보임').toContain(t.col);
    const r = await findRow(await setting(page, f), t.col, t.id);
    try {
      await checkAndClick(page, await setting(page), r.key, 'Hide Column');
      const hidden = await gridHeaders(await t.open(page));
      note(`칼럼 '${t.col}'(${r.key}) Display N → ${hidden.includes(t.col) ? '보임' : '안 보임'}`);
      expect(hidden, '숨긴 칼럼은 안 보여야 함').not.toContain(t.col);
    } finally {
      await checkAndClick(page, await setting(page), r.key, 'Show Column');
    }
    const shown = await gridHeaders(await t.open(page));
    note(`Display Y 로 되돌림 → ${shown.includes(t.col) ? '다시 보임' : '안 보임'}`);
    expect(shown).toContain(t.col);
  });

  if (t.anchor || t.width) test(`${t.tc} ${t.title}: '${t.col}' 칼럼 ${t.anchor ? '정렬값과 ' : ''}너비를 바꾼다.`, async ({ page }) => {
    if (t.timeout) test.setTimeout(t.timeout);
    let f = await t.open(page);
    const before = await gridHeaders(f);
    const width0 = await headerWidth(f, t.col);
    const sf = await setting(page, f);
    const r = await findRow(sf, t.col, t.id);
    const a = t.anchor ? await findRow(sf, t.anchor) : null;
    const order0 = r.tds[TD.order], w0 = r.tds[TD.width];
    const change: Record<number, string> = { [TD.width]: '180' };
    if (a) change[TD.order] = orderAfter(await settingRows(sf), a.tds[TD.order], order0);
    try {
      await editSettingRow(page, sf, r.key, change);
      f = await t.open(page);
      const after = await gridHeaders(f);
      const width1 = await headerWidth(f, t.col);
      note(`'${t.col}' ${a ? `정렬값 ${order0}→${change[TD.order]}(${t.anchor} 바로 뒤), ` : ''}너비 ${w0}→180 → 목록 '${after.slice(0, 6).join(', ')}…', 너비 ${width0}px→${width1}px`);
      if (a) expect.soft(after.indexOf(t.col), `${t.anchor} 바로 뒤`).toBe(after.indexOf(t.anchor!) + 1);
      expect.soft(width1, '너비 180px').toBe(180);
    } finally {
      await editSettingRow(page, await setting(page), r.key, { [TD.order]: order0, [TD.width]: w0 });
    }
    f = await t.open(page);
    expect(await gridHeaders(f), '원래 순서').toEqual(before);
    expect(await headerWidth(f, t.col), '원래 너비').toBe(width0);
  });

  if (t.listLength) test(`${t.tc} ${t.title}: 리스트 길이를 -/+ 버튼과 숫자로 바꾼다.`, async ({ page }) => {
    let f = await t.open(page);
    const h0 = await gridBodyHeight(f);
    await setting(page, f);
    const len0 = await listLength(page);
    const log: string[] = [];
    try {
      await stepListLength(page, '+');
      await stepListLength(page, '+');
      const plus = await listLength(page);
      await stepListLength(page, '-');
      const minus = await listLength(page);
      log.push(`리스트 길이 ${len0} → + 2번 ${plus} → - 1번 ${minus}`);
      expect.soft(Number(plus), '+ 로 증가').toBeGreaterThan(Number(len0));
      expect.soft(Number(minus), '- 로 감소').toBeLessThan(Number(plus));
      const len1 = String(Number(len0) * 2);
      await setListLength(page, len1);
      f = await t.open(page);
      const h1 = await gridBodyHeight(f);
      log.push(`숫자 ${len1} 입력·저장 → 목록 높이 ${h0}px → ${h1}px`);
      expect.soft(h1, '목록 높이가 커짐').toBeGreaterThan(h0 * 1.5);
    } finally {
      await closePopups(page);
      await setting(page);
      await setListLength(page, len0);
    }
    const h2 = await gridBodyHeight(await t.open(page));
    log.push(`되돌림 → 높이 ${h2}px`);
    note(log.join('\n'));
    expect(h2).toBe(h0);
  });

  if (t.listLength) test(`${t.tc} ${t.title}: 리스트 길이를 바꾼 뒤 초기화한다.`, async ({ page }) => {
    let f = await t.open(page);
    const h0 = await gridBodyHeight(f);
    await setting(page, f);
    const len0 = await listLength(page);
    const len1 = String(Number(len0) + 5);
    let after = '';
    try {
      await setListLength(page, len1);
      f = await t.open(page);
      const h1 = await gridBodyHeight(f);
      await resetSetting(page, await setting(page, f));
      after = await listLength(page);
      await closePopups(page);
      const h2 = await gridBodyHeight(await t.open(page));
      note(`리스트 길이 ${len0} → ${len1} 저장 (목록 높이 ${h0}px → ${h1}px) → [초기화] → 리스트 길이 ${after}, 목록 높이 ${h2}px`);
    } finally {
      await closePopups(page);
      await setting(page);
      if ((await listLength(page)) !== len0) await setListLength(page, len0);
      await closePopups(page);
    }
    // 사양 (사용자 확인 2026-10-21): 리스트 길이는 [초기화]로 돌아오지 않음 = 정상
    expect(after, '초기화해도 리스트 길이는 그대로').toBe(len1);
  });

  if (t.reset) test(`${t.tc} ${t.title}: 초기화하면 기본 칼럼으로 바로 돌아온다.`, async ({ page }) => {
    let f = await t.open(page);
    const before = await gridHeaders(f);
    const r = await findRow(await setting(page, f), t.col, t.id);
    await checkAndClick(page, await setting(page), r.key, 'Hide Column');
    f = await t.open(page);
    const hidden = await gridHeaders(f);
    await resetSetting(page, await setting(page, f));
    const after = await gridHeaders(await t.open(page));
    note(`칼럼 '${t.col}' 숨김(${hidden.includes(t.col) ? '보임' : '안 보임'}) → [초기화] → ${after.includes(t.col) ? '바로 다시 보임' : '안 보임'}`);
    if (!after.includes(t.col)) await checkAndClick(page, await setting(page), r.key, 'Show Column');
    expect(hidden).not.toContain(t.col);
    expect(after, '초기화 후 원래 칼럼').toEqual(before);
  });

  if (t.editable) test(`${t.tc} ${t.title}: Edit 모드에서 바꿀 수 있는 칸을 확인한다.`, async ({ page }) => {
    const sf = await setting(page);
    const r = await findRow(sf, t.col, t.id);
    const ed = await editableColumns(page, sf, r.key); // 저장하지 않음
    await closePopups(page);
    const on = Object.entries(ed).filter(([, v]) => v).map(([k]) => k);
    note(`'${t.col}' 행 체크 → Edit → 수정 가능한 칸: ${on.join(', ')}\n정렬 ${ed['정렬'] ? '수정 가능' : '읽기전용'}, 조회순서 ${ed['조회순서'] ? '수정 가능' : '읽기전용'}`);
    expect.soft(on.some((k) => /정렬값/.test(k)), '정렬값 수정 가능').toBe(true);
    expect.soft(ed['정렬'], '정렬(Left/Center/Right) 읽기전용 (사양)').toBeFalsy();
    expect.soft(ed['조회순서'], '조회순서(ASC/DESC) 읽기전용 (사양)').toBeFalsy();
  });

  if (t.editable) test(`${t.tc} ${t.title}: Background Color 설정 칸을 확인한다.`, async ({ page }) => {
    const sf = await setting(page);
    const heads = await sf.evaluate(() => [...document.querySelectorAll<HTMLElement>('.hdrcell')].map((h) => h.innerText.trim()).filter(Boolean));
    // 칼럼 상세보기에 색상 설정이 있는지
    const r = await findRow(sf, t.col, t.id);
    await settingRow(sf, r.key).locator('img[src*="item_chk"]').first().click().catch(() => {});
    await sf.locator('a:visible', { hasText: /^\s*상세보기\s*$/ }).first().click().catch(() => {});
    await settle(page, 2500);
    const texts: string[] = [];
    for (const fr of page.frames()) {
      if (fr.url() === 'about:blank' || !/maGrdUsr|popup/i.test(fr.name() + fr.url())) continue;
      texts.push(await fr.evaluate(() => [...document.querySelectorAll<HTMLElement>('label, .hdrcell, select option')].filter((e) => e.offsetWidth > 0 || e.tagName === 'OPTION').map((e) => e.innerText.trim()).filter(Boolean).join(',')).catch(() => ''));
    }
    await closePopups(page);
    const has = /Background|배경|Color|색/i.test([...heads, ...texts].join(','));
    note(`목록 Setting 칸: ${heads.join(', ')}\n칼럼 상세보기 항목: ${texts.filter(Boolean).join(' / ').slice(0, 300) || '안 열림'}\nBackground Color 설정 ${has ? '있음' : '없음'}`);
    expect(has, 'Background Color 설정 없음 (사양)').toBe(false);
  });
}

// ---------------- Tab 설정 ----------------
function tabCases(t: TabTarget) {
  test(`${t.tc} ${t.title}: '${t.name}' 탭을 숨겼다가 초기화·되돌린다.`, async ({ page }) => {
    if (t.timeout) test.setTimeout(t.timeout);
    const tabSetting = async () => { await openSetting(page, await t.open(page), 'search'); return openTabSetting(page); };
    const rows = await settingRows(await tabSetting());
    const before = await t.shown(page);
    let hidden = true, afterReset = false;
    try {
      await editSettingRow(page, await tabSetting(), t.key, { [TD.tabDisplay]: 'N' });
      hidden = await t.shown(page);
      note(`Tab 설정 행: ${rows.map((x) => x.join(' | ')).join(' / ')}\n'${t.name}'(${t.key}) Display N → ${hidden ? '보임' : '안 보임'}`);
      const tf = await tabSetting();
      await resetSetting(page, tf);
      const shownY = (await settingRowTexts(tf, t.key)).includes('Y');
      afterReset = await t.shown(page);
      note(`[초기화] → 설정 Display ${shownY ? 'Y' : 'N'}, '${t.name}' ${afterReset ? '바로 다시 보임' : '안 보임 (다시 로그인해야 반영)'}`);
    } finally {
      // 같은 로그인 세션에서 되돌림: Edit 로 Y 저장
      await editSettingRow(page, await tabSetting(), t.key, { [TD.tabDisplay]: 'Y' });
    }
    const after = await t.shown(page);
    note(`Edit 로 Display Y 저장 → '${t.name}' ${after ? '보임' : '안 보임'}`);
    expect(before, '처음엔 보임').toBe(true);
    expect.soft(hidden, '숨긴 탭은 안 보여야 함').toBe(false);
    expect.soft(afterReset, '초기화하면 바로 원래대로 (다시 로그인 없이)').toBe(true);
    expect(after, 'Y 로 되돌리면 보임').toBe(true);
  });
}

for (const s of SCREENS) {
  test.describe(`${s.code} ${s.name} Setting`, () => {
    s.fields.forEach(fieldCases);
    s.lists.forEach(listCases);
    s.tabs.forEach(tabCases);
  });
}
