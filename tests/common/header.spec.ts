import { test, expect, Page, Frame } from '@playwright/test';
import { settle } from '../support/dream';
import { openSetting, resetSetting, editableColumns, searchLabels, closePopups } from '../support/setting';
import {
  iconsShown, topTabs, isBookmarked, inFavorites, toggleBookmark, openWorkgroup, workgroupRows, toggleWorkgroup, workgroupTabs,
  openTopTabSetting, topTabSettingRows, isEditMode, setEditMode, dragField, dragTopTab,
} from '../support/header';
import { Screen, HeaderTarget } from '../screens/types';
import { AD230 } from '../screens/ad230';
import { AD210 } from '../screens/ad210';
import { AP591 } from '../screens/ap591';

// 화면 상단 공통 기능 테스트: 즐겨찾기 / 업무그룹 / Tab설정(위쪽 탭) / 편집모드(위쪽 탭·검색 필드·상세 필드 끌어 옮기기)
// 모든 메뉴에서 같은 공통 코드(common.js)라, 동작은 대표 메뉴(화면 정의 header.deep) 하나에서만 확인합니다.
// 메뉴마다 아이콘 4개가 보이는지는 전체 메뉴 점검(menu-all.spec.ts)에서 확인합니다.
// 모두 사용자별 저장이고 누르면 바로 저장되므로, 바꾼 값은 각 테스트 끝에 원래대로 되돌립니다.
// 실행: .\run-common.ps1 header

const SCREENS: Screen[] = [AD230, AD210, AP591].filter((s) => s.header);

test.describe.configure({ timeout: 240_000 });

const note = (t: string) => test.info().annotations.push({ type: '실제결과', description: t });
const labels = (f: Frame) => searchLabels(f).then((l) => l.filter(Boolean));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** name 이 before 바로 앞에 있는지 */
const rightBefore = (list: string[], name: string, before: string) => list.indexOf(name) >= 0 && list.indexOf(name) + 1 === list.indexOf(before);

/** Tab설정 팝업 [초기화] (위쪽 탭 순서·표시를 기본으로) */
async function resetTopTabs(page: Page, h: HeaderTarget) {
  await h.open(page);
  await resetSetting(page, await openTopTabSetting(page));
  await closePopups(page);
}

