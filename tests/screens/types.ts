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

/** 화면 상단 공통 기능(즐겨찾기·업무그룹·Tab설정·편집모드) 대상 — 대표 메뉴에만 적음 */
export interface HeaderTarget {
  menuId: string;                            // 메뉴 번호 (즐겨찾기 메뉴 id 는 F+메뉴번호)
  open: (page: Page) => Promise<Frame>;      // 메뉴를 열고 검색 영역 프레임을 돌려줌
  pageTab: string;                           // open 으로 연 위쪽 탭 이름 (업무그룹에 이 탭이 들어감)
  wgPage: string;                            // 업무그룹설정 업무화면 Lov(메뉴 트리)에서 이 화면 이름
  deep?: boolean;                            // 동작을 확인할 대표 메뉴 (공통 코드라 한 메뉴만)
  field?: { name: string; before: string };  // 편집모드로 옮겨 볼 검색 필드 (before 앞으로)
  tab?: { name: string; before: string };    // 편집모드로 옮겨 볼 위쪽 탭
  detail?: { open: (page: Page) => Promise<Frame>; name: string; before: string }; // 편집모드로 옮겨 볼 상세 필드
}

/** 공통 화면 케이스 (검색·목록·상세). tests/common/screen.spec.ts 가 이 순서로 만듭니다. */
export type ViewCase =
  | 'defaults' | 'lovOrigin' | 'lovs' | 'searchOne' | 'searchCombo' | 'searchAll' | 'searchNone'
  | 'sort' | 'total' | 'rowDetail' | 'popupDetail' | 'excel' | 'listDetail' | 'listFormat' | 'readonly' | 'close' | 'deleteNone';

export type Row = Record<string, string>;

/** 검색 조건 하나: 목록 첫 행(pickRow)의 값으로 검색해 그 열이 맞는지 봅니다 */
export interface SearchCond {
  id: string;                                // 검색 칸 ID (DTO 뒤 부분, 예: pmNo)
  col: string;                               // 결과를 비교할 목록 열
  value: (row: Row) => string;               // 넣을 값
  lov?: string;                              // 돋보기(Lov)에서 고르기: Lov 안 검색 칸 이름 ('' 이면 첫 화면에서 고름)
  tree?: boolean;                            // 트리형 Lov (펼쳐서 고름)
  words?: boolean;                           // 띄어쓰기 단어마다 포함되면 일치 (작업명 등)
  preset?: boolean;                          // 기본값으로 이미 들어 있는 조건 (넣지 않고 결과만 비교)
}

/** 검색·목록·상세 공통 케이스 대상 */
export interface ViewTarget {
  ids: Partial<Record<ViewCase, string>>;    // 공통 케이스 → 이 메뉴의 테스트ID (없는 케이스는 만들지 않음)
  open: (page: Page) => Promise<Frame>;      // 메뉴를 열고 목록 프레임 (기본 검색 상태)
  search?: (page: Page, f: Frame) => Promise<void>; // 검색 버튼 (기본: b_search)
  dto: string;                               // 검색 칸 DTO (예: maPmMstrCommonDTO)
  key: string;                               // 목록 그리드를 찾을 열 이름
  rows?: (page: Page) => Promise<Frame>;     // 비교에 쓸 행이 있는 목록 (기본: open)
  pickRow?: (rows: Row[]) => Row;            // 비교에 쓸 행 (기본: 첫 행)
  /** 기본값: 비어 있어야 할 칸 / 값이 있어야 할 칸 (open 이 조건을 넣는 메뉴는 기본 화면을 여는 함수를 따로) */
  defaults: { empty: string[] | 'all'; values?: Record<string, string | RegExp>; open?: (page: Page) => Promise<Frame> }; // 'all' = values 밖의 보이는 검색 칸 모두
  lovOrigin?: { id: string; menu: string[]; frame: string; header: string }; // Lov 건수 = 원본 메뉴 건수
  lovs?: [string, string, ((page: Page) => Promise<Frame>)?][]; // [이름, 칸 ID, 다른 탭이면 여는 함수] Lov 가 열리고 데이터가 있는지 (칸 ID 에 점이 있으면 DTO 포함)
  conds: SearchCond[];                       // 조건 하나씩
  combos?: SearchCond[][];                   // 조합
  clearAll: string[];                        // 전체 검색할 때 비울 칸 (기본값이 들어 있는 칸)
  none: { id: string; value: string };       // 결과 없는 검색
  /** 같은 행으로 볼지 (예: 설비 조건은 그 주기의 다른 설비 행도 일치) */
  sameAs?: (rows: Row[], row: Row, cond: SearchCond, value: string) => boolean;
  sort: { col: string; numeric?: boolean };
  /** 행 클릭 상세 */
  detail?: {
    click: string;                           // 클릭할 열
    frame: string | RegExp;                  // 상세 프레임
    title: (row: Row) => RegExp;             // 상세 제목
    popupTitle?: (row: Row) => RegExp;       // 상세보기 새 창 제목
    dto: string;                             // 상세 칸 DTO
    pairs: [string, string][];               // [목록 열, 상세 칸 ID] 값 비교
    readonly: string[];                      // 읽기전용이어야 할 상세 칸 ID
  };
  format?: [string, RegExp, string][];       // [목록 열, 형식, 설명]
  deleteConfirm?: 'ok' | 'cancel';           // 체크 없이 삭제: 확인창이 뜨면 OK 후 안내를 볼지(ok), 안내만 보고 Cancel 할지(기본)
  /** 공통 케이스 뒤에 이 메뉴에만 있는 확인을 덧붙임 (같은 테스트ID 안에서) */
  extra?: Partial<Record<ViewCase, (page: Page) => Promise<void>>>;
  timeout?: number;
}

export interface Screen {
  code: string;                              // 메뉴 코드 (AD230)
  name: string;                              // 메뉴 이름
  menu: string[];                            // 메뉴 경로 id
  fields: FieldTarget[];
  lists: ListTarget[];
  tabs: TabTarget[];
  header?: HeaderTarget;
  view?: ViewTarget;
}
