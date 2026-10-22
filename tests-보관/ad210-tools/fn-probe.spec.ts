import { test } from '@playwright/test';
import fs from 'fs';
import { settle } from '../../support/dream';
import { openTab } from '../../support/pmplan';

// 일정확정하기·Edit 저장 화면 함수 확인 (읽기만). EXPLORE=1 일 때만
test.skip(!process.env.EXPLORE, '탐색용');
test('함수 확인', async ({ page }) => {
  test.setTimeout(180_000);
  const out: Record<string, unknown> = {};
  const dump = (f: import('@playwright/test').Frame) => f.evaluate(() => {
    const w = window as any;
    const names = Object.keys(w).filter((k) => { try { return typeof w[k] === 'function' && /confirm|sched|edit|save|delete|check|issue|fix/i.test(k) && String(w[k]).length < 6000 && !/native code/.test(String(w[k])); } catch { return false; } });
    const own = names.filter((k) => !/^(goSaveAction|goSaveAll|goSaveAllAction|goDeleteAll|goDeleteAction|goDeleteDetailAction|checkIsUpdate|checkDigitOnly|checkOjbName|checkFormMaxByte|checkMaxByte|checkRequireValue|checkDateValid|checkValidation|checkConfirmValidation|checkListStatus|checkSession|checkError|checkIframeLoaded|checkHttpXml|checkAjaxValidating|checkTwoDate|checkTime|setCheckClass|goSavenew|callGoSave|goBeforeSave)$/.test(k));
    const btns = [...document.querySelectorAll<HTMLAnchorElement>('a')].filter((a) => a.offsetWidth > 0 && a.innerText.trim().length < 12).map((a) => `${a.innerText.trim()} => ${a.getAttribute('href') || ''} ${a.getAttribute('onclick') || ''} ${a.className}`);
    return { btns, fns: own.map((k) => `${k}: ${String(w[k]).slice(0, 3000)}`) };
  });
  const y = await openTab(page, 'year');
  out.year = await dump(y);
  const p = await openTab(page, 'period');
  await settle(page, 1000);
  out.period = await dump(p);
  fs.writeFileSync('playwright/.data/fn-probe.json', JSON.stringify(out, null, 1));
});
