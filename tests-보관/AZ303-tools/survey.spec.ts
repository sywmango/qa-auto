import { test } from '@playwright/test';
import fs from 'fs';
import { settle } from '../support/dream';
import { approvalMenus } from '../support/approval-menus';
import { openMenuByPath, listFrame } from '../support/approval';

// 27개 메뉴 조사 (읽기만): 목록 버튼, 행, 내 데이터, 첫 행 상세의 버튼. 결과 playwright/.data/az303-explore/survey/
const OUT = `playwright/.data/az303-explore/survey${process.env.QA_SITE ? '-' + process.env.QA_SITE : ''}`;
const only = process.env.AZ303_ONLY?.split(',');

for (const m of approvalMenus.filter((x) => !only || only.includes(x.code))) {
  test(`조사 ${m.code} ${m.path.join('>')}`, async ({ page }) => {
    test.setTimeout(120_000);
    fs.mkdirSync(OUT, { recursive: true });
    const out: any = { code: m.code, path: m.path };
    page.on('dialog', (d) => { (out.dialogs ||= []).push(d.message()); d.dismiss(); });
    try {
      await openMenuByPath(page, m.path);
      const list = await listFrame(page);
      out.listUrl = list.url().split('?')[0];
      const info = await list.evaluate(() => {
        const vis = (e: HTMLElement) => e.offsetWidth > 0;
        const buttons = [...document.querySelectorAll<HTMLElement>('a')].filter((a) => vis(a) && a.innerText.trim()).map((a) => `${a.innerText.trim()} .${a.className.split(' ')[0]}`);
        const box = [...document.querySelectorAll<HTMLElement>('div.gridbox')].find(vis);
        const hdrRow = box && [...box.querySelectorAll('.xhdr table.hdr tr')].find((tr) => tr.querySelector('.hdrcell'));
        const heads = hdrRow ? [...hdrRow.querySelectorAll('td')].map((td) => (td as HTMLElement).innerText.trim()) : [];
        const rows = box ? [...box.querySelectorAll('.objbox table.obj tr')].filter((tr) => tr.querySelector('td') && (tr as HTMLElement).offsetHeight > 0)
          .map((tr) => [...tr.querySelectorAll('td')].map((td) => (td as HTMLElement).innerText.trim())) : [];
        const total = (document.body.innerText.match(/Total\s*:\s*[\d,]+\s*\/\s*[\d,]+/) || [''])[0];
        const inputs = [...document.querySelectorAll<HTMLInputElement>('input')].filter((i) => vis(i) && i.id).map((i) => `${i.id}=${i.value}`);
        return { buttons, heads, rows: rows.slice(0, 15), total, inputs };
      });
      Object.assign(out, info);
      out.mine = info.rows.filter((r: string[]) => r.some((c) => /최신영|sychoi/.test(c)));
      if (info.rows.length) {
        const before = new Set(page.frames().map((f) => f.url()));
        await list.locator('div.gridbox:visible .objbox tr:visible td:visible').nth(3).dblclick().catch(() => {});
        await settle(page, 3000);
        out.detailFrames = [];
        for (const f of page.frames()) {
          if (!/detail\.do/i.test(f.url())) continue;
          const d = await f.evaluate(() => ({
            buttons: [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.offsetWidth > 0 && a.innerText.trim()).map((a) => `${a.innerText.trim()} .${a.className.split(' ')[0]}`),
            status: [...document.querySelectorAll<HTMLInputElement>('input')].filter((i) => /status/i.test(i.id) && i.offsetWidth > 0).map((i) => `${i.id}=${i.value}`),
          })).catch(() => null);
          out.detailFrames.push({ name: f.name(), url: f.url().split('?')[0], isNew: !before.has(f.url()), ...d });
        }
      }
    } catch (e: any) {
      out.error = String(e.message || e).split('\n')[0];
    }
    await page.screenshot({ path: `${OUT}/${m.code}.png` }).catch(() => {});
    fs.writeFileSync(`${OUT}/${m.code}.json`, JSON.stringify(out, null, 1));
  });
}
