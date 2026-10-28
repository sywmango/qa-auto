import { test } from '@playwright/test';
import fs from 'fs';
import { settle, clickButton } from '../support/dream';
import { fillAllFields } from '../support/form';
import { openMenuByPath, listFrame, clickAndCollect } from '../support/approval';

// 증적: 계측기 [생성] → Revision 제정 팝업 [저장] 전후 화면
test('증적 계측기 제정', async ({ page }) => {
  test.setTimeout(240_000);
  const dir = 'playwright/.data/evidence';
  fs.mkdirSync(dir, { recursive: true });
  await openMenuByPath(page, ['설비자산', '계측기']);
  await clickButton(await listFrame(page), '생성');
  await settle(page, 3000);
  const pop = page.frames().find((f) => /popupIframe/.test(f.name()) && /Rev/.test(f.url()))!;
  const st = new Date(Date.now() + 9 * 3600_000).toISOString().slice(5, 16).replace(/\D/g, '');
  await fillAllFields(page, pop, { 'commRevCommonDTO.parentEquipDesc': null, 'commRevCommonDTO.description': `[sychoi] 제정 ${st}`, 'commRevCommonDTO.objectNo': `SY-${st}` }, st);
  await page.screenshot({ path: `${dir}/az303-EQTLREV-1-popup.png` });
  const btns = await pop.evaluate(() => [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.offsetWidth > 0 && a.innerText.trim()).map((a) => `${a.innerText.trim()}.${a.className.split(' ')[0]}`));
  const msgs = await clickAndCollect(page, pop, '저장').catch((e) => [`클릭 실패: ${String(e).slice(0, 80)}`]);
  await settle(page, 3000);
  await page.screenshot({ path: `${dir}/az303-EQTLREV-2-after-save.png` });
  fs.writeFileSync(`${dir}/az303-EQTLREV.txt`, `팝업 버튼: ${btns.join(', ')}\n[저장] 안내: ${msgs.join(' / ')}\n팝업 남음: ${!!page.frames().find((f) => /Rev/.test(f.url()))}`);
});
