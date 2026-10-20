import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// .env 파일에서 QA 주소와 계정 정보를 읽어옵니다.
dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  testDir: './tests',
  // 정기점검주기(AD230) 테스트는 주기를 만들고·완료·삭제하므로 평소에는 빼고, RUN_AD230=1 일 때만 실행
  // (run-ad230.ps1 이 자동으로 켬)
  testIgnore: process.env.RUN_AD230 ? [] : ['**/ad230/**'],

  // 같은 QA 계정을 쓰므로 테스트끼리 서로 꼬이지 않게 하나씩 순서대로 실행합니다.
  fullyParallel: false,
  workers: 1,
  retries: 0,

  // 테스트 하나당 최대 60초
  timeout: 60_000,

  reporter: 'html',

  use: {
    baseURL: process.env.BASE_URL,

    // 클릭·입력이 덮개 등에 막혀 끝없이 기다리지 않도록 동작 하나당 최대 15초
    actionTimeout: 15_000,
    viewport: { width: 1600, height: 900 },

    // 실패했을 때만 스크린샷, 영상, 트레이스를 남깁니다.
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    // 1) 먼저 로그인해서 세션을 저장
    { name: 'setup', testMatch: /.*\.setup\.ts/ },

    // 2) 저장한 세션으로 실제 테스트 실행 (Chrome만 사용)
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1600, height: 900 },
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
});
