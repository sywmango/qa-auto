import { test } from '@playwright/test';
import fs from 'fs';
import { settle, clickButton, waitFrame } from '../support/dream';
import { listFields } from '../support/form';
import { openMenuByPath, listFrame } from '../support/approval';

const OUT = 'playwright/.data/az303-explore';

test('탐색2: 일일업무일지 생성 폼', async ({ page }) => {
  test.setTimeout(120_000);
  page.on('dialog', (d) => { fs.appendFileSync(`${OUT}/dialogs.txt`, 'create: ' + d.message() + '\n'); d.dismiss(); });
  await openMenuByPath(page, ['일일업무', '일일업무일지']);
  const list = await listFrame(page);
  await clickButton(list, '생성');
  await settle(page, 3000);
  const det = await waitFrame(page, /maWoDayRptDetail/);
  fs.writeFileSync(`${OUT}/12-dayrpt-create.json`, JSON.stringify({ url: det.url(), fields: await listFields(det),
    buttons: await det.evaluate(() => [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.offsetWidth > 0 && a.innerText.trim()).map((a) => `${a.innerText.trim()} .${a.className}`)) }, null, 1));
  await page.screenshot({ path: `${OUT}/12-dayrpt-create.png` });
});

test('탐색2: 일지 생성→저장→승인요청 팝업→결재자 입력 칸', async ({ page }) => {
  test.setTimeout(180_000);
  const { put, saveForm } = await import('../support/form');
  page.on('dialog', (d) => { fs.appendFileSync(`${OUT}/dialogs.txt`, 'flow: ' + d.message() + '\n'); d.accept(); });
  await openMenuByPath(page, ['일일업무', '일일업무일지']);
  const list = await listFrame(page);
  await clickButton(list, '생성');
  await settle(page, 3000);
  const det = await waitFrame(page, /maWoDayRptDetail/);
  await put(det.locator('[id="maWoDayRptDetailDTO.workDate"]'), '2026-10-01');
  await put(det.locator('[id="maWoDayRptDetailDTO.workTime"]'), '480');
  await put(det.locator('[id="maWoDayRptDetailDTO.title"]'), '[sychoi] 10월 1일 업무일지');
  await put(det.locator('[id="maWoDayRptDetailDTO.contents"]'), '설비 점검 결과 정리, 결재요청 테스트');
  const msg = await saveForm(page, det);
  fs.appendFileSync(`${OUT}/dialogs.txt`, 'save msg: ' + msg + '\n');
  await page.screenshot({ path: `${OUT}/13-after-save.png` });
  const det2 = await waitFrame(page, /maWoDayRptDetail/);
  const btns = await det2.evaluate(() => [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.offsetWidth > 0 && a.innerText.trim()).map((a) => `${a.innerText.trim()} .${a.className}`));
  fs.appendFileSync(`${OUT}/dialogs.txt`, 'btns: ' + btns.join(', ') + '\n');
  await det2.locator('a.b_approval:visible').click();
  await settle(page, 4000);
  const g = page.frames().find((f) => f.url().includes('appPrcList.do') && f.name().includes('appReqDetail'))!;
  const idx = await g.evaluate(() => {
    const hd = [...document.querySelectorAll<HTMLElement>('.xhdr table.hdr tr')].find((tr) => tr.querySelector('.hdrcell'))!;
    return [...hd.querySelectorAll('td')].findIndex((td) => (td as HTMLElement).innerText.trim() === '결재자1');
  });
  const cell = g.locator('.objbox table.obj tr:visible').filter({ hasText: '파트장 결재' }).locator('td').nth(idx);
  await cell.dblclick(); await settle(page, 1500);
  // 편집 칸 구조 저장
  fs.writeFileSync(`${OUT}/14-editor.html`, await g.evaluate(() => {
    const a = document.activeElement as HTMLElement;
    const ed = document.querySelector('.dhxcombo_material, .dhx_combo_box, .dhxcombo_dhx_skyblue, .dhxcombo_dhx_web, .dhxcombo_dhx_terrace') as HTMLElement;
    const lists = [...document.querySelectorAll<HTMLElement>('.dhxcombolist_material, .dhx_combo_list, [class*=combolist]')].filter((x) => x.offsetWidth > 0);
    return `ACTIVE: ${a?.outerHTML?.slice(0, 600)}\n\nEDITOR: ${ed?.outerHTML?.slice(0, 2000)}\n\nLISTS: ${lists.map((l) => l.className + ' :: ' + l.outerHTML.slice(0, 1500)).join('\n')}\n\nCELL: ${document.querySelector('.objbox table.obj tr td.cellselected, .objbox td[class*=editable]')?.outerHTML?.slice(0, 1500)}`;
  }));
  await page.keyboard.type('최신영', { delay: 100 });
  await settle(page, 1500);
  await page.screenshot({ path: `${OUT}/15-typed.png` });
});

