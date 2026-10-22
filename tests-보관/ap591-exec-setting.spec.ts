import { test, expect, Page, Frame } from '@playwright/test';
import { settle, waitFrame, Grid } from '../support/dream';
import {
  openSetting, openTabSetting, checkAndClick, editSettingRow, settingRowTexts, gridHeaders, headerWidth, gridBodyHeight, searchLabels,
  resetSetting, listLength, setListLength, settingRow,
} from '../support/setting';
import { DTO, F_POINT, F_POINT_VALUE, openTab, searchCond, loadAll, clickRow, detailOf, frameReady, listGrid, note } from '../support/pmexec';

// 정기점검실행 (AP591) Setting(사용자정의) 상세 테스트
// 바꾼 값은 각 테스트 끝에 원래대로 되돌림. Setting 은 사용자별 저장 (최신영 계정에만 적용)
// TC_024: 검색·상세 Field 설정, Tab 설정 / TC_025: 목록 Setting / TC_041: 점검항목 목록·점검값 상세 Setting

test.describe.configure({ timeout: 240_000 });

const PM = '8007';
const EQ = '100302AG13';

// 설정 목록 칸 순서(td): Field 설정 정렬값 2, 화면표시명 3 / 목록 Setting 정렬값 2, 칼럼명 4, 너비 5, 정렬 7, 조회순서 13 / Tab 설정 Display 3
const TD = { order: 2, name: 3, colName: 4, width: 5, align: 7, sortDir: 13, tabDisplay: 3 };

/** 설정 목록에서 이름이 정확히 같은 칸이 있는 행의 키(ID 칸)와 칸 글자 */
async function rowByName(f: Frame, name: string) {
  return f.evaluate((name) => {
    const rows = [...document.querySelectorAll<HTMLTableRowElement>('div.gridbox .objbox tr')].filter((tr) => tr.offsetHeight > 0);
    for (const tr of rows) {
      const cells = [...tr.querySelectorAll<HTMLElement>('td')];
      const tds = cells.map((td) => (td.innerText || '').trim());
      const vis = cells.map((td) => td.offsetWidth > 0);
      const ni = tds.findIndex((t, i) => t === name && vis[i]);
      if (ni < 0) continue;
      const key = tds.find((t, i) => vis[i] && /^[A-Za-z][\w.]+$/.test(t) && t !== name) ?? '';
      return { key, tds, vis, nameIdx: ni };
    }
    return null;
  }, name);
}

/** 설정 목록 전체 (각 행의 보이는 칸) */
const settingRows = (f: Frame) => f.evaluate(() =>
  [...document.querySelectorAll<HTMLTableRowElement>('div.gridbox .objbox tr')].filter((tr) => tr.offsetHeight > 0 && tr.querySelector('td'))
    .map((tr) => [...tr.querySelectorAll<HTMLElement>('td')].filter((td) => td.offsetWidth > 0).map((td) => td.innerText.trim())));

const cond = (page: Page) => openTab(page, 'cond');
const condList = (page: Page) => searchCond(page, { pmNo: PM });
const cal = (page: Page) => openTab(page, 'cal');

/** 열린 팝업 닫기 (팝업 닫기 X 는 팝업 프레임 안에 있음) */
async function closePopups(page: Page) {
  for (let i = 0; i < 3; i++) {
    const pops = page.frames().filter((f) => /popupIframe/.test(f.name()) && f.url() !== 'about:blank').reverse();
    let closed = false;
    for (const f of pops) {
      const x = f.locator('div.b_pwin_close:visible').first();
      if (await x.isVisible().catch(() => false)) { await x.click().catch(() => {}); closed = true; await settle(page, 800); break; }
    }
    if (!closed) break;
  }
}

