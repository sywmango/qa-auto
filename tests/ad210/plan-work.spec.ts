import { test, expect, Page, Frame } from '@playwright/test';
import fs from 'fs';
import { clickButton, fieldValue, settle, waitFrame, Grid } from '../support/dream';
import { put, dateAfter, saveForm, fillAllFields, listFields } from '../support/form';
import { TAB, openTab, search, clickRow, detailOf, note, loadAll, pmiDetailFrame } from '../support/pmplan';
import { PM, EQ, state, keep, okAndMessage, myPlans, rowIndex, addPlans, checkRows } from '../support/pmplan-data';

// 정기점검계획 (AD210) — 작업발행된 점검작업 상세 (수정, 확정, 하위 탭, Linked)
// plan-data.spec.ts 에서 확정(작업발행)한 계획(state.d4)과, 이 파일에서 오늘 날짜로 추가·확정·완료하는 계획을 씀

// 한 파일 안에서는 위에서 아래 순서로 실행 (workers 1). 앞 케이스가 실패해도 뒤 케이스는 계속 실행
test.setTimeout(300_000);
const P = 'workPmiDetailDTO';

/** 이 설비의 날짜 date 계획을 목록(조건)에서 눌러 점검작업 상세 */
async function openWork(page: Page, date: string, status = '작업발행') {
  const { f, rows } = await myPlans(page);
  const i = rowIndex(rows, date, status);
  expect(i, `${date} ${status} 계획`).toBeGreaterThanOrEqual(0);
  await clickRow(f, i);
  return { d: await detailOf(page, 'period', 'pmi'), row: rows[i] };
}
const v = (d: Frame, id: string) => fieldValue(d, `${P}.${id}`).catch(() => '');

/** 점검항목마다 점검값 입력 (점검항목 행 클릭 → 점검값 상세에서 점검값 = 기준값) */
async function fillPoints(page: Page) {
  const pl = await waitFrame(page, 'tabFrameTAB.workPmiPointList_workPmiDetail');
  await settle(page, 1500);
  const pts = await new Grid(pl, '점검항목').rows();
  const log: string[] = [];
  for (const p of pts) {
    await new Grid(pl, '점검항목').clickCell('점검항목', p['점검항목']);
    await settle(page, 2500);
    const pd = page.frames().find((x) => /PointValueDetail_workPmiPointList$/.test(x.name()) && x.url() !== 'about:blank');
    if (!pd) { log.push(`${p['점검항목']}: 점검값 상세 안 열림`); continue; }
    const value = p['기준값'] || '1';
    await put(pd.locator('[id="workPmiPointDetailDTO.resultValue"]'), value);
    const msg = await saveForm(page, pd);
    log.push(`${p['점검항목']}: 점검값 ${value} 저장 "${msg || '안내 없음'}"`);
  }
  await settle(page, 1500);
  const after = await new Grid(pl, '점검항목').rows();
  return { log, after };
}

