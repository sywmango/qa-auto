import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import { openMenu, waitFrame, clickButton, clickTab, fieldValue, settle, Grid, lovContentFrame, pickInLov } from './support/dream';
import { fillAllFields, readFields, diffFields, saveForm, chooseInLov, loginUserName, closeLov } from './support/form';

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
  test.setTimeout(600_000);

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
      await d.locator('[id="maPmMstrDetailDTO.description"]').press('Tab');
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

    test(`${pmNo} 하위 목록 추가 (설비, 표준작업, 점검항목, 첨부문서)`, async ({ page }) => {
      const log: string[] = [];
      for (const [key, [listName, detailName, header]] of Object.entries(SUBS)) {
        const o = await openPm(page, pmNo);
        expect(o).toBeTruthy();
        const lf = await waitFrame(page, listName);
        const before = (await new Grid(lf, header).rows()).length;
        await clickButton(lf, '생성');
        await settle(page, 2000);
        // 생성하면 Lov 가 바로 뜨는 목록(설비, 표준작업): 팝업에서 고름
        const pop = page.frames().find((x) => x.name() === 'popupIframe1');
        const popupOpen = !!pop && (await pop.locator('div.b_pwin_close').isVisible().catch(() => false));
        let picked = '';
        if (popupOpen) {
          const lov = await lovContentFrame(page).catch(() => null);
          if (lov && key === 'eq') { await pickInLov(page, lov, plan.equip[0], '설비번호'); picked = plan.equip[0]; }
          else if (lov) {
            const cell = lov.locator('div.gridbox:visible .objbox tr:visible td:visible').filter({ hasText: /\S/ }).nth(1);
            picked = (await cell.innerText().catch(() => '')).trim();
            if (picked) { await cell.click(); await clickButton(lov, '선택'); await settle(page, 1500); }
            else { await closeLov(page); picked = '(Lov 에 고를 데이터 없음)'; }
          }
        }
        const dd = await waitFrame(page, detailName as string | RegExp).catch(() => null);
        let entered = {} as Awaited<ReturnType<typeof fillAllFields>>;
        let msg = '';
        if (dd) {
          if (key === 'doc') {
            const file = test.info().outputPath('HighSpeedMixer_정기점검기준서.txt');
            fs.writeFileSync(file, 'High Speed Mixer 정기점검 기준서\n1. 임펠러 체결 상태\n2. 베어링 이상음\n3. 씰 누유\n');
            const fi = dd.locator('input[type=file]').first();
            if (await fi.count()) await fi.setInputFiles(file);
          }
          const over: Record<string, string> = key === 'eq' ? { 'workPmListEquipDetailDTO.remark': `${plan.name.replace('[sychoi] ', '')} 대상 설비` } : {};
          entered = await fillAllFields(page, dd, over, '');
          msg = await saveForm(page, dd);
        }
        const after = (await new Grid(await waitFrame(page, listName), header).rows()).length;
        log.push(`[${key}] ${popupOpen ? `Lov 선택 "${picked}", ` : ''}입력 ${Object.values(entered).map((e) => `${e.label}=${e.value}`).join(', ')} → 저장 "${msg || '없음'}", 행 ${before} → ${after}`);
        expect.soft(after, `${key} 행이 늘어야 함`).toBeGreaterThan(before);
      }
      note(log.join('\n'));
    });
  }
});
