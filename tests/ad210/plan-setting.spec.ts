import { test, expect, Page, Frame } from '@playwright/test';
import { settle } from '../support/dream';
import {
  openSetting, openTabSetting, checkAndClick, editSettingRow, settingRowTexts, gridHeaders, searchLabels, resetSetting,
} from '../support/setting';
import { openTab, searchPeriod, clickRow, note } from '../support/pmplan';

// 정기점검계획 (AD210) Setting(사용자정의) — Field 설정·Tab 설정에서 화면표시명, Display 여부, 정렬값을 바꾸고 화면 반영 확인 후 되돌림
// Setting 은 사용자별 저장 (최신영 계정에만 적용). 테스트ID 는 모두 AD210_TC_027 로 묶어 결과 엑셀에 한 줄로 합쳐짐
// 대상 화면: 목록(조건) 탭

test.describe.configure({ timeout: 240_000 });

// 바꿔 볼 대상 (목록(조건) 검색 필드 / 목록 칼럼 이름)
const FIELD_NAME = '계획거래처';
const COL_NAME = '실행거래처'; // 측정시간·비고 칼럼은 기본 Setting 에서 숨겨져 있어 보이는 칼럼으로

/** 설정 목록에서 이름(화면표시명 등)이 정확히 같은 칸이 있는 행의 키(ID 칸)와 칸 글자 */
async function rowByName(f: Frame, name: string) {
  return f.evaluate((name) => {
    const rows = [...document.querySelectorAll<HTMLTableRowElement>('div.gridbox .objbox tr')].filter((tr) => tr.offsetHeight > 0);
    for (const tr of rows) {
      const cells = [...tr.querySelectorAll<HTMLElement>('td')];
      const tds = cells.map((td) => (td.innerText || '').trim());
      const vis = cells.map((td) => td.offsetWidth > 0);
      const ni = tds.findIndex((t, i) => t === name && vis[i]);
      if (ni < 0) continue;
      // 키: 점(.)이 있거나 영문 대문자·소문자로 된 ID 칸
      const key = tds.find((t) => /^[A-Za-z][\w.]+$/.test(t) && t !== name) ?? '';
      return { key, tds, vis, nameIdx: ni };
    }
    return null;
  }, name);
}

/** 설정 목록 전체 (각 행 보이는 칸) — 결과에 남기는 용도 */
const settingRows = (f: Frame) => f.evaluate(() =>
  [...document.querySelectorAll<HTMLTableRowElement>('div.gridbox .objbox tr')].filter((tr) => tr.offsetHeight > 0)
    .map((tr) => [...tr.querySelectorAll<HTMLElement>('td')].filter((td) => td.offsetWidth > 0).map((td) => td.innerText.trim()).join(' | ')));

const period = (page: Page) => openTab(page, 'period');

