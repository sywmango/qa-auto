import { test } from '@playwright/test';
import fs from 'fs';
import { settle, clickButton } from '../support/dream';
import { closePopups } from '../support/setting';
import { openMenuByPath, listFrame } from '../support/approval';

// 제개정 설정 Y 일 때 [생성] → "Revision 제정" 팝업 구조 (저장하지 않고 닫음)
const OUT = 'playwright/.data/az303-explore/survey9';
for (const path of [['설비자산', '계측기'], ['설비자산', '설비'], ['작업관리', '정기점검작업', '정기점검주기']]) {
  test(`탐색9 ${path.at(-1)}`, async ({ page }) => {
    test.setTimeout(120_000);
    await openMenuByPath(page, path);
    const list = await listFrame(page);
    await clickButton(list, '생성');
    await settle(page, 3000);
    const out: any[] = [];
    for (const f of page.frames()) {
      if (!/popupIframe/.test(f.name()) || f.url() === 'about:blank') continue;
      out.push({
        name: f.name(), url: f.url().split('?')[0],
        ...(await f.evaluate(() => ({
          buttons: [...document.querySelectorAll<HTMLElement>('a, button, input[type=button]')].filter((a) => (a as HTMLElement).innerText?.trim() || (a as HTMLInputElement).value).map((a) => `${(a as HTMLElement).innerText?.trim() || (a as HTMLInputElement).value} .${a.className.split(' ')[0]} #${a.id}${(a as HTMLElement).offsetWidth > 0 ? '' : ' (숨김)'}`),
          inputs: [...document.querySelectorAll<HTMLInputElement>('input,textarea')].filter((i) => i.id).map((i) => `${i.id}=${i.value}${i.readOnly ? '(ro)' : ''}${i.offsetWidth > 0 ? '' : '(숨김)'}`),
        }))),
      });
    }
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/${path.at(-1)}.png` });
    fs.writeFileSync(`${OUT}/${path.at(-1)}.json`, JSON.stringify(out, null, 1));
    await closePopups(page);
  });
}
