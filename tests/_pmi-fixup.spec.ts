import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import { openMenu, waitFrame, clickButton, clickTab, fieldValue, settle, Grid, lovContentFrame, pickInLov } from './support/dream';
import { rowsOf, deleteRowWhere } from './support/pmi';
import { fillAllFields, readFields, diffFields, saveForm, chooseInLov, loginUserName, closeLov, leaveField, put } from './support/form';

// 일회성: 테스트로 만든 정기점검주기 정리 (이름에 [sychoi] 표시, 담당자 본인) + 하위 목록 추가
// 실행 후 이 파일은 지웁니다.

const F_COND = 'tabFrameTAB.workPmListInsList_workPmiMstr';
const F_DETAIL = 'tabFrameTAB.workPmListRInsDetail_workPmListInsList';
const SUBS = {
  eq: ['tabFrameTAB.workPmListRInsEquipList_workPmListRInsDetail', 'tabFrameTAB.workPmListRInsEquipDetail_workPmListRInsEquipList', '최초작업예정일'],
  std: ['tabFrameTAB.workPmStdPointHdrList_workPmListRInsDetail', /^tabFrameTAB\.\w*StdPoint\w*Detail_workPmStdPointHdrList$/, '표준작업명'],
  pt: ['tabFrameTAB.maPmMstrPointList_workPmListRInsDetail', 'tabFrameTAB.maPmMstrPointDetail_maPmMstrPointList', '점검항목'],
  doc: ['tabFrameTAB.maPtDocLibList_workPmListRInsDetail', 'tabFrameTAB.maPtDocLibDetail_maPtDocLibList', '제목'],
} as const;

const PLAN: Record<string, { name: string; equip: string[] }> = {
  '8001': { name: '[sychoi] High Speed Mixer(세종파마텍) 임펠러·베어링 월간점검', equip: ['100302AG13'] },
  '8004': { name: '[sychoi] High Speed Mixer(금성산기) 분기 정밀점검', equip: ['100305AG17'] },
};

function note(t: string) { test.info().annotations.push({ type: '실제결과', description: t }); }

async function openPm(page: Page, pmNo: string) {
  await openMenu(page, ['132', '372', '454']);
  await clickTab(page, '목록(조건)');
  const f = await waitFrame(page, F_COND);
  await f.locator('[id="maPmMstrCommonDTO.filterIsActiveDesc"]').fill('');
  await f.locator('[id="maPmMstrCommonDTO.pmNo"]').fill(pmNo);
  await f.locator('a.b_search:visible').first().click();
  await settle(page, 1500);
  const rows = await new Grid(f, '예방작업번호').rows();
  if (!rows.some((r) => r['예방작업번호'] === pmNo)) return null;
  await new Grid(f, '예방작업번호').clickCell('예방작업번호', pmNo);
  const d = await waitFrame(page, F_DETAIL);
  await expect(d.getByText(new RegExp(`정기점검주기설정\\s*:\\s*${pmNo}`))).toBeVisible({ timeout: 15_000 });
  await settle(page, 1500);
  return { f, d, rows };
}

test.describe('정리', () => {
  test.setTimeout(300_000);

  test('테스트로 만든 예방작업번호 확인', async ({ page }) => {
    // 시행여부 조건을 비우고 전체 검색 → 예방작업번호 7990 이상만 추림 (한 번의 검색)
    await openMenu(page, ['132', '372', '454']);
    await clickTab(page, '목록(조건)');
    const f = await waitFrame(page, F_COND);
    await f.locator('[id="maPmMstrCommonDTO.filterIsActiveDesc"]').fill('');
    await f.locator('a.b_search:visible').first().click();
    await settle(page, 2000);
    const rows = await new Grid(f, '예방작업번호').rows();
    const found = rows.filter((r) => Number(r['예방작업번호']) >= 7990).map((r) => `${r['예방작업번호']}: ${r['작업명']} / 설비 ${r['설비번호'] || '-'} / 담당자 ${r['담당자'] || '-'}`);
    note(found.join('\n') || '7990 이상 없음');
  });

  for (const [pmNo, plan] of Object.entries(PLAN)) {
    test(`${pmNo} 이름·담당자 수정`, async ({ page }) => {
      const o = await openPm(page, pmNo);
      expect(o).toBeTruthy();
      const me = await loginUserName(page);
      const d = o!.d;
      await d.locator('[id="maPmMstrDetailDTO.description"]').fill(plan.name);
      await leaveField(d.locator('[id="maPmMstrDetailDTO.description"]'));
      await chooseInLov(page, d, 'maPmMstrDetailDTO.empName', me);
      // 비어 있는 칸도 모두 채움 (사원 칸은 본인)
      const entered = await fillAllFields(page, d, {}, '');
      const msg = await saveForm(page, d);
      const o2 = await openPm(page, pmNo);
      const diff = diffFields(entered, await readFields(o2!.d));
      note(`${pmNo}: 작업명="${plan.name}", 담당자=${me}, 저장 "${msg || '없음'}", 다시 열어 비교 ${diff.length ? diff.join(' / ') : '모두 일치'}`);
      expect(await fieldValue(o2!.d, 'maPmMstrDetailDTO.description')).toBe(plan.name);
      expect(await fieldValue(o2!.d, 'maPmMstrDetailDTO.empName')).toBe(me);
    });
    // 하위 목록 추가·삭제는 _pmi-sublist.spec.ts
  }

  test('8007 주기 1개월로 되돌림 (EC_015 재실행 전)', async ({ page }) => {
    const o = await openPm(page, '8007');
    await put(o!.d.locator('[id="maPmMstrDetailDTO.cycle"]'), '1');
    const msg = await saveForm(page, o!.d);
    const o2 = await openPm(page, '8007');
    note(`주기 → 1 저장 ("${msg || '없음'}")`);
    expect(await fieldValue(o2!.d, 'maPmMstrDetailDTO.cycle')).toBe('1');
  });

  test('8007 중복 설비 정리 (EC_014 가 넣은 행)', async ({ page }) => {
    await openPm(page, '8007');
    const before = await rowsOf(page, 'eq', '최초작업예정일');
    const dups = before.filter((r) => r['설비번호'] === '100302AG13');
    let msg = '중복 없음';
    if (dups.length > 1) msg = await deleteRowWhere(page, 'eq', '최초작업예정일', (r) => r['설비번호'] === '100302AG13' && r['최초작업예정일'] === '2026-11-08', '100302AG13 2026-11-08');
    const after = await rowsOf(page, 'eq', '최초작업예정일');
    note(`8007 설비 ${before.map((r) => `${r['설비번호']}(${r['최초작업예정일']})`).join(', ')} → ${after.map((r) => `${r['설비번호']}(${r['최초작업예정일']})`).join(', ')} ("${msg}")`);
    expect(after.filter((r) => r['설비번호'] === '100302AG13').length).toBe(1);
  });
});
