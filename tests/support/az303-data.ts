import { Page, Frame, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { settle, clickButton, waitFrame, Grid } from './dream';
import { put, saveForm, dateAfter } from './form';
import { DATA_DIR } from './site';
import { openMenuByPath, listFrame } from './approval';

// 결재요청(AZ303) 기능 테스트용 데이터: [sychoi] 일일업무일지
// 일일업무일지는 작성자 + 일정조정 일자당 하나만 만들 수 있어, 내 일지가 없는 날짜를 골라 새로 만듦.
// 만든 문서 제목은 상태 파일(az303-state.json)에 적어 다음 테스트가 같은 문서를 씀. 결재한 문서는 남김.

export const note = (t: string) => test.info().annotations.push({ type: '실제결과', description: t });
export const DAY = 'maWoDayRptDetailDTO';
export const DAY_PATH = ['일일업무', '일일업무일지'];
export const DAY_FLOW = '일일업무일지';

const STATE = path.join(DATA_DIR, 'az303-state.json');
type State = Record<string, string>;
export const state: State = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
export function keep(v: State) {
  Object.assign(state, v);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
}

/** 일일업무일지 목록 (기간을 올해 1월 1일부터로 넓혀 검색) */
export async function dayList(page: Page) {
  await openMenuByPath(page, DAY_PATH);
  const list = await listFrame(page);
  await put(list.locator('[id="maWoDayRptCommonDTO.filterStartDate"]'), `${dateAfter(0).slice(0, 4)}-01-01`);
  await put(list.locator('[id="maWoDayRptCommonDTO.filterEndDate"]'), dateAfter(60));
  await clickButton(list, '검색');
  await settle(page, 2000);
  return { list, rows: await new Grid(list, '제목').rows() };
}

/** 제목으로 일지 상세 열기 */
export async function openDayLog(page: Page, title: string): Promise<Frame> {
  const { list } = await dayList(page);
  await new Grid(list, '제목').clickCell('제목', title, { dbl: true });
  await settle(page, 3000);
  return waitFrame(page, /maWoDayRptDetail_maWoDayRptList/);
}

/** 내 일지가 없는 날짜(어제부터 거꾸로)에 [sychoi] 일지를 새로 만들고 제목을 돌려줌 */
export async function createDayLog(page: Page) {
  const { list, rows } = await dayList(page);
  const used = new Set(rows.filter((r) => r['작성자'] === '최신영').map((r) => r['일정조정 일자']));
  let day = '';
  for (let i = 1; i < 300 && !day; i++) if (!used.has(dateAfter(-i))) day = dateAfter(-i);
  const [, m, d] = day.split('-');
  const title = `[sychoi] ${+m}월 ${+d}일 업무일지`;
  await clickButton(list, '생성');
  await settle(page, 3000);
  const det = await waitFrame(page, /maWoDayRptDetail_maWoDayRptList/);
  await put(det.locator(`[id="${DAY}.workDate"]`), day);
  await put(det.locator(`[id="${DAY}.workTime"]`), '480');
  await put(det.locator(`[id="${DAY}.title"]`), title);
  await put(det.locator(`[id="${DAY}.contents"]`), '설비 순회점검, 펌프 베어링 온도 기록, 결재요청 확인');
  await saveForm(page, det);
  const after = await dayList(page);
  if (!after.rows.some((r) => r['제목'] === title)) throw new Error(`일지 생성 안 됨: ${title}`);
  return title;
}

/** 이름(A, B …)으로 문서를 하나씩 둠. 없거나 이미 결재요청된 문서면 새로 만듦 */
export async function ensureDoc(page: Page, key: string, fresh = false) {
  if (state[key] && !fresh) {
    const { rows } = await dayList(page);
    const row = rows.find((r) => r['제목'] === state[key]);
    if (row && row['상태'] === '작성') return state[key];
  }
  const title = await createDayLog(page);
  keep({ [key]: title });
  return title;
}
