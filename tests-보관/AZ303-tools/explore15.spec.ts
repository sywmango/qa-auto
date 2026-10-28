import { test } from '@playwright/test';
import fs from 'fs';
import { lovContentFrame, clickButton, settle } from '../support/dream';
import { createCycle, issuePlan, openExec, Chain, today, addPatrolPlan } from '../support/az303-chain';

// 순회점검·점검Group: [sychoi] 주기 생성 → 일정생성 → 일정발행 → 실행 상세 버튼 (데이터를 만듦, [sychoi] 만)
const OUT = 'playwright/.data/az303-explore/survey15';
const stamp = new Date(Date.now() + 9 * 3600_000).toISOString().slice(5, 16).replace('T', ' ');
const CH: Record<string, Chain> = {
  PTRLRESULT: {
    cycle: ['작업관리', '순회점검작업', '순회점검Route설정'], plan: ['작업관리', '순회점검작업', '순회점검계획'], exec: ['작업관리', '순회점검작업', '순회점검실행'],
    nameHeader: '점검명', listTab: '목록', labels: { '최초작업예정일': new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10), '근무달력': '기본 달력' },
  },
  PMIGRPRSLT: {
    cycle: ['작업관리', '점검Group', '점검Group주기'], plan: ['작업관리', '점검Group', '점검Group계획'], exec: ['작업관리', '점검Group', '점검Group실행'],
    nameHeader: '점검명', listTab: '목록', labels: { '최초작업예정일': new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10), '근무달력명': '기본 달력', '근무달력': '기본 달력' },
    pre: async (page) => {
      const lov = await lovContentFrame(page).catch(() => undefined);
      if (!lov) return;
      await lov.locator('div.gridbox:visible .objbox td:visible', { hasText: /^\s*동종설비점검\s*$/ }).first().click();
      await page.waitForTimeout(600);
      await clickButton(lov, '선택');
      await settle(page, 3000);
    },
  },
};

for (const [code, c] of Object.entries(CH).filter(([k]) => k === 'PTRLRESULT')) {
  test(`탐색15 ${code}`, async ({ page }) => {
    test.setTimeout(600_000);
    const out: any = { code };
    page.on('dialog', (d) => { (out.dialogs ||= []).push(d.message()); d.accept(); });
    const firstDate = Object.fromEntries(Object.entries({}).map(([k, v]) => [k, v]));
    try {
      const cy = await createCycle(page, c, stamp);
      out.cycle = cy;
      if (code === 'PTRLRESULT') out.add = await addPatrolPlan(page, c, cy.name);
      out.issue = await issuePlan(page, c, cy.name);
      const det = await openExec(page, c, cy.name);
      if (det) out.detail = await det.evaluate(() => ({
        url: location.pathname,
        buttons: [...document.querySelectorAll<HTMLElement>('a')].filter((a) => a.innerText.trim() && /b_/.test(a.className)).map((a) => `${a.innerText.trim()} .${a.className.split(' ')[0]}${a.offsetWidth > 0 ? '' : ' (숨김)'}`),
        status: [...document.querySelectorAll<HTMLInputElement>('input')].filter((i) => /status/i.test(i.id) && i.offsetWidth > 0).map((i) => `${i.id}=${i.value}`),
      }));
      else out.detail = '실행 목록에 없음';
    } catch (e: any) { out.error = String(e.message || e).split('\n')[0]; }
    void firstDate; void today;
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/${code}.png` });
    fs.writeFileSync(`${OUT}/${code}.json`, JSON.stringify(out, null, 1));
  });
}
