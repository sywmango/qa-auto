import { test, expect, Page, Frame } from '@playwright/test';
import fs from 'fs';
import { clickButton, settle, waitFrame, Grid } from '../support/dream';
import { put, dateAfter, saveForm, fillAllFields, listFields, TAG } from '../support/form';
import { P, PV, F_POINT, F_POINT_VALUE, F_DOC, frameReady, val, note } from '../support/pmexec';
import { PM, EQ, state, keep, okAndMessage, myWorks, openWork, futureDate, ensureWork, fillPoints, firstPoint } from '../support/pmexec-data';

// 정기점검실행 (AP591) — 점검작업 수정, 점검값 입력, Edit, 첨부문서, Linked, 확정
// 데이터: [sychoi] 주기 8007 / 설비 100302AG13 의 점검작업 (앞날짜 작업발행 건, 오늘·어제 건은 없으면 만듦)
// 한 파일 안에서는 위에서 아래 순서로 실행 (workers 1). 앞 케이스가 실패해도 뒤 케이스는 계속 실행

test.setTimeout(300_000);

const statusOf = async (page: Page, date: string) => (await myWorks(page)).mine.filter((r) => r['점검일자'] === date).map((r) => r['점검작업상태']);

test.describe('AP591 정기점검실행 (점검작업)', () => {
  test('AP591_EC_001 앞날짜 점검작업을 확정한다.', async ({ page }) => {
    const day = await futureDate(page);
    // 점검시작·종료를 채워 두고 (EC_004 에서 종료가 지워졌을 수 있음) 날짜 규칙만 보이게
    let { d } = await openWork(page, day);
    if (!(await val(d, 'endDate'))) {
      await put(d.locator(`[id="${P}.startDate"]`), day);
      await put(d.locator(`[id="${P}.startTime"]`), '13:00');
      await put(d.locator(`[id="${P}.endDate"]`), day);
      await put(d.locator(`[id="${P}.endTime"]`), '13:50');
      await saveForm(page, d);
      ({ d } = await openWork(page, day));
    }
    await clickButton(d, '확정');
    const msg = await okAndMessage(page);
    const st = await statusOf(page, day);
    note(`점검일자 ${day} (오늘 ${dateAfter(0)}) 작업발행 건 확정: ${msg}, 상태 ${st.join(',')}`);
    expect.soft(msg).toMatch(/미리|완료처리할 수 없/);
    expect(st).toEqual(['작업발행']);
  });

  test('AP591_TC_021 점검작업의 필수값과 그 외 값을 수정한다.', async ({ page }) => {
    const day = await futureDate(page);
    const { d } = await openWork(page, day);
    const name0 = await val(d, 'pmiDesc');
    const name = name0.replace(/\s*\(실행 수정\)$/, '') + ' (실행 수정)';
    const remark = `${TAG} 블레이드 체결 상태 확인, 진동 2.1mm/s 정상`;
    await put(d.locator(`[id="${P}.pmiDesc"]`), name);
    await put(d.locator(`[id="${P}.startTime"]`), '13:00');
    await put(d.locator(`[id="${P}.endTime"]`), '13:50');
    await put(d.locator(`[id="${P}.remark"]`), remark);
    const msg = await saveForm(page, d);
    const { d: d2, row } = await openWork(page, day);
    const now = { name: await val(d2, 'pmiDesc'), start: await val(d2, 'startTime'), end: await val(d2, 'endTime'), remark: await val(d2, 'remark'), time: await val(d2, 'workTime') };
    note(`점검명·시작 13:00·종료 13:50·비고 변경 저장 "${msg || '안내 없음'}"\n다시 열기: ${JSON.stringify(now)}\n목록: 점검명 "${row['점검명']}", 시작 ${row['점검시작시간']}, 종료 ${row['점검종료시간']}, 점검시간 ${row['점검시간[분]']}, 비고 "${row['비고']}"`);
    expect.soft(now.name).toBe(name);
    expect.soft(now.start).toBe('13:00');
    expect.soft(now.end).toBe('13:50');
    expect.soft(now.remark).toBe(remark);
    expect.soft(now.time, '점검시간 50분').toBe('50');
    expect.soft(row['점검명'], '목록 반영').toBe(name);
  });

  test('AP591_TC_022 필수값을 지우고 저장한다.', async ({ page }) => {
    const day = await futureDate(page);
    const log: string[] = [];
    for (const [id, label] of [['pmiDesc', '점검명'], ['wkorDate', '점검일자'], ['deptDesc', '담당부서']]) {
      const { d } = await openWork(page, day);
      const before = await val(d, id);
      await put(d.locator(`[id="${P}.${id}"]`), '');
      const msg = await saveForm(page, d);
      const { d: d2 } = await openWork(page, day);
      const after = await val(d2, id);
      log.push(`${label} 지우고 저장: "${msg || '안내 없음'}", 다시 열면 "${after}"`);
      expect.soft(msg, `${label} 필수 안내`).toMatch(/필수|입력/);
      expect.soft(after, `${label} 저장 안 됨`).toBe(before);
    }
    note(log.join('\n'));
  });

  test('AP591_EC_004 점검종료시간을 시작시간보다 앞으로 넣는다.', async ({ page }) => {
    const day = await futureDate(page);
    const { d } = await openWork(page, day);
    await put(d.locator(`[id="${P}.startTime"]`), '10:00');
    await put(d.locator(`[id="${P}.endTime"]`), '09:00');
    const msg = await saveForm(page, d);
    const { d: d2 } = await openWork(page, day);
    const now = `${await val(d2, 'startDate')} ${await val(d2, 'startTime')} ~ ${await val(d2, 'endDate')} ${await val(d2, 'endTime')}, 점검시간 ${await val(d2, 'workTime')}`;
    note(`시작 10:00, 종료 09:00 (같은 날) 저장: "${msg || '안내 없음'}"\n다시 열기: ${now}`);
    expect(now, '그대로 저장되지 않아야 함').not.toMatch(/10:00 ~ \d{4}-\d{2}-\d{2} 09:00/);
  });

  test('AP591_EC_005 비고·점검명에 특수문자와 긴 글자를 넣는다.', async ({ page }) => {
    const day = await futureDate(page);
    const { d } = await openWork(page, day);
    const special = `${TAG} 특수문자 ' " < > & 확인`;
    const long = `${TAG} ` + '가'.repeat(400);
    await put(d.locator(`[id="${P}.remark"]`), special);
    const m1 = await saveForm(page, d);
    let { d: d2 } = await openWork(page, day);
    const r1 = await val(d2, 'remark');
    const name0 = await val(d2, 'pmiDesc');
    await put(d2.locator(`[id="${P}.pmiDesc"]`), long);
    const m2 = await saveForm(page, d2);
    ({ d: d2 } = await openWork(page, day));
    const n2 = await val(d2, 'pmiDesc');
    note(`비고 "${special}" 저장 "${m1 || '안내 없음'}" → 다시 열면 "${r1}"\n점검명 ${long.length}자 저장 "${m2 || '안내 없음'}" → 다시 열면 ${n2.length}자${n2 === name0 ? ' (원래 이름 그대로)' : ''}`);
    expect.soft(r1, '특수문자 그대로').toBe(special);
    expect.soft(n2.length < long.length || /길이|초과|byte|바이트/.test(m2), '최대 길이 초과는 막힘').toBe(true);
    expect.soft(/길이|초과|byte|바이트/.test(m2), '길이 초과 안내').toBe(true);
    if (n2 !== name0) { await put(d2.locator(`[id="${P}.pmiDesc"]`), name0); await saveForm(page, d2); }
  });

  test('AP591_TC_036 점검항목의 점검결과·점검값을 입력한다.', async ({ page }) => {
    const day = await futureDate(page);
    await openWork(page, day);
    const { pd, p } = await firstPoint(page);
    const value = p['기준값'] || '1';
    const detail = `${TAG} 회전수 측정, 기준 범위 내`;
    await put(pd.locator(`[id="${PV}.resultValue"]`), value);
    await put(pd.locator(`[id="${PV}.resultRemark"]`), detail);
    const result = await val(pd, 'pmPointRsltStatusDesc', PV);
    const msg = await saveForm(page, pd);
    await openWork(page, day);
    const pl = await waitFrame(page, F_POINT);
    await settle(page, 1500);
    const row = (await new Grid(pl, '점검항목').rows()).find((r) => r['점검항목'] === p['점검항목'])!;
    note(`"${p['점검항목']}" 점검결과 ${result}, 점검값 ${value}, 검사세부내용 입력 → 저장 "${msg || '안내 없음'}"\n목록: 점검결과 ${row['점검결과']}, 점검값 ${row['점검값']}, 검사세부내용 "${row['검사세부내용']}"`);
    expect.soft(row['점검값'].replace(/,/g, '')).toBe(value.replace(/,/g, ''));
    expect.soft(row['점검결과']).toBe(result);
    expect.soft(row['검사세부내용']).toBe(detail);
  });

  test('AP591_TC_037 점검항목의 필수값을 지우고 저장한다.', async ({ page }) => {
    const day = await futureDate(page);
    await openWork(page, day);
    let { pd, p } = await firstPoint(page);
    const before = await val(pd, 'pmPointRsltStatusDesc', PV);
    await put(pd.locator(`[id="${PV}.pmPointRsltStatusDesc"]`), '');
    const msg = await saveForm(page, pd);
    await openWork(page, day);
    ({ pd } = await firstPoint(page));
    const after = await val(pd, 'pmPointRsltStatusDesc', PV);
    note(`"${p['점검항목']}" 점검결과 "${before}" 지우고 저장: "${msg || '안내 없음'}" → 다시 열면 "${after}"`);
    expect.soft(msg).toMatch(/필수|입력/);
    expect(after).toBe(before);
  });

  test('AP591_EC_006 수치형 점검값에 숫자가 아닌 값을 넣는다.', async ({ page }) => {
    test.setTimeout(600_000);
    const day = await futureDate(page);
    await openWork(page, day);
    let { pd, p } = await firstPoint(page);
    const original = await val(pd, 'resultValue', PV);
    const log: string[] = [];
    for (const v of ['abc', '-50', '99999999999']) {
      ({ pd } = await (async () => { await openWork(page, day); return firstPoint(page); })());
      const input = pd.locator(`[id="${PV}.resultValue"]`);
      await input.fill('');
      await input.pressSequentially(v);
      const typed = await input.inputValue();
      await input.press('End');
      await input.blur();
      const msg = await saveForm(page, pd);
      await openWork(page, day);
      ({ pd } = await firstPoint(page));
      const saved = await val(pd, 'resultValue', PV);
      log.push(`"${v}" 입력 → 칸 "${typed}", 저장 "${msg || '안내 없음'}" → 다시 열면 "${saved}"`);
      if (v === 'abc') expect.soft(saved.replace(/,/g, ''), '문자는 저장 안 됨').not.toBe('abc');
    }
    // 원래 값으로
    await put(pd.locator(`[id="${PV}.resultValue"]`), p['기준값'] || original || '1');
    await saveForm(page, pd);
    note(`"${p['점검항목']}" (수치형, 하한 ${p['하한값']} / 기준 ${p['기준값']} / 상한 ${p['상한값']})\n${log.join('\n')}`);
  });

  test('AP591_TC_039 점검항목 목록에서 점검값을 수정한다. (Edit)', async ({ page }) => {
    test.setTimeout(300_000);
    const day = await futureDate(page);
    await openWork(page, day);
    const pl = await waitFrame(page, F_POINT);
    await settle(page, 1500);
    const p = (await new Grid(pl, '점검항목').rows())[0];
    const v = String(Math.abs(Number((p['점검값'] || p['기준값'] || '42').replace(/,/g, ''))) + 1);
    await clickButton(pl, 'Edit');
    await settle(page, 1200);
    const btns = await pl.locator('a:visible').evaluateAll((as) => as.map((a) => (a as HTMLElement).innerText.trim()).filter(Boolean));
    const r = await editPointCell(page, pl, 0, '점검값', v);
    await clickButton(pl, '저장');
    const msg = await okAndMessage(page);
    await openWork(page, day);
    const pl2 = await waitFrame(page, F_POINT);
    await settle(page, 1500);
    const after = (await new Grid(pl2, '점검항목').rows())[0]['점검값'];
    if (after.replace(/,/g, '') !== v) await page.screenshot({ path: 'playwright/.data/evidence/ap591-TC_039.png' });
    note(`Edit → 버튼 [${btns.join(', ')}], 점검값 칸 ${r.editing ? '수정 가능' : '수정 안 됨'} (${r.before} → 칸 ${r.after}) → 저장: ${msg} → 다시 열면 점검값 ${after}`);
    expect.soft(btns, '저장/취소 버튼').toEqual(expect.arrayContaining(['저장', '취소']));
    expect(after.replace(/,/g, ''), '바뀐 점검값 저장').toBe(v);
  });

  test('AP591_TC_040 점검항목 목록 수정을 취소한다. (Edit)', async ({ page }) => {
    const day = await futureDate(page);
    await openWork(page, day);
    const pl = await waitFrame(page, F_POINT);
    await settle(page, 1500);
    const before = (await new Grid(pl, '점검항목').rows())[0]['점검값'];
    await clickButton(pl, 'Edit');
    await settle(page, 1200);
    const r = await editPointCell(page, pl, 0, '점검값', '1');
    await clickButton(pl, '취소');
    const msg = await okAndMessage(page);
    const btns = await pl.locator('a:visible').evaluateAll((as) => as.map((a) => (a as HTMLElement).innerText.trim()).filter(Boolean));
    const shown = (await new Grid(pl, '점검항목').rows())[0]['점검값'];
    note(`Edit → 점검값 ${r.before} → ${r.after} → 취소: ${msg} → 버튼 [${btns.join(', ')}], 목록 점검값 ${shown}`);
    expect.soft(btns, '수정 모드 끝남').toContain('Edit');
    expect(shown, '수정 전 값').toBe(before);
  });

  test('AP591_TC_043 첨부문서를 등록하고 삭제한다.', async ({ page }) => {
    const day = await futureDate(page);
    await openWork(page, day);
    const lf = await waitFrame(page, F_DOC);
    await clickButton(lf, '생성');
    await settle(page, 2000);
    const dd = await waitFrame(page, 'tabFrameTAB.maPtDocLibDetail_maPtDocLibList');
    await settle(page, 1000);
    const title = `${TAG} 정기점검실행 결과 사진`;
    const file = test.info().outputPath('점검결과.txt');
    fs.writeFileSync(file, '회전 속도 1000rpm, 진동 2.1mm/s 정상\n');
    const fi = dd.locator('input[type=file]').first();
    const hasFile = (await fi.count()) > 0;
    if (hasFile) await fi.setInputFiles(file);
    const over: Record<string, string | null> = {};
    for (const x of await listFields(dd)) if (x.label === '제목') over[x.id] = title;
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

  test('AP591_TC_044 첨부문서를 선택 없이 삭제한다. (체크X)', async ({ page }) => {
    await openWork(page, await futureDate(page));
    const lf = await waitFrame(page, F_DOC);
    await clickButton(lf, '삭제');
    const msg = await okAndMessage(page);
    note(`체크 없이 삭제: ${msg}`);
    expect(msg).toMatch(/선택.*없/);
  });

  for (const [id, label] of [['AP591_TC_028', '기준서'], ['AP591_TC_029', '정기점검결과출력']]) {
    test(`${id} ${label === '기준서' ? '기준서를 확인한다.' : '정기점검결과 출력물을 확인한다.'}`, async ({ page }) => {
      const day = await futureDate(page);
      const { d } = await openWork(page, day);
      await clickButton(d, 'Linked');
      await settle(page, 1000);
      const winP = page.context().waitForEvent('page', { timeout: 15_000 }).catch(() => null);
      const before = page.frames().length;
      await d.locator('a:visible', { hasText: new RegExp(label) }).first().click();
      const win = await winP;
      await settle(win ?? page, 3000);
      let text = '';
      for (const fr of (win ?? page).frames()) text += ' ' + (await fr.evaluate(() => document.body?.innerText || '').catch(() => ''));
      let inputs = '';
      for (const fr of (win ?? page).frames()) inputs += ' ' + (await fr.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('input')].map((e) => e.value).join(' ')).catch(() => ''));
      const all = (text + inputs).replace(/\s+/g, ' ');
      const hasPm = all.includes(PM) || (all.includes(EQ) && all.includes(day));
      if (win) await win.screenshot({ path: `playwright/.data/evidence/ap591-${id}.png` }).catch(() => {});
      note(`Linked → ${label}: ${win ? '새 창' : `같은 창(프레임 ${before}→${page.frames().length})`} 열림, 이 작업 정보(예방작업번호 ${PM} 또는 설비 ${EQ}·${day}) ${hasPm ? '보임' : '안 보임'} (앞부분 "${text.replace(/\s+/g, ' ').trim().slice(0, 80)}")`);
      expect(win || page.frames().length > before, `${label} 열림`).toBeTruthy();
      expect.soft(hasPm, `${label} 에 이 작업의 정보`).toBe(true);
      await win?.close();
    });
  }

  test('AP591_TC_027 정기점검을 확정처리한다. (필수값 입력X)', async ({ page }) => {
    const today = dateAfter(0);
    const made = await ensureWork(page, today);
    keep('today', today);
    const { d } = await openWork(page, today);
    await put(d.locator(`[id="${P}.pmiDesc"]`), '');
    await clickButton(d, '확정');
    const msg = await okAndMessage(page);
    const st = await statusOf(page, today);
    note(`오늘(${today}) 작업발행 건 (${made}) 점검명을 비우고 확정: ${msg}, 상태 ${st.join(',')}`);
    expect.soft(msg).toMatch(/필수|입력/);
    expect(st).not.toContain('작업완료');
  });

  test('AP591_EC_002 수치형 점검값을 비운 채 확정한다.', async ({ page }) => {
    const day = dateAfter(-1);
    const made = await ensureWork(page, day);
    keep('yesterday', day);
    await openWork(page, day);
    const pl = await waitFrame(page, F_POINT);
    await settle(page, 1500);
    const pts = await new Grid(pl, '점검항목').rows();
    const { d } = await openWork(page, day);
    await clickButton(d, '확정');
    const msg = await okAndMessage(page);
    const st = await statusOf(page, day);
    note(`어제(${day}) 작업발행 건 (${made}), 점검항목 ${pts.map((p) => `${p['점검항목']}: 결과 ${p['점검결과'] || '없음'}, 점검값 ${p['점검값'] || '없음'}`).join(' / ')} → 확정: ${msg}, 상태 ${st.join(',')}`);
    expect(st, '점검값 없이 확정되지 않음').not.toContain('작업완료');
  });

  test('AP591_TC_026 정기점검을 확정처리한다. (필수값 입력O)', async ({ page }) => {
    const today = dateAfter(0);
    await ensureWork(page, today);
    await openWork(page, today);
    const pts = await fillPoints(page);
    const { d } = await openWork(page, today);
    if (!(await val(d, 'pmiDesc'))) await put(d.locator(`[id="${P}.pmiDesc"]`), `${TAG} 정기점검실행 확정 테스트`);
    await put(d.locator(`[id="${P}.startTime"]`), '09:00');
    await put(d.locator(`[id="${P}.endTime"]`), '09:30');
    const saveMsg = await saveForm(page, d);
    const { d: d2 } = await openWork(page, today);
    await clickButton(d2, '확정');
    const msg = await okAndMessage(page);
    const after = (await myWorks(page)).mine.filter((x) => x['점검일자'] === today);
    const done = after.find((x) => x['점검작업상태'] === '작업완료');
    let editable: string[] = [];
    let btns: string[] = [];
    if (done) {
      const { d: d3 } = await openWork(page, today, '작업완료');
      editable = await d3.evaluate((p) => [...document.querySelectorAll<HTMLInputElement>(`input[id^="${p}."], textarea[id^="${p}."]`)].filter((e) => e.offsetWidth > 0 && !(e.readOnly || e.disabled)).map((e) => e.id.split('.')[1]), P);
      btns = await d3.locator('a:visible').evaluateAll((as) => as.map((a) => (a as HTMLElement).innerText.trim()).filter((t) => /^(확정|저장|취소|승인요청)$/.test(t)));
    }
    note(`${pts.log.join('\n')}\n시작 09:00·종료 09:30 저장 "${saveMsg || '안내 없음'}" → 확정: ${msg}\n목록: ${after.map((x) => `${x['점검일자']} ${x['점검작업상태']}`).join(', ')}\n완료 후 수정 가능한 칸: ${editable.join(', ') || '없음'}, 버튼: ${btns.join(', ') || '없음'}`);
    expect(done, '작업완료로 바뀜').toBeTruthy();
    expect.soft(editable, '완료 후 수정 불가').toEqual([]);
  });

  test('AP591_EC_003 작업완료 건을 수정한다.', async ({ page }) => {
    const today = state.today ?? dateAfter(0);
    const { d } = await openWork(page, today, '작업완료');
    const before = await val(d, 'remark');
    const btns = await d.locator('a:visible').evaluateAll((as) => as.map((a) => (a as HTMLElement).innerText.trim()).filter((t) => /^(저장|확정|취소)$/.test(t)));
    const input = d.locator(`[id="${P}.remark"]`);
    const editable = await input.evaluate((e) => !((e as HTMLInputElement).readOnly || (e as HTMLInputElement).disabled));
    let msg = '';
    if (editable && btns.includes('저장')) { await put(input, `${TAG} 완료 후 수정 시도`); msg = await saveForm(page, d); }
    // 점검값 상세, Edit
    const { pd } = await firstPoint(page);
    const pv0 = await val(pd, 'resultValue', PV);
    const pvEditable = await pd.locator(`[id="${PV}.resultValue"]`).evaluate((e) => !((e as HTMLInputElement).readOnly || (e as HTMLInputElement).disabled));
    const pdBtns = await pd.locator('a:visible').evaluateAll((as) => as.map((a) => (a as HTMLElement).innerText.trim()).filter((t) => /^(저장)$/.test(t)));
    let pvMsg = '';
    if (pvEditable && pdBtns.length) { await put(pd.locator(`[id="${PV}.resultValue"]`), '1'); pvMsg = await saveForm(page, pd); }
    const pl = await waitFrame(page, F_POINT);
    const plBtns = await pl.locator('a:visible').evaluateAll((as) => as.map((a) => (a as HTMLElement).innerText.trim()).filter(Boolean));
    const { d: d2 } = await openWork(page, today, '작업완료');
    const after = await val(d2, 'remark');
    const { pd: pd2 } = await firstPoint(page);
    const pv1 = await val(pd2, 'resultValue', PV);
    note(`작업완료 상세: 버튼 [${btns.join(', ') || '없음'}], 비고 칸 ${editable ? '수정 가능' : '읽기전용'}${msg ? `, 저장 "${msg}"` : ''} → 비고 "${before}" → "${after}"\n점검값 상세: 점검값 칸 ${pvEditable ? '수정 가능' : '읽기전용'}, 저장 버튼 ${pdBtns.length ? '있음' : '없음'}${pvMsg ? `, 저장 "${pvMsg}"` : ''} → 점검값 ${pv0} → ${pv1}\n점검항목 목록 버튼: ${plBtns.join(', ')}`);
    expect.soft(after, '비고 바뀌지 않음').toBe(before);
    expect.soft(pv1, '점검값 바뀌지 않음').toBe(pv0);
    expect.soft(plBtns, 'Edit 버튼 없음').not.toContain('Edit');
  });
});