function deepCases(s: Screen, h: HeaderTarget) {
  test(`상단 공통 즐겨찾기: 별을 누르면 즐겨찾기에 추가되고 다시 누르면 빠진다. (대표 메뉴 ${s.name})`, async ({ page }) => {
    await h.open(page);
    const b0 = await isBookmarked(page), f0 = await inFavorites(page, h.menuId);
    const log = [`처음: 별 ${b0 ? '켜짐' : '꺼짐'}, 왼쪽 즐겨찾기에 ${f0 ? '있음' : '없음'}`];
    try {
      await toggleBookmark(page);
      const b1 = await isBookmarked(page), f1 = await inFavorites(page, h.menuId);
      await h.open(page); // 다시 열어도 유지되는지
      const b2 = await isBookmarked(page), f2 = await inFavorites(page, h.menuId);
      log.push(`별 누름 → 별 ${b1 ? '켜짐' : '꺼짐'}, 즐겨찾기 ${f1 ? '있음' : '없음'} / 다시 열기 → 별 ${b2 ? '켜짐' : '꺼짐'}, 즐겨찾기 ${f2 ? '있음' : '없음'}`);
      expect.soft(b1, '별 상태가 바뀜').toBe(!b0);
      expect.soft(f1, '왼쪽 즐겨찾기에 바로 반영').toBe(!f0);
      expect.soft([b2, f2], '다시 열어도 유지').toEqual([!b0, !f0]);
    } finally {
      await h.open(page);
      if ((await isBookmarked(page)) !== b0) await toggleBookmark(page);
    }
    await h.open(page);
    const b3 = await isBookmarked(page), f3 = await inFavorites(page, h.menuId);
    log.push(`다시 눌러 되돌림 → 별 ${b3 ? '켜짐' : '꺼짐'}, 즐겨찾기 ${f3 ? '있음' : '없음'}`);
    note(log.join('\n'));
    expect([b3, f3], '원래대로').toEqual([b0, f0]);
  });

  test(`상단 공통 업무그룹: 지금 화면을 업무그룹에 넣었다가 뺀다. (대표 메뉴 ${s.name})`, async ({ page }) => {
    await h.open(page);
    const rows0 = await workgroupRows(await openWorkgroup(page));
    const g = rows0.find((r) => !r.checked);
    expect(g, '넣어 볼(선택 안 된) 업무그룹').toBeTruthy();
    const log = [`업무그룹 ${rows0.map((r) => `${r.name}${r.checked ? '(선택)' : ''}`).join(', ')} → '${g!.name}' 에 넣어 봄`];
    try {
      await toggleWorkgroup(page, page.frames().find((x) => x.name() === 'popupIframe1')!, g!.no);
      await closePopups(page);
      const tabs = await workgroupTabs(page, g!.no);
      await h.open(page);
      const rows1 = await workgroupRows(await openWorkgroup(page));
      const on = rows1.find((r) => r.no === g!.no)?.checked;
      log.push(`선택·저장 → 다시 열어 팝업 선택 ${on ? '됨' : '안 됨'}, 왼쪽 메뉴 '${g!.name}' 화면 탭: ${tabs.join(', ')}`);
      expect.soft(on, '팝업에서 선택된 상태로 저장').toBe(true);
      expect.soft(tabs.some((t) => t.includes(h.pageTab)), `업무그룹 화면에 '${h.pageTab}' 탭`).toBe(true);
    } finally {
      await closePopups(page);
      await h.open(page);
      const f = await openWorkgroup(page);
      if ((await workgroupRows(f)).find((r) => r.no === g!.no)?.checked) await toggleWorkgroup(page, f, g!.no);
      await closePopups(page);
    }
    const tabs2 = await workgroupTabs(page, g!.no);
    await h.open(page);
    const rows2 = await workgroupRows(await openWorkgroup(page));
    await closePopups(page);
    log.push(`선택 해제·저장 → ${same(rows2, rows0) ? '원래대로' : `다름: ${JSON.stringify(rows2)}`}, 업무그룹 화면 탭: ${tabs2.join(', ')}`);
    expect.soft(tabs2.some((t) => t.includes(h.pageTab)), '빼면 업무그룹 화면에서 사라짐').toBe(false);
    note(log.join('\n'));
    expect(rows2, '원래대로').toEqual(rows0);
  });

  test(`상단 공통 Tab설정: Edit 모드에서 바꿀 수 있는 칸을 확인한다. (대표 메뉴 ${s.name})`, async ({ page }) => {
    await h.open(page);
    const f = await openTopTabSetting(page);
    const rows = await topTabSettingRows(f);
    const ed = await editableColumns(page, f, rows[rows.length - 1].key); // 저장하지 않음
    await closePopups(page);
    const on = Object.entries(ed).filter(([k, v]) => v && k).map(([k]) => k);
    note(`위쪽 탭 Tab설정 행 체크 → Edit → 수정 가능한 칸: ${on.join(', ') || '없음'} (정렬값 ${ed['정렬값'] ? '수정 가능' : '읽기전용'}, 화면Display여부 ${ed['화면Display여부'] ? '수정 가능' : '읽기전용'})
사양: 순서는 편집모드로만 바꿈`);
    // 사양 (사용자 확인 2026-10-22): 위쪽 탭 Tab설정은 Edit 로 바꿀 칸이 없음 = 정상 (순서는 편집모드에서 끌어서, 되돌리기는 [초기화])
    expect.soft(ed['정렬값'], '정렬값 읽기전용 (사양)').toBeFalsy();
    expect.soft(ed['화면Display여부'], '화면Display여부 읽기전용 (사양)').toBeFalsy();
  });

  test(`상단 공통 Tab설정: 위쪽 탭 순서를 바꾼 뒤 [초기화]하면 기본 순서로 돌아온다. (대표 메뉴 ${s.name})`, async ({ page }) => {
    // Tab설정 팝업에서는 바꿀 수 없어 편집모드로 순서를 바꾼 뒤 [초기화] 확인
    const t = h.tab!;
    await h.open(page);
    const before = await topTabs(page);
    await setEditMode(page, true);
    await (await dragTopTab(page, t.name, t.before)).saved;
    await setEditMode(page, false);
    await h.open(page);
    const moved = await topTabs(page);
    await resetTopTabs(page, h);
    await h.open(page);
    const after = await topTabs(page);
    note(`편집모드로 순서 변경 → ${moved.join(', ')} → Tab설정 [초기화] → ${after.join(', ')}`);
    expect.soft(moved, '순서가 바뀜').not.toEqual(before);
    expect(after, '초기화하면 기본 순서').toEqual(before);
  });

  test(`상단 공통 편집모드: 자물쇠를 누르면 편집모드가 켜지고 다시 누르면 꺼진다. (대표 메뉴 ${s.name})`, async ({ page }) => {
    const f = await h.open(page);
    const on = await setEditMode(page, true);
    const st1 = await isEditMode(page), cls1 = await f.evaluate(() => document.body.classList.contains('usr_field_edit'));
    const off = await setEditMode(page, false);
    const st2 = await isEditMode(page), cls2 = await f.evaluate(() => document.body.classList.contains('usr_field_edit'));
    note(`켜기 → 편집모드 ${st1 ? '켜짐' : '꺼짐'}, 필드 편집 표시 ${cls1 ? '있음' : '없음'}, 안내 '${on}'\n끄기 → 편집모드 ${st2 ? '켜짐' : '꺼짐'}, 필드 편집 표시 ${cls2 ? '있음' : '없음'}, 안내 '${off}'`);
    expect([st1, cls1, st2, cls2]).toEqual([true, true, false, false]);
  });

  if (h.tab) test(`상단 공통 편집모드: 위쪽 탭 '${h.tab.name}' 을(를) 끌어 '${h.tab.before}' 앞으로 옮긴다. (대표 메뉴 ${s.name})`, async ({ page }) => {
    const { name, before: target } = h.tab!;
    await h.open(page);
    const before = await topTabs(page);
    const log: string[] = [];
    try {
      await setEditMode(page, true);
      const saved = await (await dragTopTab(page, name, target)).saved;
      const moved = await topTabs(page);
      await setEditMode(page, false);
      await h.open(page);
      const reopened = await topTabs(page);
      log.push(`편집모드에서 '${name}' 끌기 → ${moved.join(', ')} (자동 저장 ${saved ? '됨' : '안 됨'}) / 다시 열기 → ${reopened.join(', ')}`);
      expect.soft(saved, '놓으면 자동 저장').toBe(true);
      expect.soft(rightBefore(reopened, name, target), `다시 열어도 '${target}' 앞`).toBe(true);
    } finally {
      await setEditMode(page, false).catch(() => {});
      await resetTopTabs(page, h);
    }
    await h.open(page);
    const after = await topTabs(page);
    log.push(`Tab설정 [초기화] → ${after.join(', ')}`);
    note(log.join('\n'));
    expect(after, '원래 순서').toEqual(before);
  });

  if (h.field) test(`상단 공통 편집모드: 검색 필드 '${h.field.name}' 을(를) 끌어 '${h.field.before}' 앞으로 옮긴다. (대표 메뉴 ${s.name})`, async ({ page }) => {
    const { name, before: target } = h.field!;
    let f = await h.open(page);
    const before = await labels(f);
    const log: string[] = [];
    try {
      await setEditMode(page, true);
      const saved = await (await dragField(page, f, name, target)).saved;
      const moved = await labels(f);
      await setEditMode(page, false);
      const reopened = await labels(await h.open(page));
      log.push(`편집모드에서 '${name}' 끌기 → ${moved.join(', ')} (자동 저장 ${saved ? '됨' : '안 됨'}) / 다시 열기 → ${reopened.join(', ')}`);
      expect.soft(saved, '놓으면 자동 저장').toBe(true);
      expect.soft(rightBefore(reopened, name, target), `다시 열어도 '${target}' 앞`).toBe(true);
    } finally {
      await setEditMode(page, false).catch(() => {});
      await resetSetting(page, await openSetting(page, await h.open(page), 'search'));
      await closePopups(page);
    }
    f = await h.open(page);
    const after = await labels(f);
    log.push(`검색 Setting [초기화] → ${same(after, before) ? '원래 순서' : after.join(', ')}`);
    note(log.join('\n'));
    expect(after, '원래 순서').toEqual(before);
  });

  if (h.detail) test(`상단 공통 편집모드: 상세 필드 '${h.detail.name}' 을(를) 끌어 '${h.detail.before}' 앞으로 옮긴다. (대표 메뉴 ${s.name})`, async ({ page }) => {
    const { open, name, before: target } = h.detail!;
    let d = await open(page);
    const before = await labels(d);
    const log: string[] = [];
    try {
      await setEditMode(page, true);
      const saved = await (await dragField(page, d, name, target)).saved;
      const moved = await labels(d);
      await setEditMode(page, false);
      const reopened = await labels(await open(page));
      log.push(`편집모드에서 상세 '${name}' 끌기 → ${moved.join(', ')} (자동 저장 ${saved ? '됨' : '안 됨'}) / 다시 열기 → ${reopened.join(', ')}`);
      expect.soft(saved, '놓으면 자동 저장').toBe(true);
      expect.soft(rightBefore(reopened, name, target), `다시 열어도 '${target}' 앞`).toBe(true);
    } finally {
      await setEditMode(page, false).catch(() => {});
      await resetSetting(page, await openSetting(page, await open(page), 'search'));
      await closePopups(page);
    }
    d = await open(page);
    const after = await labels(d);
    log.push(`상세 Setting [초기화] → ${same(after, before) ? '원래 순서' : after.join(', ')}`);
    note(log.join('\n'));
    expect(after, '원래 순서').toEqual(before);
  });

  if (h.field) test(`상단 공통 편집모드: 필드를 놓고 바로 편집모드를 꺼도 옮긴 순서가 저장된다. (대표 메뉴 ${s.name})`, async ({ page }) => {
    // 오류 (사용자 확인 2026-10-22, 추가 확인 예정): 놓고 3초 뒤 자동 저장이라, 그 전에 편집모드를 끄면 저장되지 않음
    const { name, before: target } = h.field!;
    let f = await h.open(page);
    const before = await labels(f);
    let reopened: string[] = [];
    try {
      await setEditMode(page, true);
      const { saved } = await dragField(page, f, name, target); // 저장 응답을 기다리지 않고 바로 끔
      const moved = await labels(f);
      await setEditMode(page, false);
      const savedAnyway = await saved;
      reopened = await labels(await h.open(page));
      note(`편집모드에서 '${name}' 끌기 → ${moved.join(', ')} → 1초 안에 자물쇠로 편집모드 끔 (저장 요청 ${savedAnyway ? '있음' : '없음'}) → 다시 열기 ${rightBefore(reopened, name, target) ? '옮긴 순서 유지' : `원래 순서로 돌아감: ${reopened.join(', ')}`}`);
      if (!rightBefore(reopened, name, target)) await page.screenshot({ path: 'playwright/.data/evidence/header-editmode-quickoff.png' });
    } finally {
      await setEditMode(page, false).catch(() => {});
      if (!same(reopened, before)) { await resetSetting(page, await openSetting(page, await h.open(page), 'search')); await closePopups(page); }
    }
    f = await h.open(page);
    expect(await labels(f), '되돌림').toEqual(before);
    expect(rightBefore(reopened, name, target), '편집모드를 바로 꺼도 옮긴 순서가 저장되어야 함').toBe(true);
  });

  if (h.field) test(`상단 공통 편집모드: 잠금(편집모드 꺼짐) 상태에서는 필드를 끌어도 바뀌지 않는다. (대표 메뉴 ${s.name})`, async ({ page }) => {
    const { name, before: target } = h.field!;
    let f = await h.open(page);
    const before = await labels(f);
    expect(await isEditMode(page)).toBe(false);
    const saved = await (await dragField(page, f, name, target)).saved;
    await settle(page, 1000);
    const moved = await labels(f);
    f = await h.open(page);
    const after = await labels(f);
    note(`편집모드 꺼진 채 '${name}' 끌기 → ${same(moved, before) ? '안 바뀜' : `바뀜: ${moved.join(', ')}`}, 저장 요청 ${saved ? '있음' : '없음'}, 다시 열기 ${same(after, before) ? '원래 순서' : after.join(', ')}`);
    if (!same(after, before)) await resetSetting(page, await openSetting(page, f, 'search'));
    expect([same(moved, before), saved, same(after, before)]).toEqual([true, false, true]);
  });
}

// 동작은 공통 코드라 대표 메뉴 하나에서만 확인 (메뉴마다 아이콘이 보이는지는 menu-all.spec.ts 에서)
for (const s of SCREENS.filter((x) => x.header!.deep)) {
  test.describe('상단 공통 기능', () => deepCases(s, s.header!));
}
