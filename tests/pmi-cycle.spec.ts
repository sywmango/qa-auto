import { test, expect, Page, Frame } from '@playwright/test';
import {
  openMenu, waitFrame, clickButton, clickTab, fieldValue, settle, Grid,
  openLov, lovTotal, pickInLov, expandTreeNode, expandTreeUntil, visibleTreeNodes, lovContentFrame,
} from './support/dream';

// 작업관리 > 정기점검작업 > 정기점검주기 (AD230) 단위테스트
// 테스트 제목 앞의 번호는 docs\AD230_UT_정기점검주기_v3.xlsx 의 테스트ID 와 같습니다.
// 이 파일은 조회만 하는 케이스입니다. (데이터를 만들거나 바꾸지 않음)
// 데이터를 만드는 케이스는 pmi-cycle-data.spec.ts 에 있습니다.

const MENU = ['132', '372', '454'];
const F_COND = 'tabFrameTAB.workPmListInsList_workPmiMstr';
const F_LOC = 'tabFrameTAB.workPmiMstrLoc_workPmiMstr';
const F_CTG = 'tabFrameTAB.workPmiMstrCtg_workPmiMstr';
const F_DETAIL = 'tabFrameTAB.workPmListRInsDetail_workPmListInsList';

/** 결과서에 남길 실제 값 기록 */
function note(text: string) {
  test.info().annotations.push({ type: '실제결과', description: text });
}

async function openCond(page: Page) {
  await openMenu(page, MENU);
  await clickTab(page, '목록(조건)');
  return waitFrame(page, F_COND);
}

async function search(page: Page, f: Frame) {
  await f.locator('a.b_search:visible').first().click();
  await settle(page, 1500);
}

const listGrid = (f: Frame) => new Grid(f, '예방작업번호');

/** 설비가 등록된 첫 행 (테스트로 만든 설비 없는 주기는 건너뜀) */
async function firstRow(f: Frame) {
  const rows = await listGrid(f).rows();
  return rows.find((r) => r['설비']) ?? rows[0];
}

