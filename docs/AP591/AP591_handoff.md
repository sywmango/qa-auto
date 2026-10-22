# 정기점검실행(AP591) 단위테스트 — 다시 돌리는 법

마지막 정리: 2026-10-21. 설계서는 파일번호 AC3A120 으로 되어 있지만 메뉴코드는 AP591 로 맞춤 (사용자 요청).
원본 지침(설계서 pptx, 테이블 정의 xlsx, 예전 UT 양식)은 `docs/AP591/원본/`. 케이스는 `docs/AP591/cases.json` → `scripts/build-ut-sheet.py` 로 공통 양식(`docs/UT_공통테스트케이스_AD230기준.xlsx`)에 넣어 `AP591_UT_정기점검실행_양식.xlsx` 를 만듦 (기본 44 + 엣지 8).
결과: `docs/AP591/AP591_UT_정기점검실행_v1.xlsx`, `docs/AP591/report/AP591_정기점검실행_테스트결과보고서_v1.pdf` (52건: 정상 49, 오류 1, 개선 2).

## 1. 한 번에 돌리기

D:\qa-auto 에서 PowerShell:

```
.\run-ap591.ps1          # 전체: 조회 → Setting → 점검작업 → 캡처 → 엑셀·PDF
.\run-ap591.ps1 view     # 조회만 (데이터 안 바뀜, 약 20분)
.\run-ap591.ps1 report   # 이미 돌린 결과로 엑셀·PDF 만 다시
```

- AP591 테스트는 `RUN_AP591=1` 일 때만 돈다. 로그인은 `playwright\.auth\user-ap591.json` (같은 계정 동시 실행 금지).
- 일부만 다시 돌릴 때 `-g "A|B"` 를 쓰려면 `npx` 대신 `node node_modules/@playwright/test/cli.js test …` (npx.cmd 가 `|` 를 잘라먹음).
- QA 서버 재배포 중에는 `/dream/index.do` 가 404 → 다시 뜬 뒤 실행.

## 2. 화면 구조 (자동화할 때 주의)

- 탭: 카렌다(월간) / 목록(조건). 카렌다 칸 숫자 T(작업대상 = span.p), P(작업미완료 = span.s), C(작업완료 = span.c). 숫자를 누르면 같은 프레임 아래 목록에 나옴.
- 목록 행 → 점검작업 상세 `workPmiDetail_workPmiList` (정기점검계획의 점검작업 상세와 같은 화면). 하위 탭(점검항목·표준작업·첨부문서)은 아코디언.
- 점검항목 행 → 점검값 상세 `workPmiPointValueDetail_workPmiPointList`. 점검결과 기본값 '정상', Lov GD 정상 / BD 이상.
- 상세보기는 새 창. 하단 상세 닫기는 `a.b_close`.
- 목록(조건) 일정조정 일자 기본값 = 오늘 - 7일, 끝은 비어 있음. 년월은 읽기전용(달력).
- Setting Edit 로 바꿀 수 있는 칸: Field 설정은 정렬값·Display, 목록 Setting 은 정렬값·너비·Display (정상, 사용자 확인). 화면표시명·정렬·조회순서는 읽기전용.
- 점검작업 확정에는 점검시작·종료 일자, 점검값이 모두 있어야 함 ("점검값을 모두 입력해주십시오.").

## 3. 테스트 데이터

- [sychoi] 주기 8007 / 설비 100302AG13 의 점검작업. 2026-12-18 (작업발행) 은 수정·점검값·Edit·첨부·Linked 에 씀.
- 오늘·어제 작업발행 건이 없으면 정기점검계획(AD210 부품)으로 일정추가 → 일정확정해서 만듦. 오늘 건은 확정(작업완료)되어 남음.
- 상태는 `playwright\.data\ap591-state.json`.

## 4. 판정 (2026-10-21)

| ID | 결과 | 내용 |
| --- | --- | --- |
| TC_024 | 오류 | 카렌다(월간) 검색 Setting 담당자·작업명 Display Y 인데 안 보임 |
| TC_027 | 개선 | 점검명 비우고 확정 → 안내 없음 |
| EC_005 | 개선 | 점검명 길이 초과 안내 없음 |

사양 확인: 년월 비울 수 없어 필수 안내 없음(TC_002), Setting Edit 범위(TC_025), 리스트 길이는 [초기화]로 안 돌아옴, 종료가 시작보다 앞이면 종료일자 지워짐(EC_004).
판정을 바꾸려면 `docs/AP591/report/판정기준.json` 을 고치고 `.\run-ap591.ps1 report`.

## 5. 파일

| 파일 | 내용 |
| --- | --- |
| `tests/ap591/exec-view.spec.ts` | 조회 (검색, 카렌다, 정렬, 상세, 표시형식, Excel, 점검항목·표준작업 탭) |
| `tests/common/setting.spec.ts` + `tests/screens/ap591.ts` | Setting (메뉴 공통 테스트: 검색·상세 Field, Tab, 목록, 점검항목, 점검값 상세) — 바꾼 값은 되돌림 |
| `tests/ap591/exec-work.spec.ts` | 점검작업 수정·점검값·Edit·첨부·Linked·확정 |
| `tests/ap591/evidence.spec.ts` | 오류·개선 캡처 |
| `tests/support/pmexec.ts`, `pmexec-data.ts` | AP591 화면 부품 |
| `tests-보관/ap591-tools/*` | 화면 구조 탐색용 (보관, 실행 안 함) |
