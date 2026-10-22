import { test } from '@playwright/test';
import fs from 'fs';
import { settle, clickButton, Grid, lovContentFrame } from '../../support/dream';
import { openTab } from '../../support/pmplan';

// 일정추가 팝업 구조 확인 (저장하지 않음). EXPLORE=1 일 때만
test.skip(!process.env.EXPLORE, '탐색용');
test('일정추가 팝업', async ({ page }) => {
  test.setTimeout(240_000);
  const out: Record<string, unknown> = {};
  const y = await openTab(page, 'year');
  await clickButton(y, '일정추가하기');
  await settle(page, 3000);
  const pop = page.frames().find((f) => f.name() === 'popupIframe1')!;
  out.popupHtml = (await pop.evaluate(() => document.body.innerHTML.replace(/\s+/g, ' '))).slice(0, 6000);
  // 일정추가하기를 누르면 예방작업설비선택 Lov(popupIframe2)가 같이 열림
  const lov = page.frames().find((f) => f.name() === 'popupIframe2')!;
  out.lovName = lov.name();
  await lov.locator('[id="lovWorkPmListEquipDTO.filterPmNo"]').fill('8007');
  await lov.locator('a.b_search:visible, a:visible:has-text("검색")').first().click();
  await settle(page, 2500);
  out.lovRows = await new Grid(lov, '예방작업번호').rows();
  await lov.locator('div.gridbox:visible .objbox td:visible', { hasText: /^\s*100302AG13\s*$/ }).first().click();
  await clickButton(lov, '선택');
  await settle(page, 2000);
  out.afterPick = await pop.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('input[id*="DTO"]')].map((e) => `${e.id}=${e.value}`));
  await clickButton(pop, '생성');
  await settle(page, 1500);
  out.gridHtml = await pop.evaluate(() => [...document.querySelectorAll<HTMLElement>('div.gridbox')].filter((g) => g.offsetWidth > 0).map((g) => g.outerHTML.replace(/\s+/g, ' ').slice(0, 4000)));
  // 그리드 객체 찾기 (dhtmlXGridObject)
  out.gridObj = await pop.evaluate(() => {
    const w = window as any;
    const names = Object.keys(w).filter((k) => { try { return w[k] && typeof w[k] === 'object' && typeof w[k].cells === 'function' && typeof w[k].getRowsNum === 'function'; } catch { return false; } });
    return names.map((n) => ({ n, rows: w[n].getRowsNum(), cols: w[n].getColumnsNum(), ids: w[n].getAllRowIds(), types: [...Array(w[n].getColumnsNum())].map((_, i) => w[n].getColType(i)), lbls: [...Array(w[n].getColumnsNum())].map((_, i) => w[n].getColLabel(i)) }));
  });
  // 저장 함수 이름 (저장 버튼 onclick/href)
  out.saveBtn = await pop.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>('a')].filter((a) => /저장|생성|삭제/.test(a.innerText)).map((a) => `${a.innerText.trim()} ${a.getAttribute('href') || ''} ${a.getAttribute('onclick') || ''}`));
  out.scripts = await pop.evaluate(() => [...document.scripts].map((s) => s.src || '').filter(Boolean));
  out.setTest = await pop.evaluate(() => {
    const w = window as any; const g = w.myGrid;
    const ids = String(g.getAllRowIds()).split(',');
    const id = ids[ids.length - 1];
    const c = g.cells(id, 1);
    const r: Record<string, unknown> = { colIds: [...Array(g.getColumnsNum())].map((_, i) => g.getColumnId(i)), fmt: g._dtmask || g._dtmask_inc || null };
    const tries: Record<string, unknown> = {};
    const t = (name: string, fn: () => void) => { try { fn(); tries[name] = c.getValue() + ' | ' + c.cell.innerHTML; } catch (e) { tries[name] = 'ERR ' + e; } };
    t('setValue str', () => c.setValue('2026-12-15'));
    t('setValue Date', () => c.setValue(new Date(2026, 11, 15)));
    t('setCValue', () => c.setCValue('2026-12-15', '2026-12-15'));
    t('setDate', () => c.setDate && c.setDate(new Date(2026, 11, 16)));
    r.tries = tries; r.proto = Object.keys(Object.getPrototypeOf(c)).slice(0, 40);
    r.setValueSrc = String(c.setValue).slice(0, 900);
    r.afterSet = c.getValue(); r.byId = w.getValueById(g, id, 'PLANDATE'); r.cellHtml = c.cell.innerHTML;
    r.getValueById = String(w.getValueById).slice(0, 800);
    return r;
  });
  out.goSave = await pop.evaluate(() => { const w = window as any; return ['goSave','goSaveAction','goInsert','goCreate','goDelete','setSchedDate','goSelectEquip'].filter((k) => typeof w[k] === 'function').map((k) => k + ': ' + String(w[k]).slice(0, 2500)); });
  out.allFns = await pop.evaluate(() => { const w = window as any; return Object.keys(w).filter((k) => typeof w[k] === 'function' && /^(go|set|find|lov|on|check)/.test(k)).slice(0, 200); });
  await page.screenshot({ path: 'playwright/.data/add-probe.png' });
  fs.writeFileSync('playwright/.data/add-probe.json', JSON.stringify(out, null, 1));
});