test.describe('AD230 정기점검주기 (조회)', () => {
  test('AD230_TC_001 검색 필드의 기본값을 확인한다.', async ({ page }) => {
    const f = await openCond(page);
    const ids = ['pmNo', 'pmDesc', 'equipDesc', 'eqLocDesc', 'filterPlantDesc', 'deptDesc', 'wkCtrDesc', 'empName', 'filterVendorDesc'];
    const values: Record<string, string> = {};
    for (const id of ids) values[id] = await fieldValue(f, `maPmMstrCommonDTO.${id}`);
    const active = await fieldValue(f, 'maPmMstrCommonDTO.filterIsActiveDesc');
    note(`시행여부="${active}", 그 외 필드 값: ${JSON.stringify(values)}`);
    expect(active, '시행여부 기본값').toBe('Y');
    for (const id of ids) expect.soft(values[id], `${id} 비어 있음`).toBe('');
  });

  test('AD230_TC_002 설비 Lov 팝업의 데이터를 확인한다.', async ({ page, context }) => {
    const f = await openCond(page);
    const lov = await openLov(page, f, 'maPmMstrCommonDTO.equipDesc');
    const lovCount = await lovTotal(lov);

    // 원본: 설비자산 > 설비 메뉴 목록(위치) 전체 건수
    const p2 = await context.newPage();
    await openMenu(p2, ['114', '447']);
    const ef = await waitFrame(p2, 'tabFrameTAB.assetMstrLoc_assetMstr');
    const eqTotal = await new Grid(ef, '설비번호').total();
    await p2.close();
    note(`설비 Lov 건수=${lovCount}, 설비 메뉴 건수=${eqTotal?.all}`);
    expect(lovCount, 'Lov 건수 = 설비 메뉴 건수').toBe(eqTotal?.all);
  });

  test('AD230_TC_003 그 외 검색 필드 Lov 팝업의 데이터를 확인한다.', async ({ page }) => {
    test.setTimeout(300_000);
    const f = await openCond(page);
    const fields = [
      ['설비위치', 'eqLocDesc'], ['공장명', 'filterPlantDesc'], ['부서명', 'deptDesc'], ['작업그룹명', 'wkCtrDesc'],
      ['담당자', 'empName'], ['거래처', 'filterVendorDesc'], ['시행여부', 'filterIsActiveDesc'],
    ];
    const result: string[] = [];
    for (const [label, id] of fields) {
      await openMenu(page, MENU);
      await clickTab(page, '목록(조건)');
      const cf = await waitFrame(page, F_COND);
      let count: number | null = null;
      try {
        const lov = await openLov(page, cf, `maPmMstrCommonDTO.${id}`);
        count = await lovTotal(lov);
      } catch (e) {
        result.push(`${label}: 팝업 열기 실패`);
        expect.soft(false, `${label} Lov 팝업이 열려야 함`).toBe(true);
        continue;
      }
      result.push(`${label}: ${count}건`);
      expect.soft(count, `${label} Lov 목록에 데이터가 있어야 함`).toBeGreaterThan(0);
    }
    // 부서 Lov(트리): 드림소프트웨어를 펼친 하위 부서가 [조직관리 > 부서] 메뉴 트리와 같은지
    await openMenu(page, MENU);
    await clickTab(page, '목록(조건)');
    const cf = await waitFrame(page, F_COND);
    const lov = await openLov(page, cf, 'maPmMstrCommonDTO.deptDesc');
    const lovTop = await visibleTreeNodes(lov);
    await expandTreeNode(page, lov, '드림소프트웨어');
    const lovOpen = await visibleTreeNodes(lov);
    const lovChildren = lovOpen.filter((n) => !lovTop.includes(n));
    await openMenu(page, ['121', '92']);
    const df = await waitFrame(page, 'tabFrameTAB.deptTreeList_deptListView');
    const menuTop = await visibleTreeNodes(df);
    await expandTreeNode(page, df, '드림소프트웨어');
    const menuChildren = (await visibleTreeNodes(df)).filter((n) => !menuTop.includes(n));
    result.push(`\n부서 트리: Lov 최상위 ${lovTop.length}개 / 부서 메뉴 최상위 ${menuTop.length}개, 드림소프트웨어 하위 Lov [${lovChildren.join(', ')}] / 메뉴 [${menuChildren.join(', ')}]`);
    expect.soft(lovChildren.length, '드림소프트웨어 하위 부서가 펼쳐져야 함').toBeGreaterThan(0);
    expect.soft([...lovChildren].sort(), 'Lov 하위 부서 = 부서 메뉴 하위 부서').toEqual([...menuChildren].sort());
    note(result.join(', '));
    expect(f).toBeTruthy();
  });

  test('AD230_TC_004 조건 하나로 정기점검주기를 검색한다.', async ({ page }) => {
    let f = await openCond(page);
    const first = await firstRow(f);
    // [검색 필드 id, 목록 열 이름, 넣을 값, Lov로 고르기]
    // 돋보기가 있는 필드는 사람처럼 Lov 팝업에서 골라야 조건이 걸립니다.
    const cases: [string, string, string, boolean, string?][] = [
      ['pmNo', '예방작업번호', first['예방작업번호'], false],
      ['pmDesc', '작업명', first['작업명'], false],
      ['equipDesc', '설비', first['설비'], true, '설비명'],
      // 부서명 Lov는 트리형: 상위 부서를 펼쳐 하위 팀(QA팀)을 고름
      ['deptDesc', '부서명', 'QA팀', true, '드림소프트웨어'],
    ];
    test.setTimeout(240_000);
    const log: string[] = [];
    for (const [id, col, value, byLov, lovLabel] of cases) {
      if (!value) { log.push(`${col}: 첫 행에 값 없음(건너뜀)`); continue; }
      f = await openCond(page);
      if (byLov) {
        const lov = await openLov(page, f, `maPmMstrCommonDTO.${id}`);
        if (id === 'deptDesc') await expandTreeUntil(page, lov, value);
        const picked = await pickInLov(page, lov, value, id === 'deptDesc' ? undefined : lovLabel).then(() => true, () => false);
        if (!picked) {
          log.push(`${col}="${value}": Lov 첫 화면에서 값을 찾지 못함`);
          expect.soft(picked, `${col} Lov에서 "${value}" 선택`).toBe(true);
          continue;
        }
        log.push(`  (${col} Lov 선택 후 입력칸 값: "${await fieldValue(f, `maPmMstrCommonDTO.${id}`)}")`);
      } else {
        await f.locator(`[id="maPmMstrCommonDTO.${id}"]`).fill(value);
      }
      await search(page, f);
      const g = listGrid(f);
      const rows = await g.rows();
      const total = await g.total();
      // 작업명은 띄어쓰기 단위로 검색됨 (모든 단어가 들어 있으면 일치로 봄)
      const words = col === '작업명' ? value.split(/\s+/).filter(Boolean) : [value];
      let bad = rows.filter((r) => r[col] !== undefined && !words.every((w) => r[col].includes(w)));
      // 설비 조건: 그 설비가 묶인 주기는 묶인 설비마다 한 행씩 나오는 것이 정상 (사용자 확인 2026-10-20)
      if (col === '설비') {
        const hit = new Set(rows.filter((r) => r['설비'] === value).map((r) => r['예방작업번호']));
        bad = bad.filter((r) => !hit.has(r['예방작업번호']));
      }
      log.push(`${col}="${value}": ${rows.length}행, Total ${total?.loaded}/${total?.all}, 불일치 ${bad.length}행` + (bad.length ? ` (예: ${bad.slice(0, 3).map((b) => b[col]).join(' / ')})` : ''));
      expect.soft(rows.length, `${col} 검색 결과가 있어야 함`).toBeGreaterThan(0);
      expect.soft(bad.length, `${col} 조건과 다른 행이 없어야 함`).toBe(0);
      expect.soft(total?.loaded, `${col} Total 과 행 수 일치`).toBe(rows.length);
    }
    note(log.join('\n'));
  });

  test('AD230_TC_005 여러 조건을 조합하여 검색한다.', async ({ page }) => {
    test.setTimeout(120_000);
    const f = await openCond(page);
    // 작업명 "점검" + 시행여부 Y(기본값) 조합
    await f.locator('[id="maPmMstrCommonDTO.pmDesc"]').fill('점검');
    await search(page, f);
    const rows = await listGrid(f).rows();
    const bad = rows.filter((r) => !r['작업명'].includes('점검') || (r['시행여부'] && r['시행여부'] !== 'Y'));
    // 설비(Lov 선택) + 작업명 조합
    const f2 = await openCond(page);
    const first = await firstRow(f2);
    const lov = await openLov(page, f2, 'maPmMstrCommonDTO.equipDesc');
    await pickInLov(page, lov, first['설비'], '설비명');
    await f2.locator('[id="maPmMstrCommonDTO.pmDesc"]').fill(first['작업명'].split(/\s+/)[0]);
    await search(page, f2);
    const rows2 = await listGrid(f2).rows();
    // 설비가 묶인 주기는 묶인 설비마다 한 행씩 나옴 (정상) → 같은 주기에 그 설비 행이 있으면 일치로 봄
    const hit2 = new Set(rows2.filter((r) => r['설비'] === first['설비']).map((r) => r['예방작업번호']));
    const bad2 = rows2.filter((r) => !hit2.has(r['예방작업번호']) || !r['작업명'].includes(first['작업명'].split(/\s+/)[0]));
    note(`① 작업명 "점검" + 시행여부 Y: ${rows.length}행, 불일치 ${bad.length}행\n② 설비 "${first['설비']}" + 작업명 "${first['작업명'].split(/\s+/)[0]}": ${rows2.length}행, 불일치 ${bad2.length}행`);
    expect.soft(rows.length).toBeGreaterThan(0);
    expect.soft(bad.length).toBe(0);
    expect.soft(rows2.length).toBeGreaterThan(0);
    expect.soft(bad2.length).toBe(0);
  });

  test('AD230_TC_006 정기점검주기 전체를 검색한다.', async ({ page }) => {
    const f = await openCond(page);
    const before = await listGrid(f).total();
    await f.locator('[id="maPmMstrCommonDTO.filterIsActiveDesc"]').fill('');
    await search(page, f);
    const after = await listGrid(f).total();
    note(`시행여부=Y 기본 검색 ${before?.all}건 → 조건 없이 검색 ${after?.all}건`);
    expect(after?.all ?? 0).toBeGreaterThanOrEqual(before?.all ?? 0);
  });

  test('AD230_TC_007 검색 결과가 없는 조건으로 검색한다.', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const f = await openCond(page);
    await f.locator('[id="maPmMstrCommonDTO.pmDesc"]').fill('존재하지않는작업명_ZZ9');
    await search(page, f);
    const rows = await listGrid(f).rows();
    const total = await listGrid(f).total();
    note(`${rows.length}행, Total ${total?.loaded}/${total?.all}, 스크립트 에러 ${errors.length}건`);
    expect(rows.length).toBe(0);
    expect(total?.all).toBe(0);
    expect(errors).toEqual([]);
  });

  test('AD230_TC_008 트리에서 위치/종류를 선택하여 조회한다.', async ({ page }) => {
    await openMenu(page, MENU);
    const lf = await waitFrame(page, F_LOC);
    const tree = new Grid(lf, '위치명');
    const places = (await tree.rows()).map((r) => r['위치명']).filter(Boolean);
    const log: string[] = [];
    // 정기점검주기가 있는 위치 하나 고르기: 목록 첫 행의 설비위치 맨 앞 단어
    const list = new Grid(lf, '예방작업번호');
    const allRows = await list.rows();
    const target = places.find((p) => allRows.some((r) => (r['설비위치'] || '').startsWith(p))) ?? places[0];
    await tree.clickCell('위치명', target);
    await settle(page, 1500);
    const rows = await list.rows();
    const bad = rows.filter((r) => !(r['설비위치'] || '').startsWith(target));
    log.push(`위치 "${target}" 선택: ${rows.length}행, 다른 위치 ${bad.length}행`);
    expect.soft(bad.length, '선택한 위치의 데이터만 보여야 함').toBe(0);

    await clickTab(page, '목록(종류)');
    const cf = await waitFrame(page, F_CTG);
    const ctgHeads = await cf.evaluate(() => [...document.querySelectorAll<HTMLElement>('.hdrcell')].filter((h) => h.offsetWidth).map((h) => h.innerText.trim()));
    log.push(`목록(종류) 헤더: ${ctgHeads.slice(0, 4).join(', ')}`);
    expect.soft(ctgHeads.length, '목록(종류) 화면이 열려야 함').toBeGreaterThan(0);
    note(log.join('\n'));
  });

  test('AD230_TC_009 조회된 목록을 정렬한다.', async ({ page }) => {
    const f = await openCond(page);
    const g = listGrid(f);
    const header = f.locator('div.gridbox:visible .hdrcell', { hasText: /^\s*예방작업번호\s*$/ }).first();
    await header.click();
    await settle(page, 1000);
    const a = (await g.rows()).map((r) => r['예방작업번호']);
    await header.click();
    await settle(page, 1000);
    const b = (await g.rows()).map((r) => r['예방작업번호']);
    const num = (x: string[]) => x.map((v) => Number(v));
    const asc = num(a).every((v, i, arr) => i === 0 || arr[i - 1] <= v);
    const desc = num(b).every((v, i, arr) => i === 0 || arr[i - 1] >= v);
    note(`1회 클릭 앞 5개: ${a.slice(0, 5).join(',')} / 2회 클릭 앞 5개: ${b.slice(0, 5).join(',')}`);
    expect(asc || desc, '정렬되어야 함').toBe(true);
    expect(asc !== desc || a.join() !== b.join(), '두 번 누르면 정렬 방향이 바뀌어야 함').toBe(true);
  });

  test('AD230_TC_010 목록 건수 표시를 확인한다.', async ({ page }) => {
    const f = await openCond(page);
    const g = listGrid(f);
    const t1 = await g.total();
    const rows1 = (await g.rows()).length;
    // 목록을 끝까지 스크롤해서 더 불러오기
    for (let i = 0; i < 30; i++) {
      await f.evaluate(() => { const o = document.querySelector('div.gridbox .objbox'); if (o) o.scrollTop = o.scrollHeight; });
      await page.waitForTimeout(400);
    }
    await settle(page, 1000);
    const t2 = await g.total();
    const all = await g.rows();
    const rows2 = all.length;
    const keys = all.map((r) => `${r['예방작업번호']}|${r['설비번호']}`);
    const dup = keys.length - new Set(keys).size;
    const notY = all.filter((r) => r['시행여부'] && r['시행여부'] !== 'Y').map((r) => `${r['예방작업번호']}(${r['시행여부']})`);
    // 목록(조건)은 설비 1대당 1행이라, 설비가 2대 이상인 예방작업번호는 여러 행으로 나옵니다.
    const byNo = new Map<string, number>();
    for (const r of all) byNo.set(r['예방작업번호'], (byNo.get(r['예방작업번호']) ?? 0) + 1);
    const multi = [...byNo].filter(([, n]) => n > 1);
    const extra = multi.reduce((s, [, n]) => s + n - 1, 0);
    const noEquip = all.filter((r) => !r['설비번호']).map((r) => r['예방작업번호']);
    test.info().annotations.push({ type: '실제결과', description: `중복 행(예방작업번호+설비번호) ${dup}건, 시행여부 Y 아닌 행 ${notY.length}건, 예방작업번호 ${byNo.size}개, 설비 2대 이상 ${multi.map(([k, n]) => `${k}(${n}행)`).join(', ') || '없음'} → 추가 행 ${extra}건, 설비 없는 주기 ${noEquip.length}건(${noEquip.join(',')})` });
    note(`처음 Total ${t1?.loaded}/${t1?.all} (행 ${rows1}) → 스크롤 후 Total ${t2?.loaded}/${t2?.all} (행 ${rows2})`);
    expect(t1?.loaded).toBe(rows1);
    expect(t2?.loaded).toBeGreaterThan(t1?.loaded ?? 0);
    expect(t2?.all, '처음 표시된 전체 건수와 끝까지 불러온 건수가 같아야 함').toBe(t1?.all);
  });

  test('AD230_TC_011 (행 클릭) 상세정보를 조회한다.', async ({ page }) => {
    const f = await openCond(page);
    const first = await firstRow(f);
    await listGrid(f).clickCell('작업명', first['작업명']);
    const d = await waitFrame(page, F_DETAIL);
    await expect(d.getByText(new RegExp(`정기점검주기설정\\s*:\\s*${first['예방작업번호']}`))).toBeVisible();
    note(`상세 제목: 정기점검주기설정 : ${first['예방작업번호']} / ${first['작업명']}`);
  });

  test('AD230_TC_012 (상세보기 버튼) 상세정보를 조회한다.', async ({ page }) => {
    const f = await openCond(page);
    const r = await firstRow(f);
    await listGrid(f).clickCell('작업명', r['작업명']);
    await settle(page, 1000);
    // 상세보기는 새 브라우저 창으로 열립니다.
    const popWin = page.context().waitForEvent('page', { timeout: 15_000 }).catch(() => null);
    await clickButton(f, '상세보기');
    const win = await popWin;
    expect(win, '상세보기 새 창이 열려야 함').toBeTruthy();
    // 새 창 상세 제목은 "7920 / 충진기 점검" 형태 (앞의 "정기점검주기설정 :" 없음)
    const title = new RegExp(`(^|\\s)${r['예방작업번호']}\\s*/\\s*`);
    await expect
      .poll(async () => {
        for (const fr of win!.frames()) {
          const t = await fr.evaluate(() => document.body?.innerText || '').catch(() => '');
          if (title.test(t)) return true;
        }
        return false;
      }, { message: '새 창에 같은 데이터의 상세가 보여야 함', timeout: 20_000 })
      .toBe(true);
    note(`상세보기 클릭 → 새 창에 "${r['예방작업번호']} / ${r['작업명']}" 상세 표시 (하단 상세와 같은 데이터)`);
    await win!.close();
  });

  test('AD230_TC_025 목록을 Excel로 다운로드한다.', async ({ page }) => {
    const f = await openCond(page);
    const total = await listGrid(f).total();
    // Excel 버튼은 새 창(excelExport.do)을 열고 그 창에서 파일이 내려받아집니다.
    const winP = page.context().waitForEvent('page', { timeout: 15_000 });
    await clickButton(f, 'Excel');
    const win = await winP;
    const file = await win.waitForEvent('download', { timeout: 60_000 });
    const saved = test.info().outputPath(file.suggestedFilename());
    await file.saveAs(saved);
    const size = (await import('fs')).statSync(saved).size;
    note(`파일 "${file.suggestedFilename()}" ${size.toLocaleString()} bytes 받음 (목록 Total ${total?.loaded}/${total?.all})`);
    test.info().annotations.push({ type: '엑셀파일', description: saved });
    expect(size).toBeGreaterThan(0);
  });

  test('AD230_TC_013 목록과 상세의 값이 일치하는지 확인한다.', async ({ page }) => {
    const f = await openCond(page);
    const r = await firstRow(f);
    await listGrid(f).clickCell('작업명', r['작업명']);
    const d = await waitFrame(page, F_DETAIL);
    await settle(page, 1000);
    const pairs: [string, string][] = [
      ['예방작업번호', 'pmNo'], ['작업명', 'description'], ['작업그룹명', 'wkCtrDesc'], ['담당자', 'empName'],
      ['일정생성방법', 'scheduleTypeDesc'], ['작업형태', 'pmTypeDesc'],
    ];
    const diff: string[] = [];
    for (const [col, id] of pairs) {
      const dv = await fieldValue(d, `maPmMstrDetailDTO.${id}`);
      if ((r[col] ?? '') !== dv) diff.push(`${col}: 목록="${r[col]}" 상세="${dv}"`);
    }
    note(diff.length ? diff.join('\n') : `${pairs.length}개 항목 모두 일치 (예방작업번호 ${r['예방작업번호']})`);
    expect(diff).toEqual([]);
  });

  test('AD230_TC_014 (목록) 데이터 표시 형식을 확인한다.', async ({ page }) => {
    const f = await openCond(page);
    const g = listGrid(f);
    // 열 정렬(왼쪽/가운데/오른쪽)은 사용자가 Setting에서 바꿀 수 있는 값이라 판정에서 제외하고 기록만 합니다.
    const log: string[] = [];
    for (const col of ['순번', '예방작업번호', '주기', '작업명']) log.push(`${col} ${(await g.align(col))[0] ?? '-'}`);
    const rows = await g.rows();
    const badNo = rows.filter((r) => !/^\d+$/.test(r['예방작업번호']));
    const badCycle = rows.filter((r) => r['주기'] && !/^\d{1,3}(,\d{3})*$/.test(r['주기']));
    note(`예방작업번호 형식 오류 ${badNo.length}건, 주기 숫자 형식 오류 ${badCycle.length}건 (참고: 정렬 ${log.join(', ')})`);
    expect.soft(badNo.length, '예방작업번호는 숫자').toBe(0);
    expect.soft(badCycle.length, '주기는 숫자(천단위 쉼표)').toBe(0);
  });

  test('AD230_TC_016 읽기전용 필드를 확인한다.', async ({ page }) => {
    const f = await openCond(page);
    const r = await firstRow(f);
    await listGrid(f).clickCell('작업명', r['작업명']);
    const d = await waitFrame(page, F_DETAIL);
    await settle(page, 1000);
    const log: string[] = [];
    for (const id of ['woTypeDesc', 'pmTypeDesc', 'pmNo']) {
      const ro = await d.locator(`[id="maPmMstrDetailDTO.${id}"]`).evaluate((e) => (e as HTMLInputElement).readOnly || (e as HTMLInputElement).disabled);
      log.push(`${id}: ${ro ? '읽기전용' : '수정 가능'}`);
      expect.soft(ro, `${id} 읽기전용`).toBe(true);
    }
    note(log.join(', '));
  });

  test('AD230_TC_017 상세를 닫는다.', async ({ page }) => {
    const f = await openCond(page);
    const r = await firstRow(f);
    await listGrid(f).clickCell('작업명', r['작업명']);
    const d = await waitFrame(page, F_DETAIL);
    const title = d.getByText(/정기점검주기설정\s*:/).first();
    await expect(title).toBeVisible();
    // 상세 제목줄 오른쪽 끝의 닫기(ⓧ): Linked 버튼이 있는 버튼 묶음의 마지막 버튼
    const bar = await d.getByText('Linked', { exact: true }).first().evaluate((e) => {
      let x: HTMLElement | null = e as HTMLElement;
      for (let i = 0; i < 4 && x; i++) x = x.parentElement;
      return x ? x.outerHTML.slice(0, 1500) : '';
    });
    test.info().annotations.push({ type: 'debug', description: bar });
    const closeBtn = d.locator('[class*="close"]:visible, [class*="Close"]:visible').first();
    await closeBtn.click({ timeout: 5_000 });
    await settle(page, 1000);
    await expect(title).toBeHidden();
    note('하단 상세의 닫기(ⓧ) 클릭 후 상세가 닫힘');
  });

  test('AD230_TC_026 Setting 팝업이 열리는지 확인한다.', async ({ page }) => {
    const f = await openCond(page);
    const before = page.frames().length;
    await clickButton(f, 'Setting');
    await settle(page, 1500);
    const popup = page.frames().find((x) => x.name() === 'popupIframe1');
    const text = popup ? await popup.evaluate(() => document.body.innerText.slice(0, 200)).catch(() => '') : '';
    note(`검색 영역 Setting 클릭 → 팝업 ${popup ? '열림' : '안 열림'} (${text.split('\n').slice(0, 3).join(' / ')}) frames ${before}→${page.frames().length}`);
    expect(popup, 'Setting 팝업').toBeTruthy();
  });

  // Linked 메뉴 항목은 새 브라우저 창으로 열립니다. 새 창에 이 예방작업번호의 데이터가 보이는지 확인합니다.
  async function openLinked(page: Page, linkClass: string, label: string) {
    const f = await openCond(page);
    const r = await firstRow(f);
    const no = r['예방작업번호'];
    await listGrid(f).clickCell('작업명', r['작업명']);
    const d = await waitFrame(page, F_DETAIL);
    await settle(page, 1000);
    await clickButton(d, 'Linked');
    const popWin = page.context().waitForEvent('page', { timeout: 10_000 }).catch(() => null);
    await d.locator(`a.${linkClass}`).click();
    const win = await popWin;
    expect(win, `${label} 새 창이 열려야 함`).toBeTruthy();
    await settle(win!, 2500);
    let found = false;
    let title = '';
    const extra: string[] = [];
    for (const fr of win!.frames()) {
      const t = await fr.evaluate(() => document.body?.innerText || '').catch(() => '');
      const tot = t.match(/Total\s*:\s*[\d,]+\s*\/\s*[\d,]+/);
      if (tot) extra.push(tot[0]);
      const vals = await fr.evaluate((no) => [...document.querySelectorAll('input')].filter((i) => i.value === no).map((i) => i.id), no).catch(() => [] as string[]);
      if (vals.length) extra.push('조건 ' + vals.join(','));
      if (!title) title = t.split('\n').map((s) => s.trim()).find(Boolean) ?? '';
      if (new RegExp(`(^|\\s)${no}(\\s|$)`).test(t)) found = true;
    }
    note(`Linked > ${label}: 새 창 열림 (첫 글자 "${title}"), 예방작업번호 ${no} 데이터 ${found ? '표시됨' : '안 보임'} (${extra.join(' / ')})`);
    // 일정이 없는 주기면 목록은 비어 있으므로, 새 창의 검색조건에 이 예방작업번호가 들어갔는지로 판단합니다.
    const filtered = extra.some((x) => x.startsWith('조건 '));
    expect.soft(found || filtered, `새 창이 예방작업번호 ${no} 조건으로 열려야 함`).toBe(true);
    await win!.close();
  }

  test('AD230_TC_029 점검일정을 확인한다. (Linked)', async ({ page }) => {
    await openLinked(page, 'link_pmrinssched', '점검일정');
  });

  test('AD230_TC_030 연간점검일정을 확인한다. (Linked)', async ({ page }) => {
    await openLinked(page, 'link_pmrinsyearsched', '연간점검일정');
  });

  test('AD230_TC_031 설비 목록을 조회한다. (하위 목록)', async ({ page }) => {
    const f = await openCond(page);
    const r = await firstRow(f);
    await listGrid(f).clickCell('작업명', r['작업명']);
    const eq = await waitFrame(page, /^tabFrameTAB\.workPmListRInsEquipList_/);
    await settle(page, 1500);
    const g = new Grid(eq, '최초작업예정일');
    const rows = await g.rows();
    const total = await g.total();
    note(`예방작업번호 ${r['예방작업번호']}: 설비 ${rows.length}행, Total ${total?.loaded}/${total?.all}, 첫 설비 ${rows[0]?.['설비번호'] ?? '-'}`);
    expect(total?.all).toBe(rows.length);
    // 목록(조건)은 설비 1대당 1행이므로, 같은 예방작업번호 행 수와 설비 수가 같아야 함
    const sameNo = (await listGrid(f).rows()).filter((x) => x['예방작업번호'] === r['예방작업번호']).length;
    expect.soft(rows.length, '목록(조건)의 같은 예방작업번호 행 수 = 설비 수').toBe(sameNo);
  });
});






