import { test, expect } from '@playwright/test';
import { dateAfter } from './support/form';
import { openPm, rowsOf, fmt, deleteRow, addEquip, addStd, addPoint, addDoc, POINTS } from './support/pmi';

// 테스트로 만든 정기점검주기(8001, 8004)의 하위 목록 확인
// 목록마다: 기본 항목이 없으면 하나 추가 → 추가 항목 하나 더 추가(행 +1 확인) → 그 추가 항목만 삭제(행 -1 확인)
// 규칙: 테스트가 추가한 항목만 삭제, 하위 목록은 비지 않게 1건 이상 남김, 예방작업 자체는 삭제하지 않음

const PM: Record<string, { equip: string; extraEquip: string; equipName: string }> = {
  '8001': { equip: '100302AG13', extraEquip: '100305AG17', equipName: 'High Speed Mixer(세종파마텍)' },
  '8004': { equip: '100305AG17', extraEquip: '100302AG13', equipName: 'High Speed Mixer(금성산기)' },
};

function note(t: string) { test.info().annotations.push({ type: '실제결과', description: t }); }

// ---- 테스트 ----

test.describe('정기점검주기 하위 목록', () => {
  test.setTimeout(300_000);

  for (const [pmNo, pm] of Object.entries(PM)) {
    test(`${pmNo} 설비 추가·삭제`, async ({ page }) => {
      const out: string[] = [];
      await openPm(page, pmNo);
      let rows = await rowsOf(page, 'eq', '최초작업예정일');
      if (!rows.some((r) => r['설비번호'] === pm.equip)) {
        const a = await addEquip(page, pm.equip, dateAfter(14), `${pm.equipName} 정기점검 대상 설비`);
        out.push(`기본 설비 ${pm.equip} 추가 ("${a.msg || '없음'}")`);
        rows = await rowsOf(page, 'eq', '최초작업예정일');
      }
      const before = rows.length;
      const a = await addEquip(page, pm.extraEquip, dateAfter(21), '동일 라인 설비 추가 점검 대상');
      const mid = await rowsOf(page, 'eq', '최초작업예정일');
      const row = mid.find((r) => r['설비번호'] === pm.extraEquip);
      out.push(`추가: ${pm.extraEquip} 저장("${a.msg || '없음'}") → ${before} → ${mid.length}행, 목록 최초작업예정일=${row?.['최초작업예정일']} / 입력 ${fmt(a.entered)}`);
      const dm = await deleteRow(page, 'eq', '최초작업예정일', '설비번호', pm.extraEquip);
      const after = await rowsOf(page, 'eq', '최초작업예정일');
      out.push(`삭제: ${pm.extraEquip} ("${dm || '없음'}") → ${mid.length} → ${after.length}행, 남은 설비 ${after.map((r) => r['설비번호']).join(', ')}`);
      note(out.join('\n'));
      expect.soft(mid.length, '추가 후 행 +1').toBe(before + 1);
      expect.soft(row?.['최초작업예정일']).toBe(dateAfter(21));
      expect(after.some((r) => r['설비번호'] === pm.extraEquip), '추가한 설비 삭제됨').toBe(false);
      expect(after.some((r) => r['설비번호'] === pm.equip), '기본 설비 남음').toBe(true);
    });

    test(`${pmNo} 표준작업 추가·삭제`, async ({ page }) => {
      const out: string[] = [];
      await openPm(page, pmNo);
      let rows = await rowsOf(page, 'std', '표준작업명');
      if (!rows.length) {
        const a = await addStd(page, [], pm.equipName);
        out.push(`기본 표준작업 추가: ${a.picked ? `${a.picked['표준작업번호']} ${a.picked['표준작업명']} (${a.picked['설비종류']})` : '-'} ("${a.msg || '없음'}")`);
        rows = await rowsOf(page, 'std', '표준작업명');
      }
      const before = rows.length;
      const a = await addStd(page, rows.map((r) => r['표준작업번호']), pm.equipName);
      const mid = await rowsOf(page, 'std', '표준작업명');
      out.push(`추가: ${a.picked ? `${a.picked['표준작업번호']} ${a.picked['표준작업명']}` : '-'} ("${a.msg || '없음'}") → ${before} → ${mid.length}행`);
      let after = mid;
      if (a.picked && mid.length > before) {
        const dm = await deleteRow(page, 'std', '표준작업명', '표준작업번호', a.picked['표준작업번호']);
        after = await rowsOf(page, 'std', '표준작업명');
        out.push(`삭제: ${a.picked['표준작업번호']} ("${dm || '없음'}") → ${mid.length} → ${after.length}행`);
      }
      note(out.join('\n'));
      expect.soft(mid.length, '추가 후 행 +1').toBe(before + 1);
      expect.soft(after.length, '삭제 후 행 -1').toBe(before);
      expect(after.length, '표준작업 1건 이상 남음').toBeGreaterThan(0);
    });

    test(`${pmNo} 점검항목 추가·삭제`, async ({ page }) => {
      const out: string[] = [];
      await openPm(page, pmNo);
      let rows = await rowsOf(page, 'pt', '점검항목');
      const unused = POINTS.filter((p) => !rows.some((r) => r['점검항목'] === p[0]));
      if (!rows.length) {
        const p = unused.shift()!;
        const a = await addPoint(page, p, 1);
        out.push(`기본 점검항목 "${p[0]}" 추가 ("${a.msg || '없음'}") / 입력 ${fmt(a.entered)}`);
        rows = await rowsOf(page, 'pt', '점검항목');
      }
      const before = rows.length;
      const p = unused.shift()!;
      const a = await addPoint(page, p, before + 1);
      const mid = await rowsOf(page, 'pt', '점검항목');
      out.push(`추가: "${p[0]}" ("${a.msg || '없음'}") → ${before} → ${mid.length}행 / 입력 ${fmt(a.entered)}`);
      const dm = await deleteRow(page, 'pt', '점검항목', '점검항목', p[0]);
      const after = await rowsOf(page, 'pt', '점검항목');
      out.push(`삭제: "${p[0]}" ("${dm || '없음'}") → ${mid.length} → ${after.length}행, 남은 항목 ${after.map((r) => r['점검항목']).join(', ')}`);
      note(out.join('\n'));
      expect.soft(mid.length, '추가 후 행 +1').toBe(before + 1);
      expect(after.some((r) => r['점검항목'] === p[0]), '추가한 항목 삭제됨').toBe(false);
      expect(after.length, '점검항목 1건 이상 남음').toBeGreaterThan(0);
    });

    test(`${pmNo} 첨부문서 추가·삭제`, async ({ page }) => {
      const out: string[] = [];
      const base = `[sychoi] ${pm.equipName} 정기점검 기준서`;
      const extra = `${base} 개정본`;
      await openPm(page, pmNo);
      let rows = await rowsOf(page, 'doc', '제목');
      if (!rows.length) {
        const a = await addDoc(page, base, 'HighSpeedMixer_정기점검기준서.txt');
        out.push(`기본 문서 "${base}" 추가 ("${a.msg || '없음'}", 파일 ${a.hasFile ? '첨부' : '칸 없음'})`);
        rows = await rowsOf(page, 'doc', '제목');
      }
      const before = rows.length;
      const a = await addDoc(page, extra, 'HighSpeedMixer_정기점검기준서_개정.txt');
      const mid = await rowsOf(page, 'doc', '제목');
      out.push(`추가: "${extra}" ("${a.msg || '없음'}", 파일 ${a.hasFile ? '첨부' : '칸 없음'}) → ${before} → ${mid.length}행 / 입력 ${fmt(a.entered)}`);
      const dm = await deleteRow(page, 'doc', '제목', '제목', extra);
      const after = await rowsOf(page, 'doc', '제목');
      out.push(`삭제: "${extra}" ("${dm || '없음'}") → ${mid.length} → ${after.length}행`);
      note(out.join('\n'));
      expect.soft(mid.length, '추가 후 행 +1').toBe(before + 1);
      expect(after.some((r) => r['제목'] === extra), '추가한 문서 삭제됨').toBe(false);
      expect(after.length, '첨부문서 1건 이상 남음').toBeGreaterThan(0);
    });
  }
});

