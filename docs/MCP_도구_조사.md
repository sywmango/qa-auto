# Playwright 외 MCP 도구 조사

정리: 2026-10-23 (Claude, 웹 조사. 설치·실행은 아직 안 해 봄)

MCP = Claude가 바깥 도구(브라우저, DB, 파일 등)를 직접 쓰게 해 주는 연결 장치. 지금은 Playwright(브라우저 조작)만 쓰고 있다.

## 1. 추천 순서

| 순위 | 도구 | 우리 작업에 도움되는 점 | 필요한 것 | 주의 |
| --- | --- | --- | --- | --- |
| 1 | **Chrome DevTools MCP** (Google 공식) | 화면 열 때 콘솔 에러·실패한 네트워크 요청·느린 화면을 Claude가 직접 확인. 메뉴 순회 스모크(콘솔 에러 확인), 성능 확인에 바로 씀 | `npx chrome-devtools-mcp` 설정 한 줄. Chrome 필요 | 기본으로 사용 통계·성능 데이터를 Google 로 보냄 → `--no-performance-crux` 와 사용 통계 끄는 옵션(설치 때 README 확인)으로 끔 |
| 2 | **DB 조회 MCP** (읽기 전용) | ① Setting 메타 테이블을 읽어 화면 정의 자동 생성 ② 저장 후 DB 값 확인(테이블.컬럼) ③ 기대 날짜 계산용 달력·계획 데이터 조회. 프로젝트 지침의 "메타 DB 조회" 계획과 같음 | DREAM DB 종류(Oracle / MSSQL 등) 확인, **SELECT 권한만 있는 QA DB 계정** | 운영 DB 금지, QA DB 만. 계정 발급은 DBA·본부장 결정 필요 |
| 3 | **Playwright Test Agents** (Playwright 기본 기능, v1.56 부터) | Planner: 화면 탐색 → 테스트 계획 md / Generator: 계획 → 코드 / **Healer: 화면이 바뀌어 깨진 테스트를 자동 수정**. 배포마다 셀렉터가 바뀔 때 유용 | 우리 버전 1.64 라 추가 설치 없음. `npx playwright init-agents` | 새 MCP 는 아님. Healer 가 고친 내용은 사람이 확인 후 반영 |
| 4 | Excel MCP | UT 양식 엑셀을 Claude가 직접 열어 확인·수정 | Python 또는 Node | 지금 `scripts/write-results.py` 로 이미 됨 → 급하지 않음 |
| 5 | 모바일 (Appium MCP, mobile-mcp) | DREAM 모바일 앱이 있다면 같은 방식으로 앱 테스트 | Android 에뮬레이터/기기 | 웹 QA 범위 밖. 모바일 테스트 요청이 있을 때 |

## 2. 지금은 필요 없는 것

| 도구 | 이유 |
| --- | --- |
| GitHub MCP | 이 PC 의 `gh` 로 PR·머지 이미 됨 |
| 테스트 관리 도구 MCP (QA Sphere, TestRail 등) | 회사가 엑셀 UT 양식을 씀. 그런 도구를 도입하면 다시 검토 |
| Selenium MCP | 이미 Playwright 사용 |
| BrowserStack 등 클라우드 브라우저 | QA 서버가 회사 IP 만 허용 → 클라우드에서 접속 불가, 유료 |

## 3. 정해야 할 것 (본부장님 확인)

1. Chrome DevTools MCP 를 먼저 붙여 볼지 (위험 낮음, 바로 가능)
2. QA DB 읽기 전용 계정을 받을 수 있는지, DB 종류가 무엇인지 (가장 효과 큼)
3. 회사 이슈 관리 도구(Jira, Redmine 등)가 있으면 오류를 바로 등록하는 MCP 도 가능

## 출처

- Chrome DevTools MCP: https://developer.chrome.com/docs/devtools , https://www.debugbear.com/blog/chrome-devtools-mcp-performance-debugging
- DB MCP: https://glama.ai/mcp/servers/vj4pni74ex (Oracle), https://mcpservers.org/servers/JexinSam/mssql_mcp_server (MSSQL)
- Playwright Test Agents: https://bug0.com/blog/playwright-test-agents , https://testdino.com/blog/playwright-ai-ecosystem-2026
- Excel MCP: https://www.pypi.org/project/excel-mcp-server
- QA MCP 전체 정리: https://quashbugs.com/blog/best-mcp-servers-for-qa-testing
