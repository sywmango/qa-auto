import { Page, Frame, expect } from '@playwright/test';
import { settle, lovContentFrame, clickButton, escapeRe } from './dream';

// 상세 입력폼 공통 부품
// - fillAllFields: 화면에 보이는 수정 가능한 칸을 모두 채움 (읽기전용은 건너뜀)
//     · 돋보기(Lov) 칸  → 팝업에서 골라서 선택
//     · 달력 칸         → yyyy-mm-dd
//     · 숫자 칸         → 숫자
//     · 그 외 글자 칸    → 실제로 쓸 법한 값
// - readFields / diffFields: 저장 후 다시 열어서 칸마다 값 비교

export type FieldInfo = { id: string; label: string; kind: 'lov' | 'date' | 'number' | 'text' | 'textarea'; readonly: boolean; required: boolean };
export type Entered = Record<string, { label: string; value: string }>;

/** 폼에 보이는 입력칸 목록 (id 에 DTO 가 들어간 칸) */
export async function listFields(scope: Frame): Promise<FieldInfo[]> {
  return scope.evaluate(() => {
    const vis = (e: Element) => (e as HTMLElement).offsetWidth > 0 || (e as HTMLElement).offsetHeight > 0;
    return [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[id*="DTO"], textarea[id*="DTO"]')]
      .filter((e) => vis(e) && (e as HTMLInputElement).type !== 'hidden' && (e as HTMLInputElement).type !== 'checkbox')
      .map((e) => {
        // 라벨: 같은 .field 안의 label, 없으면 위로 올라가며 가장 가까운 label
        let field = e.closest('.field');
        let labelEl = field?.querySelector('label') ?? null;
        for (let x: HTMLElement | null = e.parentElement, i = 0; !labelEl && x && i < 5; x = x.parentElement, i++) {
          labelEl = x.querySelector('label');
          if (labelEl) field = x;
        }
        const label = (labelEl?.textContent || '').replace(/[•*]/g, '').trim();
        const box = e.closest('.input_box') || e.parentElement!;
        const cls = [...box.querySelectorAll('*')].map((x) => (x as HTMLElement).className).join(' ');
        const isLov = !!box.querySelector('p.open_spop');
        const isDate = /cal|date/i.test(cls) || /date/i.test(e.className);
        const isNum = /num|number|tx_r|right/i.test(e.className) || e.getAttribute('inputmode') === 'numeric' || getComputedStyle(e).textAlign === 'right';
        const kind = e.tagName === 'TEXTAREA' ? 'textarea' : isLov ? 'lov' : isDate ? 'date' : isNum ? 'number' : 'text';
        const required = !!(labelEl && (/[•*]/.test(labelEl.textContent || '') || /req|essential|must/i.test(labelEl.className + ' ' + (field?.className || ''))));
        return { id: e.id, label, kind, readonly: e.readOnly || e.disabled, required } as const;
      });
  }).then((list) => {
    // 같은 라벨이 두 칸(예: 주기 숫자 + 주기구분)이면 두 번째에 (2)를 붙여 구분
    const seen: Record<string, number> = {};
    return (list as FieldInfo[]).map((f) => {
      seen[f.label] = (seen[f.label] ?? 0) + 1;
      return seen[f.label] > 1 ? { ...f, label: `(${seen[f.label]})` } : f;
    });
  });
}

/** 이 날짜 기준 n일 뒤 yyyy-mm-dd */
export function dateAfter(days: number) {
  const d = new Date(Date.now() + days * 86400_000);
  return d.toISOString().slice(0, 10);
}

/** 테스트가 만든 데이터 표시: 대표 이름 칸 맨 앞에 붙임 */
export const TAG = '[sychoi]';

/** 대표 이름 칸인지 (작업명, 점검항목, 제목 등) */
export const isNameLabel = (label: string) => /작업명|점검항목|제목|요청명|^.+명$/.test(label) && !/부서|공장|설비|사원|담당|거래처|달력|그룹/.test(label);

/** 라벨을 보고 실제로 쓸 법한 값을 만듭니다. */
function realisticText(label: string, stamp: string) {
  if (isNameLabel(label)) return `${TAG} ${label.replace(/명$/, '')} 정기 확인 ${stamp}`.replace(/\s+/g, ' ').trim();
  if (/비고|설명|내용|메모/.test(label)) return `윤활 상태와 이상음 함께 확인 (${stamp})`;
  if (/번호|코드|No|#/i.test(label)) return `QA-${stamp}`;
  return `${label} ${stamp}`;
}

function realisticNumber(label: string) {
  if (/주기/.test(label)) return '1';
  if (/몇일|일전/.test(label)) return '7';
  if (/시간|분/.test(label)) return '30';
  if (/금액|단가|가액/.test(label)) return '150000';
  return '10';
}

/** 사원을 넣는 칸인지 (담당자, 작성자, 작업자 등) — 이런 칸은 로그인한 본인을 고릅니다. */
export const isEmployeeLabel = (label: string) => /담당자|작성자|작업자|요청자|사원|관리자|수령자|검수자|처리자/.test(label);

/** 로그인한 사용자 이름 (왼쪽 아래 "이름 [부서]" 표시) */
export async function loginUserName(page: Page) {
  const t = await page.locator('#sidebar').innerText().catch(() => '');
  const m = t.match(/([^\s\[\]]+)\s*\[[^\]]+\]\s*\n?\s*로그아웃/);
  if (!m) throw new Error('로그인 사용자 이름을 찾지 못함');
  return m[1];
}

/** Lov 팝업을 열어 행을 고르고 [선택]. pick 이 있으면 그 글자의 행, 없으면 첫 데이터 행 */
export async function chooseInLov(page: Page, scope: Frame, id: string, pick?: string) {
  await scope.locator(`[id="${id}"]`).locator('xpath=..').locator('p.open_spop').click();
  await settle(page, 1500);
  const lov = await lovContentFrame(page);
  const cells = lov.locator('div.gridbox:visible .objbox tr:visible td:visible');
  // 고를 데이터가 없는 Lov(예: 부위가 등록되지 않은 설비의 점검부위)는 닫고 건너뜀
  if (!pick && !(await cells.filter({ hasText: /\S/ }).count())) {
    if (process.env.QA_DEBUG) console.log('[fill]', id, 'Lov 에 고를 데이터 없음 → 건너뜀');
    await closeLov(page);
    return false;
  }
  const cell = pick
    ? lov.locator('div.gridbox:visible .objbox td:visible', { hasText: new RegExp(`^\\s*${escapeRe(pick)}\\s*$`) }).first()
    : cells.filter({ hasText: /\S/ }).nth(1); // 0번은 체크박스/순번일 수 있어 1번 칸
  await cell.click();
  await clickButton(lov, '선택');
  await settle(page, 1000);
  return true;
}

/** 열린 Lov 팝업 닫기 (팝업 안 오른쪽 위 X) */
export async function closeLov(page: Page) {
  const pop = page.frames().find((f) => f.name() === 'popupIframe1');
  await pop?.locator('div.b_pwin_close:visible').first().click().catch(() => {});
  await settle(page, 800);
}

/**
 * 폼의 수정 가능한 칸을 모두 채웁니다.
 * overrides: { 필드id: 값 } — Lov 칸이면 팝업에서 고를 글자, 아니면 입력할 값. null 이면 건너뜀.
 * 반환: 채운 뒤 실제로 칸에 들어간 값 (Lov 연동으로 바뀐 값까지 반영)
 */
export async function fillAllFields(page: Page, scope: Frame, overrides: Record<string, string | null> = {}, stamp = '') {
  const fields = (await listFields(scope)).filter((f) => !f.readonly);
  const me = await loginUserName(page).catch(() => '');
  for (const f of fields) {
    if (overrides[f.id] === null) continue;
    const want = overrides[f.id];
    const input = scope.locator(`[id="${f.id}"]`);
    // 사원 칸은 항상 본인으로 (이미 다른 사람이 들어 있어도 바꿈)
    const pick = want ?? (f.kind === 'lov' && isEmployeeLabel(f.label) && me ? me : undefined);
    // 그 외 기본값으로 이미 채워진 칸은 그대로 둠 (지정값이 있을 때만 바꿈)
    if (pick === undefined && (await input.inputValue()).trim()) continue;
    if (pick !== undefined && f.kind === 'lov' && (await input.inputValue()).trim() === pick) continue;
    if (f.kind === 'text' && /주기$|몇일|시간|\(분\)|수량|금액|중량|단가/.test(f.label)) f.kind = 'number';
    if (process.env.QA_DEBUG) console.log('[fill]', f.id, f.label, f.kind, pick ?? want ?? '(자동)');
    if (f.kind === 'lov') {
      await chooseInLov(page, scope, f.id, pick);
    } else if (f.kind === 'date') {
      await input.fill(want ?? dateAfter(14));
      await input.press('Tab').catch(() => {});
    } else if (f.kind === 'number') {
      await input.fill(want ?? realisticNumber(f.label));
      await input.press('Tab').catch(() => {});
    } else {
      await input.fill(want ?? realisticText(f.label, stamp));
      // 값이 바뀐 것을 화면이 알아차리도록 칸을 벗어남
      await input.press('Tab').catch(() => {});
    }
  }
  return readFields(scope, fields.map((f) => f.id));
}

/** 칸 값 읽기 */
export async function readFields(scope: Frame, ids?: string[]): Promise<Entered> {
  const fields = await listFields(scope);
  const out: Entered = {};
  for (const f of fields) {
    if (ids && !ids.includes(f.id)) continue;
    out[f.id] = { label: f.label, value: (await scope.locator(`[id="${f.id}"]`).inputValue()).trim() };
  }
  return out;
}

/** 입력한 값과 다시 연 값 비교. 다른 칸만 돌려줌 */
export function diffFields(entered: Entered, now: Entered) {
  const diff: string[] = [];
  for (const [id, e] of Object.entries(entered)) {
    const n = now[id]?.value ?? '(칸 없음)';
    if (normalize(n) !== normalize(e.value)) diff.push(`${e.label}: 입력="${e.value}" 저장후="${n}"`);
  }
  return diff;
}

/** 입력한 값과 목록 행 비교 (라벨과 같은 이름의 열만) */
export function diffWithRow(entered: Entered, row: Record<string, string>) {
  const diff: string[] = [];
  let compared = 0;
  for (const e of Object.values(entered)) {
    if (!(e.label in row)) continue;
    compared++;
    if (normalize(row[e.label]) !== normalize(e.value)) diff.push(`${e.label}: 입력="${e.value}" 목록="${row[e.label]}"`);
  }
  return { diff, compared };
}

const normalize = (s: string) => s.replace(/,/g, '').replace(/\s+/g, ' ').trim();

/** 저장 → "저장하시겠습니까?" OK → 결과 메시지가 있으면 읽고 [확인]으로 닫음 */
export async function saveForm(page: Page, scope: Frame) {
  const dbg = (s: string) => { if (process.env.QA_DEBUG) console.log('[save]', new Date().toISOString().slice(11, 19), s); };
  dbg('저장 클릭');
  // 상세 화면을 아래로 내리면 버튼 줄이 상위 화면의 고정 머리줄로 옮겨 가고 원래 자리 버튼은 숨겨집니다.
  // 상위 화면의 버튼은 다른 폼(예: 정기점검주기 본문) 것일 수 있으므로 쓰지 않고,
  // 이 프레임의 저장 버튼이 숨겨져 있으면 그 버튼을 직접 눌러(click 이벤트) 이 폼을 저장합니다.
  const visibleSave = await scope.locator('a:visible', { hasText: /^\s*저장\s*$/ }).count().catch(() => 0);
  if (visibleSave) await clickButton(scope, '저장');
  else {
    const done = await scope.evaluate(() => {
      const a = [...document.querySelectorAll('a')].find((x) => (x.textContent || '').trim() === '저장');
      if (a) (a as HTMLElement).click();
      return !!a;
    });
    dbg(`저장 버튼이 보이지 않음 → ${done ? '이 프레임의 숨은 버튼을 직접 누름' : '버튼이 상위 머리줄로 옮겨 감'}`);
    if (!done) {
      // 버튼 줄 자체가 상위 프레임 고정 머리줄로 옮겨 간 경우 (정기점검주기 본문에서 확인됨)
      let p = scope.parentFrame();
      while (p && !(await p.locator('a:visible', { hasText: /^\s*저장\s*$/ }).count().catch(() => 0))) p = p.parentFrame();
      if (!p) throw new Error('저장 버튼을 찾지 못함');
      dbg(`상위 프레임 "${p.name() || '(메인)'}" 의 저장 버튼 사용`);
      await clickButton(p, '저장');
    }
  }
  await settle(page, 800);
  // 확인창 OK: 보이는 것만, 덮개에 막히면 강제 클릭 (기다림이 끝없이 이어지지 않게 시간 제한)
  const ok = page.getByText('OK', { exact: true }).filter({ visible: true }).first();
  if (await ok.isVisible().catch(() => false)) {
    dbg('OK 클릭');
    await ok.click({ timeout: 10_000 }).catch(() => ok.click({ force: true, timeout: 10_000 }));
  } else dbg('OK 확인창 없음');
  await settle(page, 1500);
  const msg = await popupMessage(page);
  dbg(`안내 메시지 "${msg}"`);
  return msg;
}

/** 화면 가운데 뜬 안내 메시지(확인 버튼)가 있으면 글자를 읽고 닫습니다. */
export async function popupMessage(page: Page) {
  const btn = page.getByText('확인', { exact: true }).filter({ visible: true }).first();
  if (!(await btn.isVisible().catch(() => false))) return '';
  const text = await btn.evaluate((b) => {
    // 메시지 상자: 확인 버튼에서 위로 올라가며 글자가 생기는 가장 가까운 상자 (화면 전체 글자를 읽지 않도록 300자 이하)
    let x: HTMLElement | null = b as HTMLElement;
    let best = '';
    for (let i = 0; i < 6 && x; i++, x = x.parentElement) {
      const t = (x.innerText || '').replace(/확인\s*$/, '').trim();
      if (t.length > 300) break;
      if (t) best = t;
    }
    return best;
  });
  await btn.click({ timeout: 10_000 }).catch(() => btn.click({ force: true, timeout: 10_000 }));
  await settle(page, 500);
  return text;
}

/** 필수값 누락 저장 시 메시지가 떠야 함 */
export async function expectRequiredMessage(page: Page, scope: Frame, label: string) {
  const msg = await saveForm(page, scope);
  expect.soft(msg, `${label} 누락 시 필수 안내`).toMatch(/필수/);
  return msg;
}
