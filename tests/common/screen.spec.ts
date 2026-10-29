import { test, expect, Page, Frame } from '@playwright/test';
import fs from 'fs';
import {
  openMenu, waitFrame, clickButton, fieldValue, settle, Grid, openLov, lovTotal, pickInLov, expandTreeUntil, visibleTreeNodes,
} from '../support/dream';
import { okAndMessage, popupMessage } from '../support/form';
import { Screen, ViewTarget, ViewCase, Row, SearchCond } from '../screens/types';
import { AD230 } from '../screens/ad230';
import { AD210 } from '../screens/ad210';
import { AP591 } from '../screens/ap591';

// 검색·목록·상세 공통 테스트: 화면 정의(tests/screens/<메뉴>.ts 의 view)를 읽어 메뉴마다 같은 케이스를 만듭니다.
// 메뉴마다 다른 것(검색 칸, 목록 열, 상세 칸)은 화면 정의에만 적고, 확인 방법은 여기 한 곳에만 둡니다.
// 테스트 제목 = <메뉴 테스트ID> <케이스 문장> (결과 엑셀 write-results.py 가 ID 로 행을 찾음)
// 조회만 합니다. 데이터를 만들거나 바꾸지 않습니다 (체크 없이 삭제는 안내만 보고 취소).
// 실행할 메뉴: RUN_AD230 / RUN_AD210 / RUN_AP591 이 켜진 메뉴만 (run-*.ps1 의 view 단계)

const SCREENS: Screen[] = [AD230, AD210, AP591].filter((s) => s.view && process.env[`RUN_${s.code}`]);

const note = (t: string) => test.info().annotations.push({ type: '실제결과', description: t });

/** 케이스 문장 (UT 양식 공통 케이스와 같은 말) */
const TITLE: Record<ViewCase, (name: string) => string> = {
  defaults: () => '검색 필드의 기본값을 확인한다.',
  lovOrigin: () => '설비 Lov 팝업의 데이터를 확인한다.',
  lovs: () => '그 외 검색 필드 Lov 팝업의 데이터를 확인한다.',
  searchOne: (n) => `조건 하나로 ${n}${(n.charCodeAt(n.length - 1) - 0xac00) % 28 ? '을' : '를'} 검색한다.`,
  searchCombo: () => '여러 조건을 조합하여 검색한다.',
  searchAll: (n) => `${n} 전체를 검색한다.`,
  searchNone: () => '검색 결과가 없는 조건으로 검색한다.',
  sort: () => '조회된 목록을 정렬한다.',
  total: () => '목록 건수 표시를 확인한다.',
  rowDetail: () => '(행 클릭) 상세정보를 조회한다.',
  popupDetail: () => '(상세보기 버튼) 상세정보를 조회한다.',
  excel: () => '목록을 Excel로 다운로드한다.',
  listDetail: () => '목록과 상세의 값이 일치하는지 확인한다.',
  listFormat: () => '(목록) 데이터 표시 형식을 확인한다.',
  readonly: () => '읽기전용 필드를 확인한다.',
  close: () => '상세를 닫는다.',
  deleteNone: () => '선택 없이 삭제한다. (체크X)',
};