async function openMyLog(page: any) {
  const { Grid } = await import('../support/dream');
  await openMenuByPath(page, ['일일업무', '일일업무일지']);
  const list = await listFrame(page);
  // 기간 시작을 넉넉히
  const { put } = await import('../support/form');
  await put(list.locator('[id="maWoDayRptCommonDTO.filterStartDate"]'), '2026-09-01');
  await clickButton(list, '검색'); await settle(page, 2000);
  await new Grid(list, '제목').clickCell('제목', '[sychoi] 10월 1일 업무일지', { dbl: true });
  await settle(page, 3000);
  return waitFrame(page, /maWoDayRptDetail/);
}

test('탐색2: 결재자 목록에서 고르기', async ({ page }) => {
  test.setTimeout(180_000);
  page.on('dialog', (d) => { fs.appendFileSync(`${OUT}/dialogs.txt`, 'pick: ' + d.message() + '\n'); d.accept(); });
  const det = await openMyLog(page);
  await det.locator('a.b_approval:visible').click();
  await settle(page, 4000);
  const g = page.frames().find((f) => f.url().includes('appPrcList.do') && f.name().includes('appReqDetail'))!;
  const rowsBefore = await g.evaluate(() => [...document.querySelectorAll('.objbox table.obj tr')].map((tr) => (tr as HTMLElement).innerText.replace(/\s+/g, ' | ')));
  fs.appendFileSync(`${OUT}/dialogs.txt`, 'rows before: ' + JSON.stringify(rowsBefore) + '\n');
  const idx = await g.evaluate(() => {
    const hd = [...document.querySelectorAll<HTMLElement>('.xhdr table.hdr tr')].find((tr) => tr.querySelector('.hdrcell'))!;
    return [...hd.querySelectorAll('td')].findIndex((td) => (td as HTMLElement).innerText.trim() === '결재자1');
  });
  const cell = g.locator('.objbox table.obj tr:visible').filter({ hasText: '파트장 결재' }).locator('td').nth(idx);
  await cell.dblclick(); await settle(page, 1500);
  for (const f of page.frames()) {
    const hit = await f.evaluate(() => { const els = [...document.querySelectorAll<HTMLElement>('div,li,span,td')].filter((e) => e.offsetWidth > 0 && /\[D221005\]/.test(e.innerText) && e.children.length < 3); return els.slice(0, 3).map((e) => e.outerHTML.slice(0, 300)); }).catch(() => []);
    if (hit.length) fs.appendFileSync(`${OUT}/dialogs.txt`, `frame ${f.name()} ${f.url().slice(0, 80)}: ${hit.join(' || ')}
`);
  }
  let opt = g.locator('none');
  for (const f of page.frames()) { const l = f.locator('.dhx_popup_dhx_skyblue .objbox td', { hasText: 'D221005' }); if (await l.first().isVisible().catch(() => false)) { opt = l.first(); break; } }
  fs.appendFileSync(`${OUT}/dialogs.txt`, 'opt html: ' + (await opt.evaluate((e) => e.outerHTML.slice(0, 400)).catch((e) => 'ERR ' + e)) + '\n');
  await opt.click().catch((e) => fs.appendFileSync(`${OUT}/dialogs.txt`, 'click err ' + e + '\n'));
  await settle(page, 1000);
  await g.locator('.hdrcell', { hasText: '결재순서' }).click().catch(() => {});
  await settle(page, 1000);
  const rowsAfter = await g.evaluate(() => [...document.querySelectorAll('.objbox table.obj tr')].map((tr) => (tr as HTMLElement).innerText.replace(/\s+/g, ' | ')));
  fs.appendFileSync(`${OUT}/dialogs.txt`, 'rows after: ' + JSON.stringify(rowsAfter) + '\n');
  await page.screenshot({ path: `${OUT}/16-picked.png` });
});

