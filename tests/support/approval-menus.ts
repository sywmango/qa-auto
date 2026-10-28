// 결재요청(AZ303)을 확인할 메뉴 27개 (결재유형 APPR_TYPE 현황 2026-10-23 기준: 사용 중 17 + 이번에 살린 10)
// path = 화면 왼쪽 메뉴 이름 그대로 (사이트마다 메뉴 번호가 달라 이름으로 엶)
export type ApprovalMenu = { code: string; name: string; path: string[]; ready?: boolean; note?: string };

export const approvalMenus: ApprovalMenu[] = [
  { code: 'WORKORDER', name: '작업결과', path: ['작업관리', '수리작업', '수리작업실행'] },
  { code: 'WORKFMEA', name: '고장영향성평가', path: ['작업관리', '수리작업', '중요고장발생보고'] },
  { code: 'REQWORK', name: '작업요청', path: ['요청관리', '수리요청'] },
  { code: 'PTBUYREQ', name: '구매요청', path: ['부품관리', '부품구매신청'] },
  { code: 'PTSTKTAKE', name: '부품실사', path: ['부품관리', '부품재고실사'] },
  { code: 'WOPLAN', name: '작업계획서', path: ['작업관리', '정기수리작업', '정기수리계획'] },
  { code: 'PMINSDSCHED', name: '일상점검계획승인', path: ['작업관리', '일상점검작업', '일상점검계획승인'] },
  { code: 'WRKDAYRPT', name: '일일업무일지', path: ['일일업무', '일일업무일지'] },
  { code: 'PTREPAIR', name: '부품수리', path: ['부품관리', '부품외주수리'] },
  { code: 'EQUIPREV', name: '설비제개정', path: ['설비자산', '설비'], note: '제개정 설정(TACONFIG) Y 일 때만 결재 버튼' },
  { code: 'EQTLREV', name: '계측기제개정', path: ['설비자산', '계측기'], note: '제개정 설정(TACONFIG) Y 일 때만 결재 버튼' },
  { code: 'PMIGRPRSLT', name: '점검Group', path: ['작업관리', '점검Group', '점검Group실행'] },
  { code: 'PMINSREV', name: '점검주기제개정 결재', path: ['작업관리', '정기점검작업', '정기점검주기'], note: '제개정 설정(TACONFIG) Y 일 때만 결재 버튼' },
  { code: 'OHPLAN', name: '공사작업계획', path: ['작업관리', '공사작업', '공사계획'] },
  { code: 'LOGSHEET', name: '로그시트등록', path: ['작업관리', '로그시트', '로그시트등록'] },
  { code: 'WOAPPRLIST', name: '수리작업결재', path: ['작업관리', '수리작업', '수리작업일괄승인'] },
  { code: 'PTRLRESULT', name: '순회점검실행', path: ['작업관리', '순회점검작업', '순회점검실행'] },
  // 이번에 살린 유형 (dev·QA 에서만 메뉴·버튼·권한을 열어 둠)
  { code: 'WODAY', name: '일일작업승인', path: ['일일업무', '일일작업승인'], ready: true },
  { code: 'INVTLIST', name: '투자목록', path: ['설비도입', '도입목록'], ready: true, note: '진행(P) 상태에서 승인요청' },
  { code: 'PMINSSCHED', name: '예방점검계획승인', path: ['작업관리', '정기점검작업', '정기점검계획승인'], ready: true },
  { code: 'WOPLANAPPR', name: '작업계획승인', path: ['작업관리', '정기수리작업', '정기수리계획승인'], ready: true },
  { code: 'PMINSRSLT', name: '점검실시 결재', path: ['작업관리', '정기점검작업', '정기점검실행'], ready: true },
  { code: 'MOCREQ', name: '변경발의요청', path: ['변경관리', '변경요청'], ready: true },
  { code: 'MOCREC', name: '변경발의', path: ['변경관리', '변경접수'], ready: true },
  { code: 'MOCCMTEE', name: '변경위원회', path: ['변경관리', '변경위원회'], ready: true },
  { code: 'MOCWORK', name: '변경작업', path: ['변경관리', '변경작업'], ready: true },
  { code: 'PMIER', name: '특별점검', path: ['작업관리', '특별점검', '특별점검완료승인'], ready: true },
  // 제개정은 제정([생성] → Revision 제정)과 개정(기존 상세 [개정])을 따로 확인 (2026-10-27 사용자 요청). 위 3개 = 제정, 아래 3개 = 개정
  { code: 'EQUIPREV_REV', name: '설비제개정', path: ['설비자산', '설비'], note: '개정' },
  { code: 'EQTLREV_REV', name: '계측기제개정', path: ['설비자산', '계측기'], note: '개정' },
  { code: 'PMINSREV_REV', name: '점검주기제개정 결재', path: ['작업관리', '정기점검작업', '정기점검주기'], note: '개정' },
];
