import { test } from '@playwright/test';
import fs from 'fs';
import { settle, clickButton } from '../support/dream';
import { listFields } from '../support/form';
import { closePopups } from '../support/setting';
import { openMenuByPath, listFrame } from '../support/approval';

// 점검Group·순회점검 데이터 만들기 화면 (생성 폼 칸, 일정추가 팝업). 저장하지 않음
const OUT = 'playwright/.data/az303-explore/survey12';
const CASES: [string, string[], string][] = [
  ['grp-cycle', ['작업관리', '점검Group', '점검Group주기'], '생성'],
  ['grp-plan', ['작업관리', '점검Group', '점검Group계획'], '일정추가'],
  ['ptl-route', ['작업관리', '순회점검작업', '순회점검Route설정'], '생성'],
  ['ptl-plan', ['작업관리', '순회점검작업', '순회점검계획'], '일정추가'],
];
for (const [name, path, btn] of CASES) {
  test(`탐색12 ${name}`, async ({ page }) => {
    test.setTimeout(150_000);
    const out: any = {};
    page.on('dialog', (d) => { (out.dialogs ||= []).push(d.message()); d.dismiss(); });
    await openMenuByPath(page, path);
    const list = await listFrame(page);
    const before = new Set(page.frames());
    await clickButton(list, btn);
    await settle(page, 3000);
    out.frames = [];
    for (const f of page.frames()) {
      if (before.has(f) && !/popupIframe/.test(f.name())) continue;
      if (!/\.do/.test(f.url())) continue;
      out.frames.push({
        name: f.name(), url: f.url().split('?')[0],
        fields: await listFields(f).catch(() => []),
        buttons: await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.offsetWidth > 0 && /b_|ac_menu/.test(a.className)).map((a) => `${a.innerText.trim()} .${a.className.split(' ')[0]}`)).catch(() => []),
        heads: await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('.hdrcell')].filter((h) => h.offsetWidth > 0).map((h) => h.innerText.trim())).catch(() => []),
      });
    }
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/${name}.png` });
    fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(out, null, 1));
    await closePopups(page);
  });
}