test('탐색2: 결재자 돋보기 Lov', async ({ page }) => {
  test.setTimeout(180_000);
  const { lovContentFrame, pickInLov } = await import('../support/dream');
  page.on('dialog', (d) => { fs.appendFileSync(`${OUT}/dialogs.txt`, 'lov: ' + d.message() + '\n'); d.accept(); });
  const det = await openMyLog(page);
  await det.locator('a.b_approval:visible').click();
  await settle(page, 4000);
  const g = page.frames().find((f) => f.url().includes('appPrcList.do') && f.name().includes('appReqDetail'))!;
  const idx = await g.evaluate(() => {
    const hd = [...document.querySelectorAll<HTMLElement>('.xhdr table.hdr tr')].find((tr) => tr.querySelector('.hdrcell'))!;
    return [...hd.querySelectorAll('td')].findIndex((td) => (td as HTMLElement).innerText.trim() === '결재자1');
  });
  const cell = g.locator('.objbox table.obj tr:visible').filter({ hasText: '파트장 결재' }).locator('td').nth(idx);
  await cell.dblclick(); await settle(page, 1000);
  await cell.locator('p.open_spop').click();
  await settle(page, 2500);
  await page.screenshot({ path: `${OUT}/17-lov.png` });
  const lov = await lovContentFrame(page);
  fs.appendFileSync(`${OUT}/dialogs.txt`, `lov frame ${lov.name()} ${lov.url().slice(0, 120)}\n` + (await lov.evaluate(() => document.body.innerText.slice(0, 800))) + '\n');
  await pickInLov(page, lov, '최신영', '사원명');
  await settle(page, 1500);
  const rowsAfter = await g.evaluate(() => [...document.querySelectorAll('.objbox table.obj tr')].map((tr) => (tr as HTMLElement).innerText.replace(/\s+/g, ' | ')));
  fs.appendFileSync(`${OUT}/dialogs.txt`, 'lov rows after: ' + JSON.stringify(rowsAfter) + '\n');
  await page.screenshot({ path: `${OUT}/18-lov-picked.png` });
});

