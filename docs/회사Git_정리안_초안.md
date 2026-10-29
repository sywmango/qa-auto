# 회사 Git 정리안 (초안, 아직 반영 안 함)

작성: 2026-10-28 · 기준: 팀장님 문서 "AI 기반 QA 프로세스"

## 1. 한눈에

팀장님 문서의 핵심은 **프로젝트 Git 안 `claude/qa` 폴더에 md(기준 문서)를 두고, `/qa` 명령어로 3명이 같은 방식으로 QA** 하는 것입니다.
지금 `qa-auto` 저장소에 있는 것 중 **md 규칙·메뉴별 사양·UT 최종본**은 그대로 옮기고, **Playwright 테스트 코드**는 어떻게 할지 정해야 합니다 (아래 4번).

## 2. 제안 폴더 구조 (회사 프로젝트 Git, Dream4.1)

```
<Dream4.1 프로젝트 Git>/
├─ .claude/
│  └─ commands/
│     └─ qa.md              ← /qa 명령어 정의 (이 위치여야 Claude Code 가 /qa 로 인식)
└─ claude/qa/
   ├─ README.md             ← 팀원 3명 시작 안내 (설치, .env, 실행, 결과 올리기)
   ├─ common.md             ← 공통 확인 사항 (모든 프로젝트 공통)
   ├─ dream41.md            ← Dream4.1 특이 사항
   ├─ menus/
   │  ├─ AD210.md           ← 메뉴별 "확인된 사양"·판정기준·주의점
   │  ├─ AD230.md
   │  ├─ AP591.md
   │  └─ AZ303.md
   ├─ templates/
   │  ├─ menu.md            ← 새 메뉴 md 템플릿
   │  └─ UT_양식.xlsx       ← 회사 UT 양식 원본
   └─ results/
      └─ <화면ID>/          ← UT 엑셀·결과보고서 최종본만 (이전 버전은 Git 이력으로)
```

## 3. 지금 파일 → 새 위치

| 지금 (qa-auto) | 새 위치 | 비고 |
| --- | --- | --- |
| `CLAUDE.md` 3·4·5장 (테스트 데이터, 판정, 산출물, 꼭 물어볼 것) | `common.md` | `[sychoi]` → `[내ID]` 로 일반화 |
| `docs/prompts/00_프롬프트_규격.md`, `공통테스트.md` | `common.md` | Setting·상단 공통·메뉴 점검 |
| `CLAUDE.md` 2장 + 메모(사이트 2곳, 화면 동작, 버튼 class) | `dream41.md` | oracle 1220 / mssql 1290, 키 입력해야 저장 등 |
| `docs/<ID>/<ID>_prompt.md` + `_handoff.md` + `판정기준.json` | `menus/<ID>.md` | 하나로 합침 |
| `docs/prompts/메뉴테스트_템플릿.md` | `templates/menu.md` | |
| `docs/<ID>/*_UT_*_v<n>.xlsx`, `report/*.pdf` (최신만) | `results/<ID>/` | 최종본 4개 메뉴 |
| `tests/`, `scripts/`, `run-*.ps1` | 4번에서 결정 | |
| `.env`, 캡처 원본, `이전버전/` | 올리지 않음 | 계정·용량 |

## 4. 정해야 할 것

**① Playwright 테스트 코드를 어떻게 할지**
팀장님 방식은 "Playwright **MCP** 로 Claude 가 화면을 직접 보며 QA" 입니다. 제가 지금까지 만든 건 "Playwright **테스트 코드**를 PC 에서 실행" 방식이라 서로 다릅니다.
- **A (추천)**: 코드도 `claude/qa/playwright/` 에 같이 올림. 한 번 만든 메뉴는 코드로 다시 돌리고(회귀), 새 메뉴는 MCP 로 탐색 → 필요하면 코드화.
- B: 코드는 지금 개인 저장소에 두고, 회사 Git 에는 md·결과만.

**② `/qa` 명령어 옵션**
팀장님 표의 6개(메뉴, `--fd`, PR 번호, 브랜치, `--quick`, `--report`)에 지금 규칙상 필요한 1개 추가 제안:
- `--site oracle|mssql|both` (기본 both, 지금 기본값 "두 사이트 모두")

## 5. 미리 알려드릴 충돌 2가지

1. **"같은 계정으로 스레드 여러 개 병렬 QA"** — 실제로 해 보니 같은 계정으로 동시에 로그인하면 **세션이 끊깁니다** (AZ303 때 확인). 병렬로 하려면 스레드마다 다른 계정이 필요하다고 팀장님께 말씀드리는 게 좋겠습니다.
2. **테스트 데이터 표시** — 3명이 같이 쓰면 `[sychoi]` 처럼 이름표를 사람마다 달리 해야 서로 데이터를 지우지 않습니다. `common.md` 에 "`[본인ID]` 데이터만 지운다"로 적겠습니다.

## 6. 진행 순서 (확정되면)

1. 회사 Git 주소·브랜치 규칙 받기 (권한 할당 후)
2. `common.md`, `dream41.md`, `menus/*.md` 작성 → 보여드림
3. `.claude/commands/qa.md` 작성 → 한 메뉴로 `/qa AD230` 시험
4. UT 최종본 4개 메뉴 올림
5. `README.md` (팀원용) 작성
