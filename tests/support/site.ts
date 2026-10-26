import fs from 'fs';
import path from 'path';

// QA 사이트별 값 (oracle = 기본 .env, mssql = $env:QA_SITE="mssql")
// 사이트마다 DB 가 달라 테스트 데이터 번호가 다르므로, 기본 사이트 밖에서는 playwright/.data/<사이트>/site-data.json 의 값을 씀
// (site-data.json 은 tests/ad230/setup/site-pm.spec.ts 가 [sychoi] 정기점검주기를 만들고 기록)

export const SITE = process.env.QA_SITE || '';
/** 상태·결과 파일을 두는 폴더 (기본 사이트는 playwright/.data, 그 밖은 playwright/.data/<사이트>) */
export const DATA_DIR = SITE ? path.join('playwright', '.data', SITE) : path.join('playwright', '.data');
export const SITE_DATA = path.join(DATA_DIR, 'site-data.json');

type SiteData = { pmNo?: string; eqNo?: string; name?: string; workDate?: string };
export const siteData: SiteData = SITE && fs.existsSync(SITE_DATA) ? JSON.parse(fs.readFileSync(SITE_DATA, 'utf8')) : {};
export function saveSiteData(v: SiteData) {
  Object.assign(siteData, v);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SITE_DATA, JSON.stringify(siteData, null, 1));
}

/** [sychoi] 정기점검주기 번호와 그 설비 (기본 사이트 oracle: 8007 / 100302AG13) */
export const PM_NO = SITE ? siteData.pmNo ?? '' : '8007';
export const EQ_NO = SITE ? siteData.eqNo ?? '' : '100302AG13';