test('탐색2: 저장·다시열기·승인요청·결재대기', async ({ page }) => {
  test.setTimeout(300_000);
  const { Grid } = await import('../support/dream');
  const { popupMessage } = await import('../support/form');
  const { openApproval, setApprover } = await import('../support/approval');
  const log = (s: string) => fs.appendFileSync(`${OUT}/dialogs.txt`, 'full: ' + s + '\n');
  page.on('dialog', (d) => { log('DIALOG ' + d.type() + ' ' + d.message()); d.accept(); });
  let det = await openMyLog(page);
  let { det: pop, grid } = await openApproval(page, det);
  log('rows0 ' + JSON.stringify(await new Grid(grid, '결재순서').rows()));
  await setApprover(page, grid, '1', 1, '최신영');
  await setApprover(page, grid, '2', 1, '최신영');
  await clickButton(grid, '저장'); await settle(page, 1500);
  const ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
  if (await ok.isVisible().catch(() => false)) { log('OK confirm'); await ok.click(); await settle(page, 1500); }
  log('grid save msg ' + (await popupMessage(page)));
  await page.screenshot({ path: `${OUT}/19-saved.png` });
  // 팝업 닫고 다시 열기
  await page.frames().find((f) => f.name() === 'popupIframe1')?.locator('div.b_pwin_close:visible').first().click().catch(() => {});
  for (const f of page.frames()) await f.locator('.b_pwin_close:visible').first().click({ timeout: 1000 }).catch(() => {});
  await settle(page, 1500);
  det = await waitFrame(page, /maWoDayRptDetail/);
  ({ det: pop, grid } = await openApproval(page, det));
  log('rows reopen ' + JSON.stringify(await new Grid(grid, '결재순서').rows()));
  await clickButton(pop, '승인요청'); await settle(page, 1500);
  if (await ok.isVisible().catch(() => false)) { log('OK confirm2 ' + (await page.locator('body').innerText()).slice(0, 0)); await ok.click(); await settle(page, 2500); }
  log('req msg ' + (await popupMessage(page)));
  await settle(page, 2000);
  await page.screenshot({ path: `${OUT}/20-requested.png` });
  log('popup still? ' + !!page.frames().find((f) => f.url().includes('appReqDetail.do')));
  det = await waitFrame(page, /maWoDayRptDetail/);
  log('detail btns ' + (await det.evaluate(() => [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.offsetWidth > 0 && a.innerText.trim()).map((a) => a.innerText.trim()).join(','))));
  const apl = page.frames().find((f) => f.name().includes('maAppPrcList_maWoDayRptDetail'));
  if (apl) log('결재자목록 ' + JSON.stringify(await new Grid(apl, '결재순서').rows().catch((e) => String(e))));
  // 목록 상태
  await openMenuByPath(page, ['일일업무', '일일업무일지']);
  const list = await listFrame(page);
  const { put } = await import('../support/form');
  await put(list.locator('[id="maWoDayRptCommonDTO.filterStartDate"]'), '2026-09-01');
  await clickButton(list, '검색'); await settle(page, 2000);
  log('list ' + JSON.stringify((await new Grid(list, '제목').rows()).filter((r) => /sychoi/.test(r['제목']))));
  // 결재요청내역 / 결재대기
  for (const [p, h] of [[['개인설정', '결재요청내역'], '제목'], [['개인설정', '결재대기'], '요청일자']] as const) {
    await openMenuByPath(page, [...p]);
    const l = await listFrame(page);
    const rows = await new Grid(l, h).rows();
    log(p[1] + ' ' + JSON.stringify(rows.slice(0, 5)));
    await page.screenshot({ path: `${OUT}/21-${p[1]}.png` });
  }
});

test('탐색2: 결재대기 상세', async ({ page }) => {
  test.setTimeout(200_000);
  const { Grid } = await import('../support/dream');
  const log = (s: string) => fs.appendFileSync(`${OUT}/dialogs.txt`, 'inbox: ' + s + '\n');
  page.on('dialog', (d) => { log('DIALOG ' + d.message()); d.dismiss(); });
  await openMenuByPath(page, ['개인설정', '결재대기']);
  const l = await listFrame(page);
  log('search inputs ' + (await l.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('input')].filter((i) => i.offsetWidth > 0).map((i) => `${i.id}=${i.value}`).join(', '))));
  const rows = await new Grid(l, '요청일자').rows();
  log('mine ' + JSON.stringify(rows.filter((r) => /sychoi/.test(r['제목']))));
  await new Grid(l, '요청일자').clickCell('제목', '[sychoi] 10월 1일 업무일지', { dbl: true });
  await settle(page, 4000);
  for (const f of page.frames()) {
    if (!/detail/i.test(f.url())) continue;
    log(`frame ${f.name()} ${f.url().split('?')[0]} :: ` + (await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.offsetWidth > 0 && a.innerText.trim()).map((a) => `${a.innerText.trim()} .${a.className.split(' ')[0]}`).join(', ') + ' || ' + [...document.querySelectorAll<HTMLInputElement>('input,textarea')].filter((i) => i.offsetWidth > 0).map((i) => `${i.id}=${i.value}${i.readOnly ? '(ro)' : ''}`).join(', '))));
  }
  await page.screenshot({ path: `${OUT}/22-inbox-detail.png` });
});

