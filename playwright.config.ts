import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests for SignSpeak.
 *
 * These exist because two shipping-blocking bugs — a camera preview that never received the
 * stream, and a header pill permanently stuck on "Camera off" — passed 388 unit tests and
 * were only caught by driving the real app in a real browser. Anything that depends on
 * React mounting order, a real `<video>` element, or MediaPipe's async loading needs a
 * browser, so it belongs here rather than in `tests/`.
 *
 * They run against the **production export** in `out/`, served by `scripts/serve-static.mjs`,
 * not against `next dev`. The export is what a host serves; a dev server is a different
 * program and would hide export-specific breakage.
 *
 * The camera is Chrome's synthetic device (`--use-fake-device-for-media-stream`), so the
 * input path can be exercised on a machine with no camera. It renders a test pattern rather
 * than a hand, which is why the tests assert on the pipeline running (frames, FPS, the
 * "not recognised" state) rather than on a predicted sign — that would need a trained model
 * and real recordings, neither of which exists yet.
 */

const PORT = Number(process.env.E2E_PORT ?? 4322);

/**
 * Use an already-installed Chrome instead of Playwright's bundled browser.
 *
 * `PLAYWRIGHT_CHROME_PATH` exists for environments that cannot download a browser (this one
 * included). Leave it unset and Playwright uses its own, which is the normal setup; run
 * `npx playwright install chromium` once.
 */
import { existsSync } from 'node:fs';

const SYSTEM_CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const executablePath = process.env.PLAYWRIGHT_CHROME_PATH || (existsSync(SYSTEM_CHROME) ? SYSTEM_CHROME : undefined);

export default defineConfig({
  testDir: './e2e',
  // The camera path waits on MediaPipe loading ~24 MB of WASM and model data.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // A shared static server and a shared Chrome profile make parallel runs flaky here.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ['list'],
        ['html', { open: 'never' }],
        // Consumed by GitLab so a failure shows up in the merge request itself.
        ['junit', { outputFile: 'test-results/junit.xml' }],
      ]
    : [['list']],

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'off',
    screenshot: 'only-on-failure',
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: [
        // Auto-accept the permission prompts, and feed a synthetic camera and microphone so
        // the input path can be driven without hardware.
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: `node scripts/serve-static.mjs ${PORT} out`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
  },
});
