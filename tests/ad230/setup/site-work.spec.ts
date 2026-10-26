import { test, expect } from '@playwright/test';
import { ensureWork, myWorks } from '../../support/pmexec-data';
import { SITE, siteData } from '../../support/site';

// 사이트(mssql 등)의 [sychoi] 정기점검주기(site-pm.spec.ts 로 만든 것)를 정기점검계획에서 일정확정 → 정기점검실행에 작업발행 점검작업
// 실행: $env:QA_SITE="mssql"; $env:RUN_AD230='1'; npx playwright test ad230/setup/site-work

test.skip(!SITE, '기본 사이트는 [sychoi] 주기 8007 을 씀');

test('[sychoi] 점검작업 작업발행 만들기', async ({ page }) => {
  test.setTimeout(600_000);
  expect(siteData.pmNo && siteData.eqNo && siteData.workDate, 'site-data.json (site-pm.spec 먼저)').toBeTruthy();
  const log = await ensureWork(page, siteData.workDate!);
  const { mine } = await myWorks(page);
  test.info().annotations.push({ type: '실제결과', description: `${SITE} 주기 ${siteData.pmNo} 설비 ${siteData.eqNo} ${siteData.workDate}: ${log} → 점검작업 ${mine.map((r) => `${r['점검일자']} ${r['점검작업상태']}`).join(', ')}` });
  expect(mine.some((r) => r['점검작업상태'] === '작업발행')).toBe(true);
});