test('탐색2: 결재대기 목록 버튼', async ({ page }) => {
  test.setTimeout(200_000);
  const { Grid } = await import('../support/dream');
  const log = (s: string) => fs.appendFileSync(`${OUT}/dialogs.txt`, 'inbox2: ' + s + '\n');
  await openMenuByPath(page, ['개인설정', '결재대기']);
  const l = await listFrame(page);
  log('list btns(all) ' + (await l.evaluate(() => [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.innerText.trim()).map((a) => `${a.innerText.trim()} .${a.className}${a.offsetWidth > 0 ? '' : ' (hidden)'}`).join(', '))));
  await new Grid(l, '요청일자').clickCell('제목', '[sychoi] 10월 1일 업무일지');
  await settle(page, 1500);
  for (const f of page.frames()) {
    const b = await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.offsetWidth > 0 && /승인|반려|결재|처리/.test(a.innerText)).map((a) => `${a.innerText.trim()} .${a.className}`).join(', ')).catch(() => '');
    if (b) log(`frame ${f.name()} ${f.url().split('?')[0]} :: ${b}`);
  }
  await page.screenshot({ path: `${OUT}/23-inbox-list.png` });
});

test('탐색2: 결재처리 팝업', async ({ page }) => {
  test.setTimeout(200_000);
  const { Grid } = await import('../support/dream');
  const log = (s: string) => fs.appendFileSync(`${OUT}/dialogs.txt`, 'act: ' + s + '\n');
  page.on('dialog', (d) => { log('DIALOG ' + d.message()); d.dismiss(); });
  await openMenuByPath(page, ['개인설정', '결재대기']);
  const l = await listFrame(page);
  await new Grid(l, '요청일자').clickCell('제목', '[sychoi] 10월 1일 업무일지');
  await settle(page, 1500);
  await clickButton(l, '결재처리');
  await settle(page, 3000);
  for (const f of page.frames()) {
    if (!/popupIframe/.test(f.name())) continue;
    log(`frame ${f.name()} ${f.url().split('?')[0]} :: ` + (await f.evaluate(() => document.body.innerText.slice(0, 600) + ' || ' + [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.offsetWidth > 0 && a.innerText.trim()).map((a) => `${a.innerText.trim()} .${a.className.split(' ')[0]}`).join(', ') + ' || ' + [...document.querySelectorAll<HTMLInputElement>('input,textarea,select')].filter((i) => i.offsetWidth > 0).map((i) => `${i.id}=${i.value}${i.readOnly ? '(ro)' : ''}`).join(', '))));
  }
  await page.screenshot({ path: `${OUT}/24-act.png` });
});

test('탐색2: 결재대기 승인 처리', async ({ page }) => {
  test.setTimeout(300_000);
  const { Grid } = await import('../support/dream');
  const { approveInInbox } = await import('../support/approval');
  const log = (s: string) => fs.appendFileSync(`${OUT}/dialogs.txt`, 'appr: ' + s + '\n');
  page.on('dialog', (d) => { log('DIALOG ' + d.message()); d.accept(); });
  log('approved ' + (await approveInInbox(page, '[sychoi] 10월 1일 업무일지')));
  for (const [p, h] of [[['개인설정', '결재요청내역'], '제목'], [['개인설정', '결재이력'], '요청일자']] as const) {
    await openMenuByPath(page, [...p]);
    const l = await listFrame(page);
    log(p[1] + ' ' + JSON.stringify((await new Grid(l, h).rows()).filter((r) => /sychoi/.test(r['제목'] || ''))));
  }
  const det = await openMyLog(page);
  log('detail btns ' + (await det.evaluate(() => [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.offsetWidth > 0 && a.innerText.trim()).map((a) => a.innerText.trim()).join(','))));
  const apl = page.frames().find((f) => f.name().includes('maAppPrcList_maWoDayRptDetail'))!;
  await det.getByText(/결재자목록/).first().click().catch(() => {}); await settle(page, 1500);
  log('결재자목록 ' + JSON.stringify(await new Grid(apl, '결재순서').rows().catch((e) => String(e).slice(0, 100))));
});

