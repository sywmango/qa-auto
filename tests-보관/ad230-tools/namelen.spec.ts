import { test } from '@playwright/test';
import fs from 'fs';
import { fieldValue, waitFrame } from '../../support/dream';
import { put, saveForm } from '../../support/form';
import { openPm, F_DETAIL } from '../../support/pmi';

// 작업명 길이 제한 확인 (TC_021·EC_013): 바이트(UTF-8) 수를 바꿔 저장되는지. 끝나면 원래 이름으로 되돌림.
const MAIN: string = JSON.parse(fs.readFileSync('playwright/.data/pmi-state.json', 'utf8')).pmNo;
const note = (t: string) => test.info().annotations.push({ type: '실제결과', description: t });

test('작업명 길이 제한', async ({ page }) => {
  test.setTimeout(600_000);
  let d = await openPm(page, MAIN);
  const original = await fieldValue(d, 'maPmMstrDetailDTO.description');
  const out: string[] = [`예방작업번호 ${MAIN}, 원래 작업명 "${original}" (${Buffer.byteLength(original)}바이트)`];
  // 원래 이름 뒤에 글자를 붙여 99·100·101·102 바이트로 맞춤 (영문 1바이트)
  for (const target of [99, 100, 101, 102]) {
    const pad = target - Buffer.byteLength(original + ' ');
    if (pad < 1) continue;
    const name = `${original} ${'A'.repeat(pad)}`;
    d = await openPm(page, MAIN);
    await put(d.locator('[id="maPmMstrDetailDTO.description"]'), name);
    const msg = await saveForm(page, d);
    await openPm(page, MAIN);
    const now = await fieldValue(await waitFrame(page, F_DETAIL), 'maPmMstrDetailDTO.description');
    out.push(`${Buffer.byteLength(name)}바이트(${name.length}자) 저장 → 안내 "${msg || '없음'}", 다시 열었을 때 ${now === name ? '저장됨' : '저장 안 됨'}`);
  }
  d = await openPm(page, MAIN);
  if ((await fieldValue(d, 'maPmMstrDetailDTO.description')) !== original) {
    await put(d.locator('[id="maPmMstrDetailDTO.description"]'), original);
    await saveForm(page, d);
  }
  note(out.join('\n'));
  console.log(out.join('\n'));
});