for (const s of SCREENS) {
  const v = s.view!;
  const grid = (f: Frame) => new Grid(f, v.key);
  const fid = (id: string) => (id.includes('.') ? id : `${v.dto}.${id}`);
  const search = async (page: Page, f: Frame) => {
    if (v.search) return v.search(page, f);
    await f.locator('a.b_search:visible').first().click();
    await settle(page, 1500);
  };
  /** 비교에 쓸 행 (목록 프레임, 행, 몇 번째 행) */
  const base = async (page: Page) => {
    const f = await (v.rows ?? v.open)(page);
    const rows = await grid(f).rows();
    const row = v.pickRow ? v.pickRow(rows) : rows[0];
    expect(row, '비교에 쓸 행이 있어야 함').toBeTruthy();
    return { f, row, index: rows.indexOf(row) };
  };
  /** 목록의 index 번째 보이는 행의 col 칸 클릭 (같은 글자가 여러 행에 있어도 그 행만) */
  const clickRow = async (f: Frame, index: number, col: string) => {
    const ci = await f.evaluate(([key, col]) => {
      const box = [...document.querySelectorAll<HTMLElement>('div.gridbox')].find((b) => b.offsetWidth > 0 && [...b.querySelectorAll('.hdrcell')].some((c) => (c as HTMLElement).innerText.trim() === key))!;
      box.setAttribute('data-qa', 'view-list');
      const tr = [...box.querySelectorAll('.xhdr table.hdr tr')].find((x) => x.querySelector('.hdrcell'))!;
      return [...tr.querySelectorAll('td')].map((td) => (td as HTMLElement).innerText.trim()).indexOf(col);
    }, [v.key, col]);
    await f.locator('div[data-qa="view-list"] .objbox table.obj tr:visible').nth(index).locator('td').nth(ci).click();
  };
  /** 케이스 하나 (화면 정의에 테스트ID 가 있을 때만) */
  const tc = (c: ViewCase, body: (page: Page, ctx: { context: import('@playwright/test').BrowserContext }) => Promise<void>) => {
    const id = v.ids[c];
    if (id) test(`${id} ${TITLE[c](s.name)}`, async ({ page, context }) => {
      if (v.timeout) test.setTimeout(v.timeout);
      await body(page, { context });
      await v.extra?.[c]?.(page);   // 이 메뉴에만 있는 추가 확인
    });
  };

  /** 조건 하나를 넣고 검색해 맞지 않는 행 수를 셈 */
  async function searchBy(page: Page, f: Frame, conds: [SearchCond, string][]) {
    for (const [c, value] of conds) {
      if (c.preset) continue;
      if (c.lov !== undefined) {
        const lov = await openLov(page, f, fid(c.id));
        if (c.tree) await expandTreeUntil(page, lov, value);
        await pickInLov(page, lov, value, c.tree || !c.lov ? undefined : c.lov);
      } else {
        await f.locator(`[id="${fid(c.id)}"]`).fill(value);
      }
    }
    await search(page, f);
    const rows = await grid(f).rows();
    const total = await grid(f).total();
    const ok = (r: Row, c: SearchCond, value: string) => {
      const cell = r[c.col];
      if (cell === undefined) return true;
      const words = c.words ? value.split(/\s+/).filter(Boolean) : [value];
      return words.every((w) => cell.includes(w)) || (v.sameAs?.(rows, r, c, value) ?? false);
    };
    const bad = rows.filter((r) => !conds.every(([c, value]) => ok(r, c, value)));
    return { rows, total, bad };
  }

  /** 상세 열기 (비교에 쓸 행 클릭) */
  async function openDetail(page: Page) {
    const { f, row: r, index } = await base(page);
    await clickRow(f, index, v.detail!.click);
    const d = await waitFrame(page, v.detail!.frame);
    await expect.poll(() => d.locator('input[id*="DTO"]').count().catch(() => 0), { message: '상세 칸이 보여야 함', timeout: 20_000 }).toBeGreaterThan(0);
    await settle(page, 1000);
    return { f, r, d };
  }

  test.describe(`${s.code} ${s.name} 공통 화면`, () => {
    tc('defaults', async (page) => {
      const f = await (v.defaults.open ?? v.open)(page);
      const fixed = Object.keys(v.defaults.values ?? {});
      const empty = v.defaults.empty === 'all'
        ? (await f.evaluate((dto) => [...document.querySelectorAll<HTMLInputElement>(`input[id^="${dto}."]`)].filter((e) => e.offsetWidth > 0).map((e) => e.id.split('.')[1]), v.dto)).filter((id) => !fixed.includes(id))
        : v.defaults.empty;
      const now: Record<string, string> = {};
      for (const id of [...empty, ...fixed]) now[id] = await fieldValue(f, fid(id));
      note(Object.entries(now).map(([k, x]) => `${k}="${x}"`).join(', '));
      for (const [id, want] of Object.entries(v.defaults.values ?? {})) {
        if (typeof want === 'string') expect.soft(now[id], `${id} 기본값`).toBe(want);
        else expect.soft(now[id], `${id} 기본값`).toMatch(want);
      }
      for (const id of empty) expect.soft(now[id], `${id} 비어 있음`).toBe('');
    });

    tc('lovOrigin', async (page, { context }) => {
      const o = v.lovOrigin!;
      const f = await v.open(page);
      const lovCount = await lovTotal(await openLov(page, f, fid(o.id)));
      const p2 = await context.newPage();
      await openMenu(p2, o.menu);
      const total = await new Grid(await waitFrame(p2, o.frame), o.header).total();
      await p2.close();
      note(`Lov 건수=${lovCount}, 원본 메뉴 건수=${total?.all}`);
      expect(lovCount, 'Lov 건수 = 원본 메뉴 건수').toBe(total?.all);
    });

    tc('lovs', async (page) => {
      test.setTimeout(Math.max(v.timeout ?? 0, 60_000 + 30_000 * (v.lovs?.length ?? 0)));
      const log: string[] = [];
      for (const [label, id, open] of v.lovs ?? []) {
        const f = await (open ?? v.open)(page);
        // Total 이 없는 Lov(트리형, 시스템코드)는 보이는 트리 항목·목록 행 수로 셈
        const count = await openLov(page, f, fid(id)).then(async (lov) => (await lovTotal(lov)) || (await visibleTreeNodes(lov)).length
          || (await lov.evaluate(() => [...document.querySelectorAll<HTMLElement>('div.gridbox .objbox tr')].filter((t) => t.offsetHeight > 0 && t.querySelector('td')).length)), () => null);
        log.push(`${label}: ${count === null ? '팝업 열기 실패' : `${count}건`}`);
        expect.soft(count, `${label} Lov 목록에 데이터가 있어야 함`).toBeGreaterThan(0);
      }
      note(log.join(', '));
    });

    tc('searchOne', async (page) => {
      test.setTimeout(Math.max(v.timeout ?? 0, 60_000 * v.conds.length));
      const log: string[] = [];
      const { row } = await base(page);
      for (const c of v.conds) {
        const f = await v.open(page);
        const value = c.value(row);
        if (!value) { log.push(`${c.col}: 비교 행에 값 없음(건너뜀)`); continue; }
        const r = await searchBy(page, f, [[c, value]]).catch((e) => ({ error: String(e).split('\n')[0] }));
        if ('error' in r) { log.push(`${c.col}="${value}": ${r.error}`); expect.soft(r.error, `${c.col} 검색`).toBe(''); continue; }
        log.push(`${c.col}="${value}": ${r.rows.length}행, Total ${r.total?.loaded}/${r.total?.all}, 불일치 ${r.bad.length}행` + (r.bad.length ? ` (예: ${r.bad.slice(0, 3).map((b) => b[c.col]).join(' / ')})` : ''));
        expect.soft(r.rows.length, `${c.col} 검색 결과가 있어야 함`).toBeGreaterThan(0);
        expect.soft(r.bad.length, `${c.col} 조건과 다른 행이 없어야 함`).toBe(0);
        expect.soft(r.total?.loaded, `${c.col} Total 과 행 수 일치`).toBe(r.rows.length);
      }
      note(log.join('\n'));
    });

    tc('searchCombo', async (page) => {
      test.setTimeout(Math.max(v.timeout ?? 0, 120_000));
      const log: string[] = [];
      const { row } = await base(page);
      for (const combo of v.combos ?? []) {
        const f = await v.open(page);
        const pairs = combo.map((c) => [c, c.value(row)] as [SearchCond, string]);
        const r = await searchBy(page, f, pairs);
        log.push(`${pairs.map(([c, x]) => `${c.col}="${x}"`).join(' + ')}: ${r.rows.length}행, 불일치 ${r.bad.length}행`);
        expect.soft(r.rows.length).toBeGreaterThan(0);
        expect.soft(r.bad.length).toBe(0);
      }
      note(log.join('\n'));
    });

    tc('searchAll', async (page) => {
      const f = await v.open(page);
      const before = await grid(f).total();
      for (const id of v.clearAll) await f.locator(`[id="${fid(id)}"]`).fill('');
      await search(page, f);
      const after = await grid(f).total();
      note(`기본 검색 ${before?.all}건 → ${v.clearAll.join(',')} 비우고 검색 ${after?.all}건`);
      expect(after?.all ?? 0).toBeGreaterThanOrEqual(before?.all ?? 0);
    });

    tc('searchNone', async (page) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const f = await v.open(page);
      await f.locator(`[id="${fid(v.none.id)}"]`).fill(v.none.value);
      await search(page, f);
      const rows = await grid(f).rows();
      const total = await grid(f).total();
      note(`${rows.length}행, Total ${total?.loaded}/${total?.all}, 스크립트 에러 ${errors.length}건`);
      expect(rows.length).toBe(0);
      expect(total?.all).toBe(0);
      expect(errors).toEqual([]);
    });

    tc('sort', async (page) => {
      const f = await v.open(page);
      const header = f.locator('div.gridbox:visible .hdrcell', { hasText: new RegExp(`^\\s*${v.sort.col}\\s*$`) }).first();
      const read = async () => { await header.click(); await settle(page, 1000); return (await grid(f).rows()).map((r) => r[v.sort.col]); };
      const a = await read();
      const b = await read();
      const cmp = (x: string, y: string) => (v.sort.numeric ? Number(x.replace(/,/g, '')) - Number(y.replace(/,/g, '')) : x < y ? -1 : x > y ? 1 : 0);
      const isSorted = (x: string[], dir: 1 | -1) => x.every((val, i) => i === 0 || dir * cmp(x[i - 1], val) <= 0);
      const asc = isSorted(a, 1) || isSorted(b, 1);
      const desc = isSorted(a, -1) || isSorted(b, -1);
      note(`1회 클릭 앞 5개: ${a.slice(0, 5).join(',')} / 2회 클릭 앞 5개: ${b.slice(0, 5).join(',')}`);
      expect(asc && desc, '두 번 누르면 오름차순·내림차순이 바뀌어야 함').toBe(true);
    });

    tc('total', async (page) => {
      const f = await v.open(page);
      const g = grid(f);
      const t1 = await g.total();
      const rows1 = (await g.rows()).length;
      for (let i = 0; i < 30; i++) {
        await f.evaluate(() => { const o = document.querySelector('div.gridbox .objbox'); if (o) o.scrollTop = o.scrollHeight; });
        await page.waitForTimeout(400);
      }
      await settle(page, 1000);
      const t2 = await g.total();
      const rows2 = (await g.rows()).length;
      note(`처음 Total ${t1?.loaded}/${t1?.all} (행 ${rows1}) → 스크롤 후 Total ${t2?.loaded}/${t2?.all} (행 ${rows2})`);
      expect(t1?.loaded).toBe(rows1);
      if ((t1?.loaded ?? 0) < (t1?.all ?? 0)) expect(t2?.loaded, '스크롤하면 더 불러와야 함').toBeGreaterThan(t1?.loaded ?? 0);
      expect(t2?.all, '처음 표시된 전체 건수와 끝까지 불러온 건수가 같아야 함').toBe(t1?.all);
    });

    tc('rowDetail', async (page) => {
      const { r, d } = await openDetail(page);
      await expect(d.getByText(v.detail!.title(r)).first()).toBeVisible();
      note(`행 클릭 → 상세 열림 (${v.detail!.click} "${r[v.detail!.click]}")`);
    });

    tc('popupDetail', async (page) => {
      const { f, row: r, index } = await base(page);
      await clickRow(f, index, v.detail!.click);
      await settle(page, 1000);
      const popWin = page.context().waitForEvent('page', { timeout: 15_000 }).catch(() => null);
      await clickButton(f, '상세보기');
      const win = await popWin;
      expect(win, '상세보기 새 창이 열려야 함').toBeTruthy();
      const title = (v.detail!.popupTitle ?? v.detail!.title)(r);
      await expect
        .poll(async () => {
          for (const fr of win!.frames()) if (title.test(await fr.evaluate(() => document.body?.innerText || '').catch(() => ''))) return true;
          return false;
        }, { message: '새 창에 같은 데이터의 상세가 보여야 함', timeout: 20_000 })
        .toBe(true);
      note(`상세보기 → 새 창에 같은 데이터 상세 (${v.detail!.click} "${r[v.detail!.click]}")`);
      await win!.close();
    });

    tc('excel', async (page) => {
      const f = await v.open(page);
      const total = await grid(f).total();
      // Excel 버튼은 새 창(excelExport.do)을 열고 그 창에서 파일이 내려받아집니다.
      const winP = page.context().waitForEvent('page', { timeout: 15_000 });
      await clickButton(f, 'Excel');
      const file = await (await winP).waitForEvent('download', { timeout: 60_000 });
      const saved = test.info().outputPath(file.suggestedFilename());
      await file.saveAs(saved);
      const size = fs.statSync(saved).size;
      note(`파일 "${file.suggestedFilename()}" ${size.toLocaleString()} bytes 받음 (목록 Total ${total?.loaded}/${total?.all})`);
      test.info().annotations.push({ type: '엑셀파일', description: saved });
      expect(size).toBeGreaterThan(0);
    });

    tc('listDetail', async (page) => {
      const { r, d } = await openDetail(page);
      const diff: string[] = [];
      for (const [col, id] of v.detail!.pairs) {
        const dv = await fieldValue(d, `${v.detail!.dto}.${id}`);
        if ((r[col] ?? '') !== dv) diff.push(`${col}: 목록="${r[col]}" 상세="${dv}"`);
      }
      note(diff.length ? diff.join('\n') : `${v.detail!.pairs.length}개 항목 모두 일치`);
      expect(diff).toEqual([]);
    });

    tc('listFormat', async (page) => {
      const f = await v.open(page);
      const rows = await grid(f).rows();
      const log: string[] = [];
      for (const [col, re, label] of v.format ?? []) {
        const bad = rows.filter((r) => r[col] && !re.test(r[col]));
        log.push(`${col} ${label} 형식 오류 ${bad.length}건${bad.length ? ` (예: ${bad.slice(0, 3).map((b) => b[col]).join(', ')})` : ''}`);
        expect.soft(bad.length, `${col} ${label}`).toBe(0);
      }
      note(log.join(', '));
    });

    tc('readonly', async (page) => {
      const { d } = await openDetail(page);
      const log: string[] = [];
      for (const id of v.detail!.readonly) {
        const ro = await d.locator(`[id="${v.detail!.dto}.${id}"]`).evaluate((e) => (e as HTMLInputElement).readOnly || (e as HTMLInputElement).disabled);
        log.push(`${id}: ${ro ? '읽기전용' : '수정 가능'}`);
        expect.soft(ro, `${id} 읽기전용`).toBe(true);
      }
      note(log.join(', '));
    });

    tc('close', async (page) => {
      const { r, d } = await openDetail(page);
      const title = d.getByText(v.detail!.title(r)).first();
      await expect(title).toBeVisible();
      await d.locator('[class*="close"]:visible, [class*="Close"]:visible').first().click({ timeout: 5_000 });
      await settle(page, 1000);
      await expect(title).toBeHidden();
      note('상세의 닫기(ⓧ) 클릭 후 상세가 닫힘');
    });

    tc('deleteNone', async (page) => {
      const f = await v.open(page);
      await clickButton(f, '삭제');
      let msg: string;
      if (v.deleteConfirm === 'ok') {
        // "삭제하시겠습니까?" 확인창이 먼저 뜨는 메뉴 → OK (체크한 행이 없어 지워지는 것은 없음) 후 안내 읽기
        msg = await okAndMessage(page);
      } else {
        // 안내를 읽고, 확인창이 뜨면 Cancel (지우지 않음)
        await settle(page, 1000);
        msg = await popupMessage(page);
        const cancel = page.getByText('Cancel', { exact: true }).first();
        if (await cancel.isVisible().catch(() => false)) await cancel.click();
      }
      note(`체크 없이 삭제 → ${msg}`);
      // OK 를 누른 경우는 확인창 글자에도 "선택"이 들어갈 수 있어 "선택 … 없" 안내까지 봄
      expect(msg).toMatch(v.deleteConfirm === 'ok' ? /선택.*없/ : /선택/);
    });
  });
}