/** 점검항목 목록 Edit 모드에서 index 행의 col 칸 수정 */
async function editPointCell(page: Page, pl: Frame, index: number, col: string, value: string) {
  const ci = await pl.evaluate((col) => {
    const box = [...document.querySelectorAll<HTMLElement>('div.gridbox')].find((b) => b.offsetWidth > 0 && [...b.querySelectorAll('.hdrcell')].some((c) => (c as HTMLElement).innerText.trim() === '점검항목'))!;
    box.setAttribute('data-qa', 'pt');
    const tr = [...box.querySelectorAll('.xhdr table.hdr tr')].find((t) => t.querySelector('.hdrcell'))!;
    return [...tr.querySelectorAll('td')].map((td) => (td as HTMLElement).innerText.trim()).indexOf(col);
  }, col);
  const cell = pl.locator('div[data-qa="pt"] .objbox table.obj tr:visible').nth(index).locator('td').nth(ci);
  const before = (await cell.innerText()).trim();
  await cell.click();
  await page.waitForTimeout(600);
  if (!(await cell.locator('input, textarea').count())) { await cell.dblclick(); await page.waitForTimeout(600); }
  const input = cell.locator('input, textarea').first();
  let editing = false;
  if (await input.count()) {
    editing = true;
    await input.fill('');
    await input.pressSequentially(value, { delay: 50 });
    // 값을 바꾼 뒤 다른 칸을 눌러 선택을 풀어야 저장됨 (사용자 확인 2026-10-21)
    await pl.locator('div[data-qa="pt"] .objbox table.obj tr:visible').nth(index).locator('td').nth(ci === 0 ? 1 : 0).click();
  }
  await page.waitForTimeout(600);
  return { before, editing, after: (await cell.innerText()).trim() };
}
