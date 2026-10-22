import { Page, Frame } from '@playwright/test';

// 화면 정의: 메뉴마다 "어디를 열고, Setting 대상이 무엇인지"만 적습니다.
// 공통 테스트(tests/common/*.spec.ts)가 이 정의를 읽어 메뉴별 케이스를 만듭니다.

/** Field 설정 대상 (검색 영역 또는 상세 화면의 첫 번째 Setting) */
export interface FieldTarget {
  tc: string;                                // 결과 엑셀 테스트ID (예: AD230_TC_026)
  title: string;                             // 케이스 이름 앞부분 (예: 검색 Field 설정)
  open: (page: Page) => Promise<Frame>;      // Setting 버튼이 있는 화면 프레임을 엽니다
  name?: string;                             // 숨기기·정렬값을 바꿔 볼 필드 (화면표시명)
  id?: string;                               // 그 필드의 필드ID (설정 행 확인용)
  anchor?: string;                           // 정렬값을 바꿔 이 필드 바로 뒤로 옮김
  reset?: boolean;                           // [초기화] 확인
  editable?: boolean;                        // Edit 모드에서 수정 가능한 칸 확인
  compare?: boolean;                         // 설정 Display 여부와 화면 라벨 비교
  timeout?: number;
}

/** 목록 Setting 대상 (칼럼 설정 + 리스트 길이) */
export interface ListTarget {
  tc: string;
  title: string;
  open: (page: Page) => Promise<Frame>;      // 목록 그리드가 있는 프레임 (검색까지 끝난 상태)
  single?: boolean;                          // Setting 버튼이 하나뿐인 목록 (하위 목록)
  col: string;                               // 숨기기·너비를 바꿔 볼 칼럼명
  id?: string;                               // 칼럼ID
  anchor?: string;                           // 정렬값을 바꿔 이 칼럼 바로 뒤로 옮김
  width?: boolean;                           // 칼럼 너비 변경 확인
  listLength?: boolean;                      // 리스트 길이 (-/+, 숫자, [초기화]) 확인
  reset?: boolean;                           // [초기화] 확인
  editable?: boolean;                        // Edit 모드 수정 가능 칸, Background Color 확인
  timeout?: number;
}

/** Tab 설정 대상 (검색 Setting 팝업의 Tab 설정 탭) */
export interface TabTarget {
  tc: string;
  title: string;
  open: (page: Page) => Promise<Frame>;      // Tab 설정을 여는 Setting 버튼이 있는 화면 프레임
  key: string;                               // 탭페이지ID
  name: string;                              // 탭 이름
  shown: (page: Page) => Promise<boolean>;   // 화면에서 그 탭(상세)이 보이는지
  timeout?: number;
}

/** 화면 상단 공통 기능(즐겨찾기·업무그룹·Tab설정·편집모드) 대상 */
export interface HeaderTarget {
  menuId: string;                            // 메뉴 번호 (즐겨찾기 메뉴 id 는 F+메뉴번호)
  open: (page: Page) => Promise<Frame>;      // 메뉴를 열고 검색 영역 프레임을 돌려줌
  pageTab: string;                           // open 으로 연 위쪽 탭 이름 (업무그룹에 이 탭이 들어감)
  deep?: boolean;                            // 동작까지 깊게 확인할 대표 메뉴 (나머지는 아이콘·탭 목록만)
  field?: { name: string; before: string };  // 편집모드로 옮겨 볼 검색 필드 (before 앞으로)
  tab?: { name: string; before: string };    // 편집모드로 옮겨 볼 위쪽 탭
  detail?: { open: (page: Page) => Promise<Frame>; name: string; before: string }; // 편집모드로 옮겨 볼 상세 필드
}

export interface Screen {
  code: string;                              // 메뉴 코드 (AD230)
  name: string;                              // 메뉴 이름
  menu: string[];                            // 메뉴 경로 id
  fields: FieldTarget[];
  lists: ListTarget[];
  tabs: TabTarget[];
  header?: HeaderTarget;
}
