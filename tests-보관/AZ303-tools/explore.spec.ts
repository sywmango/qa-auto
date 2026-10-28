import { test } from '@playwright/test';
import fs from 'fs';
import { openMenu, settle } from '../support/dream';

// 결재요청(AZ303) 화면 탐색용 임시 코드 (데이터 안 바꿈). 끝나면 tests-보관/AZ303-tools/ 로 옮김
const OUT = 'playwright/.data/az303-explore';

async function dumpFrames(page: any, tag: string) {
  fs.mkdirSync(OUT, { recursive: true });
  const info: any[] = [];
  for (const f of page.frames()) {
    const d = await f.evaluate(() => ({
      buttons: [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.offsetWidth > 0 && a.innerText.trim()).map((a) => `${a.innerText.trim()} .${a.className}`).slice(0, 80),
      inputs: [...document.querySelectorAll<HTMLInputElement>('input,select,textarea')].filter((i) => i.offsetWidth > 0).map((i) => `${i.id}=${i.value}${i.readOnly ? ' (ro)' : ''}`).slice(0, 80),
      headers: [...document.querySelectorAll<HTMLElement>('.hdrcell')].filter((h) => h.offsetWidth > 0).map((h) => h.innerText.trim()),
      text: document.body?.innerText?.slice(0, 1500),
    })).catch(() => null);
    info.push({ name: f.name(), url: f.url(), ...d });
  }
  fs.writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(info, null, 1));
  await page.screenshot({ path: `${OUT}/${tag}.png` });
}

test('탐색: 일일업무일지 목록', async ({ page }) => {
  test.setTimeout(180_000);
  await openMenu(page, ['294', '282']);
  await dumpFrames(page, '01-dayrpt-list');
});

test('탐색: 일일업무일지 행·상세', async ({ page }) => {
  test.setTimeout(180_000);
  await openMenu(page, ['294', '282']);
  const list = page.frames().find((f) => f.url().includes('maWoDayRptList.do'))!;
  const { Grid } = await import('../support/dream');
  const rows = await new Grid(list, '제목').rows();
  fs.writeFileSync(`${OUT}/02-rows.json`, JSON.stringify(rows.slice(0, 50), null, 1));
  const mine = rows.find((r) => r['작성자'] === '최신영' || /sychoi/.test(r['제목'] || ''));
  if (!mine) return;
  await new Grid(list, '제목').clickCell('제목', mine['제목'], { dbl: true });
  await settle(page, 3000);
  await dumpFrames(page, '03-dayrpt-detail');
});

test('탐색: 결재요청 팝업 열기 (요청 안 함)', async ({ page }) => {
  test.setTimeout(180_000);
  await openMenu(page, ['294', '282']);
  const list = page.frames().find((f) => f.url().includes('maWoDayRptList.do'))!;
  const { Grid } = await import('../support/dream');
  await new Grid(list, '제목').clickCell('제목', '10월 19일 일일업무일지 [자동테스트 D221005 110025]', { dbl: true });
  await settle(page, 3000);
  const det = page.frames().find((f) => f.url().includes('maWoDayRptDetail.do'))!;
  page.on('dialog', (d) => { fs.appendFileSync(`${OUT}/dialogs.txt`, d.message() + '\n'); d.dismiss(); });
  await det.locator('a.b_approval:visible').click();
  await settle(page, 4000);
  await dumpFrames(page, '04-appr-popup');
  // 팝업 안 HTML 저장
  for (const f of page.frames()) {
    if (/appPrc|AppPrc|appr/i.test(f.url())) fs.writeFileSync(`${OUT}/04-${f.name() || 'noname'}.html`, await f.content());
  }
});

test('탐색: 결재자 칸 클릭', async ({ page }) => {
  test.setTimeout(180_000);
  await openMenu(page, ['294', '282']);
  const list = page.frames().find((f) => f.url().includes('maWoDayRptList.do'))!;
  const { Grid } = await import('../support/dream');
  await new Grid(list, '제목').clickCell('제목', '10월 19일 일일업무일지 [자동테스트 D221005 110025]', { dbl: true });
  await settle(page, 3000);
  const det = page.frames().find((f) => f.url().includes('maWoDayRptDetail.do'))!;
  page.on('dialog', (d) => { fs.appendFileSync(`${OUT}/dialogs.txt`, 'cell: ' + d.message() + '\n'); d.dismiss(); });
  await det.locator('a.b_approval:visible').click();
  await settle(page, 4000);
  const g = page.frames().find((f) => f.url().includes('appPrcList.do') && f.name().includes('appReqDetail'))!;
  // 1행 결재자1 칸 (열 index) 클릭
  const idx = await g.evaluate(() => {
    const hd = [...document.querySelectorAll<HTMLElement>('.xhdr table.hdr tr')].find((tr) => tr.querySelector('.hdrcell'))!;
    return [...hd.querySelectorAll('td')].findIndex((td) => (td as HTMLElement).innerText.trim() === '결재자1');
  });
  const cell = g.locator('.objbox table.obj tr:visible').filter({ hasText: '파트장 결재' }).locator('td').nth(idx);
  await cell.click(); await settle(page, 1500);
  await dumpFrames(page, '05-cell-click');
  fs.writeFileSync(`${OUT}/05-cell.html`, await g.content());
  await cell.dblclick(); await settle(page, 2500);
  await dumpFrames(page, '06-cell-dbl');
});

test('탐색: 기본결재자설정·승인Flow설정 목록', async ({ page }) => {
  test.setTimeout(180_000);
  const { Grid } = await import('../support/dream');
  await openMenu(page, ['292', '3009']);
  await dumpFrames(page, '07-an210');
  await openMenu(page, ['769', '3003']);
  await dumpFrames(page, '08-ar114');
});

test('탐색: 승인Flow 상세', async ({ page }) => {
  test.setTimeout(240_000);
  const { Grid } = await import('../support/dream');
  await openMenu(page, ['769', '3003']);
  const list = page.frames().find((f) => f.url().includes('mgrWorkflowList.do'))!;
  const rows = await new Grid(list, '업무구분').rows();
  fs.writeFileSync(`${OUT}/09-ar114-rows.json`, JSON.stringify(rows, null, 1));
  const r = rows.find((x) => /일일업무일지/.test(x['업무구분']) && x['사용여부'] === 'Y') || rows.find((x) => /일일업무일지/.test(x['업무구분']));
  if (!r) return;
  await new Grid(list, '업무구분').clickCell('승인Flow 명', r['승인Flow 명'], { dbl: true });
  await settle(page, 3000);
  await dumpFrames(page, '10-ar114-detail');
  await openMenu(page, ['292', '3009']);
  const l2 = page.frames().find((f) => f.url().includes('persApprWorkflowList.do'))!;
  fs.writeFileSync(`${OUT}/11-an210-rows.json`, JSON.stringify(await new Grid(l2, '업무구분').rows(), null, 1));
});
