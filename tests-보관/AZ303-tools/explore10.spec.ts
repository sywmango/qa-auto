import { test } from '@playwright/test';
import fs from 'fs';
import { settle, clickButton } from '../support/dream';
import { closePopups } from '../support/setting';
import { openMenuByPath, listFrame } from '../support/approval';

// Revision 제정 팝업의 확인 버튼 위치 (메인 화면 쪽 버튼까지 봄, 저장하지 않음)
const OUT = 'playwright/.data/az303-explore/survey10';
for (const path of [['설비자산', '계측기'], ['설비자산', '설비'], ['작업관리', '정기점검작업', '정기점검주기']]) {
  test(`탐색10 ${path.at(-1)}`, async ({ page }) => {
    test.setTimeout(120_000);
    await openMenuByPath(page, path);
    const list = await listFrame(page);
    const out: any = { list: list.url().split('?')[0] };
    await clickButton(list, '생성');
    await settle(page, 3000);
    out.frames = [];
    for (const f of page.frames()) {
      const b = await f.evaluate(() => [...document.querySelectorAll<HTMLElement>('a, button, input[type=button], input[type=submit], div[onclick], span[onclick]')]
        .filter((a) => a.offsetWidth > 0 && ((a as HTMLElement).innerText?.trim() || (a as HTMLInputElement).value) && !/ui-state|ui-datepicker/.test(a.className))
        .map((a) => `${((a as HTMLElement).innerText?.trim() || (a as HTMLInputElement).value).slice(0, 20)} <${a.tagName}.${a.className.split(' ')[0]}#${a.id}>`)).catch(() => []);
      if (b.length) out.frames.push({ name: f.name(), url: f.url().split('?')[0], b: b.slice(0, 40) });
    }
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/${path.at(-1)}.png` });
    fs.writeFileSync(`${OUT}/${path.at(-1)}.json`, JSON.stringify(out, null, 1));
    await closePopups(page);
  });
}
