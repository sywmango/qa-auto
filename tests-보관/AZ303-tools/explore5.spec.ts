import { test } from '@playwright/test';
import fs from 'fs';
import { settle, clickButton, lovContentFrame } from '../support/dream';
import { approvalMenus } from '../support/approval-menus';
import { openMenuByPath, listFrame } from '../support/approval';

// 데이터 준비 방법을 모르는 메뉴 탐색 (읽기만, 생성 팝업은 닫음)
const OUT = 'playwright/.data/az303-explore/survey5';
const CODES = ['LOGSHEET', 'WOPLAN', 'PMIGRPRSLT', 'PTRLRESULT', 'PMINSRSLT', 'MOCCMTEE', 'MOCWORK', 'MOCREC'];

const dump = (f: any) => f.evaluate(() => ({
  url: location.pathname,
  tabs: [...document.querySelectorAll<HTMLElement>('a, li, span')].filter((e) => e.offsetWidth > 0 && /^(목록|카렌다|연카렌다|월카렌다|주간|일간)/.test(e.innerText.trim()) && e.innerText.trim().length < 20).map((e) => e.innerText.trim()),
  buttons: [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.offsetWidth > 0 && a.innerText.trim()).map((a) => `${a.innerText.trim()} .${a.className.split(' ')[0]}`).slice(0, 40),
  inputs: [...document.querySelectorAll<HTMLInputElement>('input')].filter((i) => i.offsetWidth > 0 && i.id).map((i) => `${i.id}=${i.value}`).slice(0, 30),
  text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 1500),
})).catch((e: any) => String(e));

for (const m of approvalMenus.filter((x) => CODES.includes(x.code))) {
  test(`탐색5 ${m.code}`, async ({ page }) => {
    test.setTimeout(180_000);
    fs.mkdirSync(OUT, { recursive: true });
    const out: any = {};
    page.on('dialog', (d) => { (out.dialogs ||= []).push(d.message()); d.dismiss(); });
    await openMenuByPath(page, m.path);
    out.frames = [];
    for (const f of page.frames()) if (/\.do/.test(f.url())) out.frames.push({ name: f.name(), ...(await dump(f)) });
    await page.screenshot({ path: `${OUT}/${m.code}-1.png` });
    // 목록(조건) 탭이 있으면 눌러 봄
    const tab = page.frames().map((f) => f.getByText('목록(조건)', { exact: true }));
    for (const t of tab) if (await t.first().isVisible().catch(() => false)) { await t.first().click(); await settle(page, 2500); break; }
    out.after = [];
    for (const f of page.frames()) if (/List\.do/i.test(f.url())) out.after.push({ name: f.name(), ...(await dump(f)) });
    await page.screenshot({ path: `${OUT}/${m.code}-2.png` });
    if (m.code === 'LOGSHEET') {
      const list = await listFrame(page);
      await clickButton(list, '생성');
      await settle(page, 2500);
      for (const f of page.frames()) if (/popupIframe/.test(f.name())) out.popup = await dump(f);
      await page.screenshot({ path: `${OUT}/${m.code}-3.png` });
    }
    fs.writeFileSync(`${OUT}/${m.code}.json`, JSON.stringify(out, null, 1));
  });
}

test('탐색5 PMINSRSLT 점검작업 상세', async ({ page }) => {
  test.setTimeout(180_000);
  const { openWork } = await import('../support/pmexec-data');
  const out: any = {};
  for (const [day, st] of [['2026-12-18', '작업발행'], ['2026-10-21', '작업완료']]) {
    const r = await openWork(page, day, st).catch((e: any) => ({ err: String(e).slice(0, 200) }));
    if ('err' in r) { out[day] = r; continue; }
    out[day] = { row: r.row, ...(await dump(r.d)) };
    await page.screenshot({ path: `${OUT}/PMINSRSLT-${day}.png` });
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/PMINSRSLT-detail.json`, JSON.stringify(out, null, 1));
});