test.describe('AD210 정기점검계획 Setting', () => {
  test('AD210_TC_027 Field 설정: 검색 필드를 숨기고 다시 보이게 한다.', async ({ page }) => {
    let f = await period(page);
    const sf = await openSetting(page, f, 'search');
    const r = await rowByName(sf, FIELD_NAME);
    expect(r, `${FIELD_NAME} 설정 행`).toBeTruthy();
    try {
      await checkAndClick(page, sf, r!.key, 'Hide Fields');
      f = await period(page);
      const hidden = await searchLabels(f);
      note(`'${FIELD_NAME}'(${r!.key}) Display N → 검색 영역에 ${hidden.includes(FIELD_NAME) ? '보임' : '안 보임'}`);
      expect(hidden).not.toContain(FIELD_NAME);
    } finally {
      await checkAndClick(page, await openSetting(page, await period(page), 'search'), r!.key, 'Show Fields');
    }
    const shown = await searchLabels(await period(page));
    note(`Display Y 로 되돌림 → ${shown.includes(FIELD_NAME) ? '다시 보임' : '안 보임'}`);
    expect(shown).toContain(FIELD_NAME);
  });

  test('AD210_TC_027 Field 설정: 검색 필드 화면표시명과 정렬값을 바꾼다.', async ({ page }) => {
    let f = await period(page);
    const before = await searchLabels(f);
    const sf = await openSetting(page, f, 'search');
    const r = (await rowByName(sf, FIELD_NAME))!;
    const tds0 = await settingRowTexts(sf, r.key);
    const orderIdx = r.tds.findIndex((t, i) => i < r.nameIdx && r.vis[i] && /^\d+$/.test(t)); // 보이는 칸 중 화면표시명 앞의 숫자 = 정렬값
    const order0 = r.tds[orderIdx];
    const newName = `${FIELD_NAME}(테스트)`;
    // 예방작업번호 정렬값 바로 뒤로
    const pmRow = (await rowByName(sf, '예방작업번호'))!;
    const newOrder = String(Number(pmRow.tds[orderIdx]) + 1);
    note(`설정 행: ${tds0.join(' | ')} (정렬값 칸 ${orderIdx}, 화면표시명 칸 ${r.nameIdx})`);
    try {
      await editSettingRow(page, sf, r.key, { [orderIdx]: newOrder, [r.nameIdx]: newName });
      f = await period(page);
      const after = await searchLabels(f);
      note(`'${FIELD_NAME}' 화면표시명 → '${newName}', 정렬값 ${order0} → ${newOrder} → 검색 라벨 '${after.slice(0, 5).join(', ')}…'`);
      expect.soft(after, '바뀐 화면표시명').toContain(newName);
      expect.soft(after.indexOf(newName), '예방작업번호 바로 뒤').toBe(after.indexOf('예방작업번호') + 1);
    } finally {
      const sf2 = await openSetting(page, await period(page), 'search');
      const r2 = (await rowByName(sf2, newName)) ?? (await rowByName(sf2, FIELD_NAME))!;
      await editSettingRow(page, sf2, r2.key, { [orderIdx]: order0, [r.nameIdx]: FIELD_NAME });
    }
    const restored = await searchLabels(await period(page));
    note(`되돌림 → 검색 라벨 ${JSON.stringify(restored) === JSON.stringify(before) ? '원래와 같음' : `다름: ${restored.join(', ')}`}`);
    expect(restored).toEqual(before);
  });

  test('AD210_TC_027 Field 설정: 목록 칼럼을 숨기고 다시 보이게 한다.', async ({ page }) => {
    let f = await searchPeriod(page, { pmDesc: '[sychoi]' });
    expect(await gridHeaders(f)).toContain(COL_NAME);
    const sf = await openSetting(page, f, 'list');
    const r = (await rowByName(sf, COL_NAME))!;
    try {
      await checkAndClick(page, sf, r.key, 'Hide Column');
      f = await searchPeriod(page, { pmDesc: '[sychoi]' });
      const hidden = await gridHeaders(f);
      note(`목록 칼럼 '${COL_NAME}'(${r.key}) Display N → ${hidden.includes(COL_NAME) ? '보임' : '안 보임'}`);
      expect(hidden).not.toContain(COL_NAME);
    } finally {
      await checkAndClick(page, await openSetting(page, await period(page), 'list'), r.key, 'Show Column');
    }
    const shown = await gridHeaders(await searchPeriod(page, { pmDesc: '[sychoi]' }));
    note(`Display Y 로 되돌림 → ${shown.includes(COL_NAME) ? '다시 보임' : '안 보임'}`);
    expect(shown).toContain(COL_NAME);
  });

  test('AD210_TC_027 Field 설정: 초기화하면 기본 검색 필드로 바로 돌아온다.', async ({ page }) => {
    let f = await period(page);
    const before = await searchLabels(f);
    const sf = await openSetting(page, f, 'search');
    const r = (await rowByName(sf, FIELD_NAME))!;
    await checkAndClick(page, sf, r.key, 'Hide Fields');
    const hidden = await searchLabels(await period(page));
    await resetSetting(page, await openSetting(page, await period(page), 'search'));
    const after = await searchLabels(await period(page));
    note(`'${FIELD_NAME}' 숨김(${hidden.includes(FIELD_NAME) ? '보임' : '안 보임'}) → [초기화] → ${after.includes(FIELD_NAME) ? '바로 다시 보임' : '안 보임'}`);
    if (!after.includes(FIELD_NAME)) await checkAndClick(page, await openSetting(page, await period(page), 'search'), r.key, 'Show Fields');
    expect(hidden).not.toContain(FIELD_NAME);
    expect(after, '초기화 후 원래 필드').toEqual(before);
  });

  test('AD210_TC_027 목록 Setting: 초기화하면 기본 칼럼으로 바로 돌아온다.', async ({ page }) => {
    let f = await searchPeriod(page, { pmDesc: '[sychoi]' });
    const before = await gridHeaders(f);
    const sf = await openSetting(page, f, 'list');
    const r = await rowByName(sf, COL_NAME);
    expect(r, `${COL_NAME} 칼럼 설정 행`).toBeTruthy();
    await checkAndClick(page, sf, r!.key, 'Hide Column');
    f = await searchPeriod(page, { pmDesc: '[sychoi]' });
    const hidden = await gridHeaders(f);
    await resetSetting(page, await openSetting(page, f, 'list'));
    const after = await gridHeaders(await searchPeriod(page, { pmDesc: '[sychoi]' }));
    note(`칼럼 '${COL_NAME}' 숨김(${hidden.includes(COL_NAME) ? '보임' : '안 보임'}) → [초기화] → ${after.includes(COL_NAME) ? '바로 다시 보임' : '안 보임'}`);
    if (!after.includes(COL_NAME)) await checkAndClick(page, await openSetting(page, await period(page), 'list'), r!.key, 'Show Column');
    expect(hidden).not.toContain(COL_NAME);
    expect(after, '초기화 후 원래 칼럼').toEqual(before);
  });

  test('AD210_TC_027 Tab 설정: 상세 탭을 숨겼다가 초기화·되돌린다.', async ({ page }) => {
    // 목록(조건) Tab 설정의 상세 탭: 일정 상세(workCalPmRInsPeriodDetail, 작업계획 행), 점검작업 상세(workPmiDetail, 작업발행·완료 행)
    const KEY = 'workCalPmRInsPeriodDetail';
    const detailOpens = async () => {
      const f = await searchPeriod(page, { pmDesc: '[sychoi]' });
      const rows = await (await import('../support/pmplan')).loadAll(page, f);
      await clickRow(f, rows.findIndex((r) => r['일정상태'] === '작업계획'));
      await settle(page, 4000);
      const d = page.frames().find((x) => x.name() === 'tabFrameTAB.workCalPmRInsPeriodDetail_workCalPmRInsPeriodList');
      return d ? (await d.locator('[id="workCalPmRInsPeriodDetailDTO.schedDate"]').isVisible().catch(() => false)) : false;
    };
    const tabSetting = async () => { await openSetting(page, await period(page), 'search'); return openTabSetting(page); };
    const tf = await tabSetting();
    note(`목록(조건) Tab 설정 행: ${(await settingRows(tf)).join(' / ')}`);
    const row = await settingRowTexts(tf, KEY);
    const tds = await tf.evaluate((key) => {
      const tr = [...document.querySelectorAll<HTMLTableRowElement>('div.gridbox .objbox tr')].find((t) => [...t.querySelectorAll('td')].some((td) => (td as HTMLElement).innerText.trim() === key))!;
      return [...tr.querySelectorAll<HTMLElement>('td')].map((td) => ({ t: td.innerText.trim(), v: td.offsetWidth > 0 }));
    }, KEY);
    const dispIdx = tds.findIndex((x) => x.t === 'Y' && x.v);
    const before = await detailOpens();
    let afterReset = false;
    try {
      await editSettingRow(page, await tabSetting(), KEY, { [dispIdx]: 'N' });
      const hidden = await detailOpens();
      note(`일정 상세 탭(${KEY}, 설정 행 ${row.join(' | ')}) Display N → 작업계획 행 클릭 시 상세 ${hidden ? '열림' : '안 열림'}`);
      expect.soft(hidden, '숨긴 탭은 열리지 않음').toBe(false);
      const tf2 = await tabSetting();
      await resetSetting(page, tf2);
      const shownY = (await settingRowTexts(tf2, KEY)).includes('Y');
      afterReset = await detailOpens();
      if (!afterReset) await page.screenshot({ path: 'playwright/.data/evidence/ad210-TC_027.png' });
      note(`[초기화] → 설정 화면 Display ${shownY ? 'Y' : 'N'}, 상세 ${afterReset ? '바로 열림' : '안 열림 (다시 로그인해야 반영)'}`);
    } finally {
      await editSettingRow(page, await tabSetting(), KEY, { [dispIdx]: 'Y' });
    }
    const after = await detailOpens();
    note(`Edit 로 Display Y 저장 → 상세 ${after ? '열림' : '안 열림'}`);
    expect(before, '처음엔 상세가 열림').toBe(true);
    expect.soft(afterReset, '초기화하면 바로 원래대로 (다시 로그인 없이)').toBe(true);
    expect(after, 'Y 로 되돌리면 상세가 열림').toBe(true);
  });
});