/** 설정 목록에서 key 행을 체크하고 Edit 를 눌렀을 때 칸마다 수정 가능 여부 (dhtmlx 칸 종류 ro = 읽기전용) */
async function editableColumns(page: Page, f: Frame, key: string) {
  await settingRow(f, key).locator('img[src*="item_chk"]').click();
  await f.locator('a:visible', { hasText: /^\s*Edit\s*$/ }).first().click();
  await settle(page, 1500);
  return f.evaluate(() => {
    const w = window as any;
    const g = Object.keys(w).map((k) => { try { return w[k]; } catch { return null; } }).find((o) => o && typeof o.getColType === 'function' && typeof o.getRowsNum === 'function');
    return Object.fromEntries([...Array(g.getColumnsNum())].map((_, i) => [g.getColLabel(i), g.getColType(i) !== 'ro' && g.getColType(i) !== 'cntr']));
  }) as Promise<Record<string, boolean>>;
}

/** 점검항목 목록처럼 Setting 이 하나뿐인 목록: 첫 Setting → 칼럼 설정(사용자정의Grid) 팝업 */
async function openColSetting(page: Page, f: Frame) {
  await closePopups(page);
  await f.locator('a:visible', { hasText: /^\s*Setting\s*$/ }).first().click();
  await settle(page, 2500);
  return waitFrame(page, 'tabFrameTAB.maGrdUsrColList_maGrdUsrDetail');
}

/** [sychoi] 8007 작업발행 점검작업 상세 */
async function workDetail(page: Page) {
  const f = await condList(page);
  const rows = await loadAll(page, f);
  const i = rows.findIndex((r) => r['설비번호'] === EQ && r['점검작업상태'] === '작업발행');
  await clickRow(f, i);
  return detailOf(page, 'cond');
}
const detailLabels = (d: Frame) => searchLabels(d).then((l) => l.filter(Boolean));
/** 상세의 하위 탭 이름 (점검항목, 표준작업, 첨부문서) */
const subTabs = (d: Frame) => d.evaluate(() => [...new Set([...document.querySelectorAll<HTMLElement>('a, span, li')].filter((e) => e.offsetWidth > 0 && /^(점검항목|표준작업|첨부문서)\s*\d*$/.test(e.innerText.trim())).map((e) => e.innerText.trim().replace(/\d+$/, '')))]);

/** 점검항목 첫 행을 눌러 점검값 상세 */
async function pointValue(page: Page) {
  await workDetail(page);
  const pl = await waitFrame(page, F_POINT);
  await settle(page, 1500);
  const g = new Grid(pl, '점검항목');
  await g.clickCell('점검항목', (await g.rows())[0]['점검항목']);
  return { pl, pd: await frameReady(page, F_POINT_VALUE) };
}