test('탐색2: 승인 한 번 자세히', async ({ page }) => {
  test.setTimeout(200_000);
  const { Grid } = await import('../support/dream');
  const log = (s: string) => fs.appendFileSync(`${OUT}/dialogs.txt`, 'one: ' + s + '\n');
  page.on('dialog', (d) => { log('DIALOG ' + d.message()); d.accept(); });
  await openMenuByPath(page, ['개인설정', '결재대기']);
  const l = await listFrame(page);
  await new Grid(l, '요청일자').clickCell('제목', '[sychoi] 10월 1일 업무일지');
  await settle(page, 1500);
  await clickButton(l, '결재처리');
  await settle(page, 2500);
  const pop = page.frames().find((f) => f.url().includes('appReadyPopup.do'))!;
  for (const f of pop.childFrames()) log('child ' + f.name() + ' ' + f.url().split('?')[0]);
  const target = [pop, ...pop.childFrames()].find(async (f) => true)!;
  for (const f of [pop, ...pop.childFrames()]) {
    const n = await f.locator('a:visible', { hasText: /^\s*승인\s*$/ }).count();
    log(`frame ${f.name()} 승인 count ${n}`);
    if (n) {
      await f.locator('a:visible', { hasText: /^\s*승인\s*$/ }).first().click();
      await settle(page, 1500);
      await page.screenshot({ path: `${OUT}/25-after-approve-click.png` });
      log('body text: ' + (await page.locator('body').innerText()).slice(0, 200));
      for (const ff of page.frames()) {
        const t = await ff.evaluate(() => [...document.querySelectorAll<HTMLElement>('.dhtmlx_popup_text, .dhtmlx-confirm, .dhx_modal_cover ~ div, .messagebox, .msg_box')].filter((e) => e.offsetWidth > 0).map((e) => e.innerText).join(' / ')).catch(() => '');
        if (t) log(`msg in ${ff.name()}: ${t}`);
      }
      break;
    }
  }
});

test('탐색2: 기본결재자설정 상세', async ({ page }) => {
  test.setTimeout(200_000);
  const { Grid } = await import('../support/dream');
  const log = (s: string) => fs.appendFileSync(`${OUT}/dialogs.txt`, 'an210: ' + s + '\n');
  await openMenuByPath(page, ['개인설정', '기본결재자설정']);
  const l = await listFrame(page);
  await new Grid(l, '업무구분').clickCell('업무구분', '일일업무일지', { dbl: true });
  await settle(page, 3000);
  for (const f of page.frames()) {
    if (!/persAppr/i.test(f.url()) || /persApprWorkflowList\.do/.test(f.url())) continue;
    log(`frame ${f.name()} ${f.url().split('?')[0]} :: ` + (await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.offsetWidth > 0 && a.innerText.trim()).map((a) => `${a.innerText.trim()} .${a.className.split(' ')[0]}`).join(', ') + ' || ' + [...document.querySelectorAll<HTMLElement>('.hdrcell')].filter((h) => h.offsetWidth > 0).map((h) => h.innerText.trim()).join(',') + ' || ' + document.body.innerText.slice(-500).replace(/\s+/g, ' '))));
  }
  await page.screenshot({ path: `${OUT}/26-an210.png` });
});