test.describe('AD210 정기점검계획 (점검작업)', () => {
  test('AD210_EC_007 앞날짜 점검작업을 확정한다.', async ({ page }) => {
    const { d } = await openWork(page, state.d4);
    const day = await v(d, 'wkorDate');
    await clickButton(d, '확정');
    const msg = await okAndMessage(page);
    const st = (await myPlans(page)).mine.filter((r) => r['일정조정'] === state.d4).map((r) => r['일정상태']);
    note(`점검일자 ${day} (오늘 ${dateAfter(0)}) 작업에서 확정: ${msg}, 상태 ${st.join(',')}`);
    expect.soft(msg).toMatch(/미리|완료처리할 수 없/);
    expect(st).toEqual(['작업발행']);
  });

  test('AD210_TC_022 작업발행 상태의 점검작업을 수정한다.', async ({ page }) => {
    const { d } = await openWork(page, state.d4);
    const before = { name: await v(d, 'pmiDesc'), remark: await v(d, 'remark') };
    const name = before.name.replace(/\s*\(점검작업 수정\)$/, '') + ' (점검작업 수정)';
    const remark = '임펠러 체결 토크 52N·m 재확인, 메인 베어링 표면온도 정상';
    await put(d.locator(`[id="${P}.pmiDesc"]`), name);
    await put(d.locator(`[id="${P}.startTime"]`), '09:00');
    await put(d.locator(`[id="${P}.endTime"]`), '09:40');
    await put(d.locator(`[id="${P}.remark"]`), remark);
    const msg = await saveForm(page, d);
    const { d: d2, row } = await openWork(page, state.d4);
    const now = { name: await v(d2, 'pmiDesc'), start: await v(d2, 'startTime'), end: await v(d2, 'endTime'), remark: await v(d2, 'remark'), time: await v(d2, 'workTime') };
    note(`점검명·시작 09:00·종료 09:40·비고 변경 저장 "${msg || '안내 없음'}"\n다시 열기: ${JSON.stringify(now)}\n목록: 비고 "${row['비고']}", 담당자(실행) "${row['담당자(실행)']}"`);
    expect.soft(now.name).toBe(name);
    expect.soft(now.start).toBe('09:00');
    expect.soft(now.end).toBe('09:40');
    expect.soft(now.remark).toBe(remark);
    expect.soft(now.time, '점검시간 40분').toBe('40');
  });

  test('AD210_TC_023 점검작업의 필수값을 지우고 저장한다.', async ({ page }) => {
    const log: string[] = [];
    for (const [id, label] of [['pmiDesc', '점검명'], ['wkorDate', '점검일자'], ['deptDesc', '담당부서']]) {
      const { d } = await openWork(page, state.d4);
      const before = await v(d, id);
      await put(d.locator(`[id="${P}.${id}"]`), '');
      const msg = await saveForm(page, d);
      const { d: d2 } = await openWork(page, state.d4);
      const after = await v(d2, id);
      log.push(`${label} 지우고 저장: "${msg || '안내 없음'}", 다시 열면 "${after}"`);
      expect.soft(msg, `${label} 필수 안내`).toMatch(/필수|입력/);
      expect.soft(after, `${label} 저장 안 됨`).toBe(before);
    }
    note(log.join('\n'));
  });

  test('AD210_EC_008 점검종료시간을 시작시간보다 앞으로 넣는다.', async ({ page }) => {
    const { d } = await openWork(page, state.d4);
    await put(d.locator(`[id="${P}.startTime"]`), '10:00');
    await put(d.locator(`[id="${P}.endTime"]`), '09:00');
    const msg = await saveForm(page, d);
    const { d: d2 } = await openWork(page, state.d4);
    const now = `${await v(d2, 'startDate')} ${await v(d2, 'startTime')} ~ ${await v(d2, 'endDate')} ${await v(d2, 'endTime')}, 점검시간 ${await v(d2, 'workTime')}`;
    note(`시작 10:00, 종료 09:00 (같은 날) 저장: "${msg || '안내 없음'}"\n다시 열기: ${now}`);
    expect(now, '저장되지 않아야 함').not.toContain('10:00 ~');
  });

  test('AD210_EC_011 비고·점검명에 특수문자와 긴 글자를 넣는다.', async ({ page }) => {
    const { d } = await openWork(page, state.d4);
    const special = `[sychoi] 특수문자 ' " < > & 확인`;
    const long = '[sychoi] ' + '가'.repeat(400);
    await put(d.locator(`[id="${P}.remark"]`), special);
    const m1 = await saveForm(page, d);
    let { d: d2 } = await openWork(page, state.d4);
    const r1 = await v(d2, 'remark');
    const name0 = await v(d2, 'pmiDesc');
    await put(d2.locator(`[id="${P}.pmiDesc"]`), long);
    const m2 = await saveForm(page, d2);
    ({ d: d2 } = await openWork(page, state.d4));
    const n2 = await v(d2, 'pmiDesc');
    note(`비고 "${special}" 저장 "${m1 || '안내 없음'}" → 다시 열면 "${r1}"\n점검명 ${long.length}자 저장 "${m2 || '안내 없음'}" → 다시 열면 ${n2.length}자${n2 === name0 ? ' (원래 이름 그대로)' : ''}`);
    expect.soft(r1, '특수문자 그대로').toBe(special);
    expect.soft(n2.length < long.length || /길이|초과|byte|바이트/.test(m2), '최대 길이 초과는 막힘').toBe(true);
    // 점검명 되돌리기
    if (n2 !== name0) { await put(d2.locator(`[id="${P}.pmiDesc"]`), name0); await saveForm(page, d2); }
  });

  test('AD210_TC_041 점검항목의 점검값을 입력한다.', async ({ page }) => {
    await openWork(page, state.d4);
    const r = await fillPoints(page);
    note(`${r.log.join('\n')}\n목록 점검값: ${r.after.map((p) => `${p['점검항목']}=${p['점검값']}`).join(', ')}`);
    expect(r.after.every((p) => p['점검값'] !== ''), '모든 항목에 점검값 표시').toBe(true);
  });

  test('AD210_TC_046 첨부문서를 등록하고 삭제한다.', async ({ page }) => {
    await openWork(page, state.d4);
    // 하위 탭은 아코디언으로 모두 펼쳐져 있음 (탭 글자를 누르면 접힘)
    const lf = await waitFrame(page, 'tabFrameTAB.maPtDocLibList_workPmiDetail');
    await lf.locator('body').scrollIntoViewIfNeeded().catch(() => {});
    await clickButton(lf, '생성');
    await settle(page, 2000);
    const dd = await waitFrame(page, 'tabFrameTAB.maPtDocLibDetail_maPtDocLibList');
    await settle(page, 1000);
    const title = '[sychoi] 정기점검 결과 사진';
    const file = test.info().outputPath('점검결과.txt');
    fs.writeFileSync(file, '임펠러 체결 토크 52N·m, 베어링 표면온도 41℃ 정상\n');
    const fi = dd.locator('input[type=file]').first();
    const hasFile = (await fi.count()) > 0;
    if (hasFile) await fi.setInputFiles(file);
    const fields = await listFields(dd);
    const over: Record<string, string | null> = {};
    for (const x of fields) if (x.label === '제목') over[x.id] = title;
    await fillAllFields(page, dd, over);
    const msg = await saveForm(page, dd);
    await settle(page, 1500);
    let rows = await new Grid(lf, '제목').rows();
    const added = rows.filter((r) => r['제목'] === title).length;
    const idx = rows.findIndex((r) => r['제목'] === title);
    let delMsg = '';
    if (idx >= 0) {
      await lf.locator('div.gridbox:visible .objbox tr:visible img[src*="item_chk"]').nth(idx).click();
      await clickButton(lf, '삭제');
      delMsg = await okAndMessage(page);
      rows = await new Grid(lf, '제목').rows();
    }
    const left = rows.filter((r) => r['제목'] === title).length;
    note(`첨부문서 생성 (파일 ${hasFile ? '첨부' : '칸 없음'}) 저장 "${msg || '안내 없음'}" → 목록 ${added}건\n체크 후 삭제: ${delMsg} → 남은 ${left}건`);
    expect.soft(added, '등록').toBe(1);
    expect(left, '삭제').toBe(0);
  });

  test('AD210_TC_047 첨부문서를 선택 없이 삭제한다. (체크X)', async ({ page }) => {
    await openWork(page, state.d4);
    const lf = await waitFrame(page, 'tabFrameTAB.maPtDocLibList_workPmiDetail');
    await clickButton(lf, '삭제');
    const msg = await okAndMessage(page);
    note(`체크 없이 삭제: ${msg}`);
    expect(msg).toMatch(/선택.*없/);
  });

  for (const [id, label] of [['AD210_TC_038', '기준서'], ['AD210_TC_039', '정기점검결과출력']]) {
    test(`${id} ${label === '기준서' ? '기준서를 확인한다.' : '정기점검결과 출력물을 확인한다.'}`, async ({ page }) => {
      const { d } = await openWork(page, state.d4);
      await clickButton(d, 'Linked');
      await settle(page, 1000);
      const links = await d.locator('a:visible').evaluateAll((as) => as.map((a) => (a as HTMLElement).innerText.trim()).filter(Boolean));
      const winP = page.context().waitForEvent('page', { timeout: 15_000 }).catch(() => null);
      const before = page.frames().length;
      await d.locator('a:visible', { hasText: new RegExp(label) }).first().click();
      const win = await winP;
      await settle(win ?? page, 3000);
      let text = '';
      for (const fr of (win ?? page).frames()) text += ' ' + (await fr.evaluate(() => document.body?.innerText || '').catch(() => ''));
      text = text.replace(/\s+/g, ' ');
      // 기준서는 예방작업번호, 결과출력은 설비번호·점검일자로 이 작업인지 확인
      const hasPm = text.includes(PM) || (text.includes(EQ) && text.includes(state.d4));
      note(`Linked 메뉴 [${links.slice(-8).join(', ')}] → ${label}: ${win ? '새 창' : `같은 창(프레임 ${before}→${page.frames().length})`} 열림, 예방작업번호 ${PM} ${hasPm ? '보임' : '안 보임'} (앞부분 "${text.slice(0, 80)}")`);
      expect(win || page.frames().length > before, `${label} 열림`).toBeTruthy();
      expect.soft(hasPm, `${label} 에 이 작업의 정보`).toBe(true);
      await win?.close();
    });
  }

  test('AD210_TC_037 점검작업을 확정(완료)처리한다. (필수값 입력X)', async ({ page }) => {
    const { d } = await openWork(page, state.d4);
    await put(d.locator(`[id="${P}.pmiDesc"]`), '');
    await clickButton(d, '확정');
    const msg = await okAndMessage(page);
    const st = (await myPlans(page)).mine.filter((r) => r['일정조정'] === state.d4).map((r) => r['일정상태']);
    note(`점검명을 비우고 확정: ${msg}, 상태 ${st.join(',')}`);
    expect.soft(msg).toMatch(/필수|입력/);
    expect(st).toEqual(['작업발행']);
  });

  test('AD210_TC_036 점검작업을 확정(완료)처리한다. (필수값 입력O)', async ({ page }) => {
    const today = dateAfter(0);
    // 오늘 날짜 계획을 추가하고 일정확정 → 점검값 입력 → 확정
    if (!state.today || state.today !== today) {
      const r = await addPlans(page, [today]);
      keep('today', today);
      note(`오늘(${today}) 계획 추가: ${r.msg}`);
    }
    let mine = (await myPlans(page)).mine.filter((x) => x['일정조정'] === today);
    if (mine.some((x) => x['일정상태'] === '작업계획')) {
      const y = await openTab(page, 'year');
      await y.locator(`[id="${TAB.year.dto}.filterPmNo"]`).fill(PM);
      await search(page, y);
      await y.locator('span.p:visible a').nth(Number(today.slice(5, 7)) - 1).click();
      await settle(page, 2500);
      const yr = await loadAll(page, y);
      await checkRows(y, [yr.findIndex((r) => r['설비번호'] === EQ && r['작업일자'] === today && r['일정상태'] === '작업계획')]);
      await clickButton(y, '일정확정하기');
      note(`오늘 계획 일정확정: ${await okAndMessage(page)}`);
      mine = (await myPlans(page)).mine.filter((x) => x['일정조정'] === today);
    }
    await openWork(page, today);
    const pts = await fillPoints(page);
    const { d } = await openWork(page, today);
    await put(d.locator(`[id="${P}.startTime"]`), '09:00');
    await put(d.locator(`[id="${P}.endTime"]`), '09:45');
    await saveForm(page, d);
    const { d: d2 } = await openWork(page, today);
    await clickButton(d2, '확정');
    const msg = await okAndMessage(page);
    const after = (await myPlans(page)).mine.filter((x) => x['일정조정'] === today);
    const done = after.find((x) => x['일정상태'] === '작업완료');
    let ro: string[] = [];
    if (done) {
      const { d: d3 } = await openWork(page, today, '작업완료');
      ro = await d3.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('input[id^="workPmiDetailDTO."], textarea[id^="workPmiDetailDTO."]')].filter((e) => e.offsetWidth > 0 && !(e.readOnly || e.disabled)).map((e) => e.id.split('.')[1]));
    }
    note(`${pts.log.join('\n')}\n확정: ${msg}\n목록: ${after.map((x) => `${x['일정조정']} ${x['일정상태']} 완료일자 ${x['완료일자']}`).join(', ')}\n완료 후 수정 가능한 칸: ${ro.join(', ') || '없음'}`);
    expect(done, '작업완료로 바뀜').toBeTruthy();
    expect.soft(done?.['완료일자'], '완료일자 = 확정한 날').toBe(today);
    expect.soft(ro, '완료 후 수정 불가').toEqual([]);
  });

  test('AD210_EC_009 작업완료 건을 수정한다.', async ({ page }) => {
    const today = state.today;
    const { d } = await openWork(page, today, '작업완료');
    const before = await v(d, 'remark');
    const btns = await d.locator('a:visible').evaluateAll((as) => as.map((a) => (a as HTMLElement).innerText.trim()).filter((t) => /저장|확정/.test(t)));
    const input = d.locator(`[id="${P}.remark"]`);
    const editable = await input.evaluate((e) => !((e as HTMLInputElement).readOnly || (e as HTMLInputElement).disabled));
    let msg = '';
    if (editable && btns.includes('저장')) { await put(input, '[sychoi] 완료 후 수정 시도'); msg = await saveForm(page, d); }
    const { d: d2 } = await openWork(page, today, '작업완료');
    const after = await v(d2, 'remark');
    note(`작업완료 상세: 버튼 [${btns.join(', ') || '없음'}], 비고 칸 ${editable ? '수정 가능' : '읽기전용'}${msg ? `, 저장 "${msg}"` : ''} → 비고 "${before}" → "${after}"`);
    expect(after, '바뀌지 않음').toBe(before);
  });
});

export { pmiDetailFrame };