test.describe('AP591 정기점검실행 Setting', () => {
  // ---------------- 검색 Field 설정 ----------------
  test('AP591_TC_024 검색 Field 설정: 검색 필드를 숨기고 다시 보이게 한다.', async ({ page }) => {
    const NAME = '거래처';
    let f = await cond(page);
    const r = await rowByName(await openSetting(page, f, 'search'), NAME);
    expect(r, `${NAME} 설정 행`).toBeTruthy();
    try {
      await checkAndClick(page, page.frames().find((x) => /persPrivUsrFieldList/.test(x.name()))!, r!.key, 'Hide Fields');
      f = await cond(page);
      const hidden = await searchLabels(f);
      note(`검색 '${NAME}'(${r!.key}) Display N → 검색 영역에 ${hidden.includes(NAME) ? '보임' : '안 보임'}`);
      expect(hidden).not.toContain(NAME);
    } finally {
      await checkAndClick(page, await openSetting(page, await cond(page), 'search'), r!.key, 'Show Fields');
    }
    const shown = await searchLabels(await cond(page));
    note(`Display Y 로 되돌림 → ${shown.includes(NAME) ? '다시 보임' : '안 보임'}`);
    expect(shown).toContain(NAME);
  });

  test('AP591_TC_024 검색 Field 설정: 정렬값을 바꾸고 화면표시명 수정 가능 여부를 확인한다.', async ({ page }) => {
    const NAME = '거래처';
    let f = await cond(page);
    const before = await searchLabels(f);
    let sf = await openSetting(page, f, 'search');
    const r = (await rowByName(sf, NAME))!;
    const pm = (await rowByName(sf, '예방작업번호'))!;
    const editable = await editableColumns(page, sf, r.key);
    const order0 = r.tds[TD.order];
    const newOrder = String(Number(pm.tds[TD.order]) + 1);
    try {
      sf = await openSetting(page, await cond(page), 'search');
      await editSettingRow(page, sf, r.key, { [TD.order]: newOrder });
      const after = await searchLabels(await cond(page));
      note(`검색 '${NAME}' 정렬값 ${order0} → ${newOrder}(예방작업번호 ${pm.tds[TD.order]} 바로 뒤) → 검색 라벨 '${after.join(', ')}'\nEdit 모드에서 수정 가능한 칸: ${Object.entries(editable).filter(([, v]) => v).map(([k]) => k).join(', ')} (화면표시명 ${editable['화면표시명'] ? '수정 가능' : '입력칸이 열리지 않음'})`);
      expect.soft(after.indexOf(NAME), '예방작업번호 바로 뒤').toBe(after.indexOf('예방작업번호') + 1);
    } finally {
      await editSettingRow(page, await openSetting(page, await cond(page), 'search'), r.key, { [TD.order]: order0 });
    }
    const restored = await searchLabels(await cond(page));
    note(`되돌림 → 검색 라벨 ${JSON.stringify(restored) === JSON.stringify(before) ? '원래와 같음' : `다름: ${restored.join(', ')}`}`);
    expect(restored).toEqual(before);
    expect.soft(editable['화면표시명'], '화면표시명 수정 가능').toBe(true);
  });

  test('AP591_TC_024 검색 Field 설정: 초기화하면 기본 검색 필드로 바로 돌아온다.', async ({ page }) => {
    const NAME = '거래처';
    let f = await cond(page);
    const before = await searchLabels(f);
    const sf = await openSetting(page, f, 'search');
    const r = (await rowByName(sf, NAME))!;
    await checkAndClick(page, sf, r.key, 'Hide Fields');
    const hidden = await searchLabels(await cond(page));
    await resetSetting(page, await openSetting(page, await cond(page), 'search'));
    const after = await searchLabels(await cond(page));
    note(`검색 '${NAME}' 숨김(${hidden.includes(NAME) ? '보임' : '안 보임'}) → [초기화] → ${after.includes(NAME) ? '바로 다시 보임' : '안 보임'}`);
    if (!after.includes(NAME)) await checkAndClick(page, await openSetting(page, await cond(page), 'search'), r.key, 'Show Fields');
    expect(hidden).not.toContain(NAME);
    expect(after, '초기화 후 원래 필드').toEqual(before);
  });

  test('AP591_TC_024 카렌다(월간) 검색 Field 설정과 화면을 비교한다.', async ({ page }) => {
    const f = await cal(page);
    const shown = await searchLabels(f);
    const sf = await openSetting(page, f, 'search');
    const rows = (await settingRows(sf)).map((t) => ({ name: t[2], disp: t[3], id: t[4] })).filter((x) => x.id);
    const yNotShown = rows.filter((x) => x.disp === 'Y' && !shown.includes(x.name)).map((x) => `${x.name}(${x.id})`);
    const nShown = rows.filter((x) => x.disp === 'N' && shown.includes(x.name)).map((x) => x.name);
    note(`카렌다(월간) Field 설정 ${rows.length}행: ${rows.map((x) => `${x.name}=${x.disp}`).join(', ')}\n검색 영역 라벨: ${shown.join(', ')}\nDisplay Y 인데 안 보이는 필드: ${yNotShown.join(', ') || '없음'} / N 인데 보이는 필드: ${nShown.join(', ') || '없음'}`);
    expect.soft(yNotShown, 'Display Y 필드는 검색 영역에 보여야 함').toEqual([]);
    expect.soft(nShown).toEqual([]);
  });

  // ---------------- 상세 Field 설정, Tab 설정 ----------------
  test('AP591_TC_024 상세 Field 설정: 상세 필드를 숨기고 다시 보이게 한다.', async ({ page }) => {
    const NAME = '비고';
    let d = await workDetail(page);
    const sf = await openSetting(page, d, 'search');
    const r = (await rowByName(sf, NAME))!;
    expect(r.key).toBe('workPmiDetailDTO.remark');
    try {
      await checkAndClick(page, sf, r.key, 'Hide Fields');
      d = await workDetail(page);
      const hidden = await detailLabels(d);
      note(`상세 '${NAME}' Display N → 상세에 ${hidden.includes(NAME) ? '보임' : '안 보임'}`);
      expect(hidden).not.toContain(NAME);
    } finally {
      await checkAndClick(page, await openSetting(page, await workDetail(page), 'search'), r.key, 'Show Fields');
    }
    const shown = await detailLabels(await workDetail(page));
    note(`Display Y 로 되돌림 → ${shown.includes(NAME) ? '다시 보임' : '안 보임'}`);
    expect(shown).toContain(NAME);
  });

  test('AP591_TC_024 상세 Field 설정: 정렬값을 바꾼다.', async ({ page }) => {
    const NAME = '비고';
    let d = await workDetail(page);
    const before = await detailLabels(d);
    const sf = await openSetting(page, d, 'search');
    const r = (await rowByName(sf, NAME))!;
    const anchor = (await rowByName(sf, '점검명'))!;
    const order0 = r.tds[TD.order];
    const newOrder = String(Number(anchor.tds[TD.order]) + 1);
    try {
      await editSettingRow(page, sf, r.key, { [TD.order]: newOrder });
      d = await workDetail(page);
      const after = await detailLabels(d);
      note(`상세 '${NAME}' 정렬값 ${order0} → ${newOrder}(점검명 ${anchor.tds[TD.order]} 바로 뒤) → 상세 라벨 '${after.join(', ')}'`);
      expect.soft(after.indexOf(NAME), '점검명 바로 뒤').toBe(after.indexOf('점검명') + 1);
    } finally {
      await editSettingRow(page, await openSetting(page, await workDetail(page), 'search'), r.key, { [TD.order]: order0 });
    }
    const restored = await detailLabels(await workDetail(page));
    note(`되돌림 → 상세 라벨 ${JSON.stringify(restored) === JSON.stringify(before) ? '원래와 같음' : `다름: ${restored.join(', ')}`}`);
    expect(restored).toEqual(before);
  });

  test('AP591_TC_024 상세 Tab 설정: 하위 탭을 숨겼다가 초기화·되돌린다.', async ({ page }) => {
    test.setTimeout(600_000);
    const KEY = 'maPtDocLibList';
    const NAME = '첨부문서';
    const tabSetting = async () => { await openSetting(page, await workDetail(page), 'search'); return openTabSetting(page); };
    const tf = await tabSetting();
    const rows = await settingRows(tf);
    const before = await subTabs(await workDetail(page));
    let afterReset: string[] = [];
    try {
      await editSettingRow(page, await tabSetting(), KEY, { [TD.tabDisplay]: 'N' });
      const hidden = await subTabs(await workDetail(page));
      note(`상세 Tab 설정 행: ${rows.map((t) => t.join(' | ')).join(' / ')}\n'${NAME}'(${KEY}) Display N → 하위 탭 ${hidden.join(', ')}`);
      expect.soft(hidden, '숨긴 탭은 보이지 않음').not.toContain(NAME);
      const tf2 = await tabSetting();
      await resetSetting(page, tf2);
      const shownY = (await settingRowTexts(tf2, KEY)).includes('Y');
      afterReset = await subTabs(await workDetail(page));
      if (!afterReset.includes(NAME)) await page.screenshot({ path: 'playwright/.data/evidence/ap591-TC_024-tab.png' });
      note(`[초기화] → 설정 화면 Display ${shownY ? 'Y' : 'N'}, 하위 탭 ${afterReset.join(', ')} (${afterReset.includes(NAME) ? '바로 다시 보임' : '안 보임, 다시 로그인해야 반영'})`);
    } finally {
      await editSettingRow(page, await tabSetting(), KEY, { [TD.tabDisplay]: 'Y' });
    }
    const after = await subTabs(await workDetail(page));
    note(`Edit 로 Display Y 저장 → 하위 탭 ${after.join(', ')}. 표준작업 탭은 Tab 설정 목록에 없음: ${rows.some((t) => t.some((c) => /표준작업|StdPoint/.test(c))) ? '있음' : '없음'}`);
    expect(before).toContain(NAME);
    expect.soft(afterReset, '초기화하면 바로 원래대로 (다시 로그인 없이)').toContain(NAME);
    expect(after, 'Y 로 되돌리면 탭이 보임').toContain(NAME);
  });

  // ---------------- 목록 Setting ----------------
  const COL = { id: 'SHIFTTYPEDESC', name: '교대조' };

  test('AP591_TC_025 목록 Setting: 칼럼을 숨기고 다시 보이게 한다.', async ({ page }) => {
    let f = await condList(page);
    expect(await gridHeaders(f)).toContain(COL.name);
    try {
      await checkAndClick(page, await openSetting(page, f, 'list'), COL.id, 'Hide Column');
      f = await condList(page);
      const hidden = await gridHeaders(f);
      note(`목록 칼럼 '${COL.name}' Display N → ${hidden.includes(COL.name) ? '보임' : '안 보임'}`);
      expect(hidden).not.toContain(COL.name);
    } finally {
      await checkAndClick(page, await openSetting(page, await cond(page), 'list'), COL.id, 'Show Column');
    }
    const shown = await gridHeaders(await condList(page));
    note(`Display Y 로 되돌림 → ${shown.includes(COL.name) ? '다시 보임' : '안 보임'}`);
    expect(shown).toContain(COL.name);
  });

  test('AP591_TC_025 목록 Setting: 칼럼 정렬값과 너비를 바꾼다.', async ({ page }) => {
    let f = await condList(page);
    const before = await gridHeaders(f);
    const width0 = await headerWidth(f, COL.name);
    const sf = await openSetting(page, f, 'list');
    const row0 = (await rowByName(sf, COL.name))!;
    const order0 = row0.tds[TD.order], w0 = row0.tds[TD.width];
    try {
      await editSettingRow(page, sf, COL.id, { [TD.order]: '135', [TD.width]: '180' }); // 점검일자(130) 바로 뒤
      f = await condList(page);
      const after = await gridHeaders(f);
      const width1 = await headerWidth(f, COL.name);
      note(`'${COL.name}' 정렬값 ${order0}→135, 너비 ${w0}→180 → 목록 순서 '${after.slice(0, 5).join(', ')}…', 너비 ${width0}px→${width1}px`);
      expect.soft(after.indexOf(COL.name), '점검일자 바로 뒤').toBe(after.indexOf('점검일자') + 1);
      expect.soft(width1, '너비 180px').toBe(180);
    } finally {
      await editSettingRow(page, await openSetting(page, await cond(page), 'list'), COL.id, { [TD.order]: order0, [TD.width]: w0 });
    }
    f = await condList(page);
    expect(await gridHeaders(f), '원래 순서').toEqual(before);
    expect(await headerWidth(f, COL.name), '원래 너비').toBe(width0);
  });

  test('AP591_TC_025 목록 Setting: 정렬(Left/Center/Right)·조회순서(ASC/DESC) 칸을 바꿀 수 있는지 확인한다.', async ({ page }) => {
    const f = await condList(page);
    const sf = await openSetting(page, f, 'list');
    const row = (await rowByName(sf, '점검명'))!;
    const editable = await editableColumns(page, sf, 'PMIDESC');
    await page.screenshot({ path: 'playwright/.data/evidence/ap591-TC_025-edit.png' });
    note(`목록 Setting '점검명' 행 (정렬 ${row.tds[TD.align]}, 조회순서 "${row.tds[TD.sortDir]}") 체크 → Edit → 수정 가능한 칸: ${Object.entries(editable).filter(([, v]) => v).map(([k]) => k).join(', ')}\n정렬 ${editable['정렬'] ? '수정 가능' : '읽기전용'}, 조회순서 ${editable['조회순서'] ? '수정 가능' : '읽기전용'} (칼럼 상세보기 버튼도 화면 변화 없음)`);
    expect.soft(editable['정렬'], '정렬 칸 수정 가능').toBe(true);
    expect.soft(editable['조회순서'], '조회순서 칸 수정 가능').toBe(true);
  });

  test('AP591_TC_025 목록 Setting: Background Color 설정 칸을 확인한다.', async ({ page }) => {
    const f = await condList(page);
    const sf = await openSetting(page, f, 'list');
    const heads = await sf.evaluate(() => [...document.querySelectorAll<HTMLElement>('.hdrcell')].map((h) => h.innerText.trim()).filter(Boolean));
    // 칼럼 상세보기에 색상 설정이 있는지
    await sf.locator('img[src*="item_chk"]').nth(4).click().catch(() => {});
    await sf.locator('a:visible', { hasText: /^\s*상세보기\s*$/ }).first().click().catch(() => {});
    await settle(page, 2500);
    const texts: string[] = [];
    for (const fr of page.frames()) {
      if (fr.url() === 'about:blank' || !/maGrdUsr|popup/i.test(fr.name() + fr.url())) continue;
      texts.push(await fr.evaluate(() => [...document.querySelectorAll<HTMLElement>('label, .hdrcell, select option')].filter((e) => e.offsetWidth > 0 || e.tagName === 'OPTION').map((e) => e.innerText.trim()).filter(Boolean).join(',')).catch(() => ''));
    }
    const all = [...heads, ...texts].join(',');
    const has = /Background|배경|Color|색/i.test(all);
    note(`목록 Setting 칸: ${heads.join(', ')}\n칼럼 상세보기 항목: ${texts.filter(Boolean).join(' / ').slice(0, 300) || '안 열림'}\nBackground Color 설정 ${has ? '있음' : '없음'}`);
    expect(has, 'Background Color 설정 칸').toBe(true);
  });

  test('AP591_TC_025 목록 Setting: 리스트 길이를 -/+ 버튼과 숫자로 바꾼다.', async ({ page }) => {
    let f = await condList(page);
    const h0 = await gridBodyHeight(f);
    await openSetting(page, f, 'list');
    const len0 = await listLength(page);
    const pop = page.frames().find((x) => x.name() === 'popupIframe1')!;
    const log: string[] = [];
    try {
      // + 버튼 두 번
      await pop.locator('a:visible', { hasText: /^\s*\+\s*$/ }).first().click();
      await pop.locator('a:visible', { hasText: /^\s*\+\s*$/ }).first().click();
      const plus = await listLength(page);
      await pop.locator('a:visible', { hasText: /^\s*-\s*$/ }).first().click();
      const minus = await listLength(page);
      log.push(`리스트 길이 ${len0} → + 2번 ${plus} → - 1번 ${minus}`);
      expect.soft(Number(plus), '+ 로 증가').toBeGreaterThan(Number(len0));
      expect.soft(Number(minus), '- 로 감소').toBeLessThan(Number(plus));
      // 숫자 입력
      const len1 = String(Number(len0) * 2);
      await setListLength(page, len1);
      f = await condList(page);
      const h1 = await gridBodyHeight(f);
      log.push(`숫자 ${len1} 입력·저장 → 목록 높이 ${h0}px → ${h1}px`);
      expect.soft(h1, '목록 높이가 커짐').toBeGreaterThan(h0 * 1.5);
    } finally {
      await openSetting(page, await cond(page), 'list');
      await setListLength(page, len0);
    }
    f = await condList(page);
    const h2 = await gridBodyHeight(f);
    log.push(`되돌림 → 높이 ${h2}px`);
    note(log.join('\n'));
    expect(h2).toBe(h0);
  });

  test('AP591_TC_025 목록 Setting: 리스트 길이를 바꾼 뒤 초기화한다.', async ({ page }) => {
    let f = await condList(page);
    const h0 = await gridBodyHeight(f);
    await openSetting(page, f, 'list');
    const len0 = await listLength(page);
    const len1 = String(Number(len0) + 5);
    let after = '', h2 = 0;
    try {
      await setListLength(page, len1);
      f = await condList(page);
      const h1 = await gridBodyHeight(f);
      await resetSetting(page, await openSetting(page, f, 'list'));
      after = await listLength(page);
      await closePopups(page);
      f = await condList(page);
      h2 = await gridBodyHeight(f);
            note(`리스트 길이 ${len0} → ${len1} 저장 (목록 높이 ${h0}px → ${h1}px) → [초기화] → 리스트 길이 ${after}, 목록 높이 ${h2}px`);
    } finally {
      await closePopups(page);
      await openSetting(page, await cond(page), 'list');
      if ((await listLength(page)) !== len0) await setListLength(page, len0);
      await closePopups(page);
    }
    // 사양 (사용자 확인 2026-10-21): 리스트 길이는 [초기화]로 돌아오지 않음 = 정상
    expect(after, '초기화해도 리스트 길이는 그대로').toBe(len1);
  });

  test('AP591_TC_025 목록 Setting: 초기화하면 기본 칼럼으로 돌아온다.', async ({ page }) => {
    let f = await condList(page);
    const before = await gridHeaders(f);
    await checkAndClick(page, await openSetting(page, f, 'list'), COL.id, 'Hide Column');
    f = await condList(page);
    const hidden = await gridHeaders(f);
    await resetSetting(page, await openSetting(page, f, 'list'));
    const after = await gridHeaders(await condList(page));
    note(`칼럼 '${COL.name}' 숨김(${hidden.includes(COL.name) ? '보임' : '안 보임'}) → [초기화] → ${after.includes(COL.name) ? '바로 다시 보임' : '안 보임'}`);
    if (!after.includes(COL.name)) await checkAndClick(page, await openSetting(page, await cond(page), 'list'), COL.id, 'Show Column');
    expect(hidden).not.toContain(COL.name);
    expect(after, '초기화 후 원래 칼럼').toEqual(before);
  });

  // ---------------- 점검항목 목록·점검값 상세 ----------------
  test('AP591_TC_041 점검항목 목록 Setting: 칼럼 숨김·너비를 바꾼다.', async ({ page }) => {
    test.setTimeout(480_000);
    const NAME = '검사세부내용';
    await workDetail(page);
    let pl = await waitFrame(page, F_POINT);
    await settle(page, 1500);
    const before = await gridHeaders(pl);
    const w0 = await headerWidth(pl, NAME);
    const sf = await openColSetting(page, pl); // 점검항목 목록의 Setting 은 하나 (칼럼 설정)
    const r = (await rowByName(sf, NAME))!;
    const wSet0 = r.tds[TD.width];
    try {
      await checkAndClick(page, sf, r.key, 'Hide Column');
      await workDetail(page);
      pl = await waitFrame(page, F_POINT); await settle(page, 1500);
      const hidden = await gridHeaders(pl);
      await checkAndClick(page, await openColSetting(page, pl), r.key, 'Show Column');
      await editSettingRow(page, await openColSetting(page, pl), r.key, { [TD.width]: '220' });
      await workDetail(page);
      pl = await waitFrame(page, F_POINT); await settle(page, 1500);
      const w1 = await headerWidth(pl, NAME);
      note(`점검항목 목록 '${NAME}'(${r.key}) Display N → ${hidden.includes(NAME) ? '보임' : '안 보임'} / Y + 너비 ${wSet0}→220 → ${w0}px→${w1}px`);
      expect.soft(hidden).not.toContain(NAME);
      expect.soft(w1).toBe(220);
    } finally {
      await workDetail(page);
      pl = await waitFrame(page, F_POINT); await settle(page, 1500);
      const sf2 = await openColSetting(page, pl);
      if (!(await gridHeaders(pl)).includes(NAME)) await checkAndClick(page, sf2, r.key, 'Show Column');
      await editSettingRow(page, await openColSetting(page, pl), r.key, { [TD.width]: wSet0 });
    }
    await workDetail(page);
    pl = await waitFrame(page, F_POINT); await settle(page, 1500);
    expect(await gridHeaders(pl)).toEqual(before);
    expect(await headerWidth(pl, NAME)).toBe(w0);
  });

  test('AP591_TC_041 점검값 상세 Field 설정: 필드를 숨기고 정렬값을 바꾼다.', async ({ page }) => {
    test.setTimeout(480_000);
    const NAME = '검사세부내용';
    let { pd } = await pointValue(page);
    const before = await detailLabels(pd);
    const sf = await openSetting(page, pd, 'search');
    const r = (await rowByName(sf, NAME))!;
    const anchor = (await rowByName(sf, '점검항목'))!;
    const order0 = r.tds[TD.order];
    const newOrder = String(Number(anchor.tds[TD.order]) + 1);
    const log: string[] = [];
    try {
      await checkAndClick(page, sf, r.key, 'Hide Fields');
      ({ pd } = await pointValue(page));
      const hidden = await detailLabels(pd);
      log.push(`점검값 상세 '${NAME}'(${r.key}) Display N → ${hidden.includes(NAME) ? '보임' : '안 보임'}`);
      expect.soft(hidden).not.toContain(NAME);
      await checkAndClick(page, await openSetting(page, pd, 'search'), r.key, 'Show Fields');
      ({ pd } = await pointValue(page));
      await editSettingRow(page, await openSetting(page, pd, 'search'), r.key, { [TD.order]: newOrder });
      ({ pd } = await pointValue(page));
      const moved = await detailLabels(pd);
      log.push(`Display Y + 정렬값 ${order0} → ${newOrder}(점검항목 바로 뒤) → 라벨 ${moved.join(', ')}`);
      expect.soft(moved.indexOf(NAME), '점검항목 바로 뒤').toBe(moved.indexOf('점검항목') + 1);
    } finally {
      ({ pd } = await pointValue(page));
      const sf2 = await openSetting(page, pd, 'search');
      if (!(await detailLabels(pd)).includes(NAME)) await checkAndClick(page, sf2, r.key, 'Show Fields');
      await closePopups(page);
      ({ pd } = await pointValue(page));
      await editSettingRow(page, await openSetting(page, pd, 'search'), r.key, { [TD.order]: order0 });
    }
    ({ pd } = await pointValue(page));
    const restored = await detailLabels(pd);
    log.push(`되돌림 → ${JSON.stringify(restored) === JSON.stringify(before) ? '원래와 같음' : `다름: ${restored.join(', ')}`}`);
    note(log.join('\n'));
    expect(restored).toEqual(before);
  });
});

export { DTO };
