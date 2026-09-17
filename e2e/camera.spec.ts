/**
 * Camera path — the tests that would have caught the two bugs unit tests could not.
 *
 * Both bugs lived in the gap between a hook and a component:
 *   1. the stream was attached before the `<video>` existed, so the preview stayed blank and
 *      the tracking loop saw zero frames;
 *   2. nothing published the camera status to the shared context, so the header pill said
 *      "Camera off" while the camera was streaming.
 *
 * Chrome's synthetic device supplies the frames, so these run on a machine with no camera.
 * It renders a test pattern rather than a hand, so the assertions are about the pipeline
 * running — element mounted, stream attached, frames decoded, loop iterating, and the honest
 * "not recognised" outcome — never about a predicted sign. Predicting a sign needs a trained
 * model and real recordings, and neither exists (see ml/data/README.md).
 */

import { expect, test } from '@playwright/test';

import { cameraPillText, dismissFirstRunIntro, videos, waitForLiveFrames } from './helpers';

test.describe('the camera stays off until the user asks for it', () => {
  test('no video element exists before the camera is started (NFR-01)', async ({ page }) => {
    await page.goto('/talk/');
    await dismissFirstRunIntro(page);

    // The strongest form of the promise: there is nothing to have a stream, not merely a
    // paused one.
    await expect(videos(page)).toHaveCount(0);
    expect(await cameraPillText(page)).toBe('Camera off');
  });

  test('the microphone is off too, and no audio is requested', async ({ page }) => {
    const requestedKinds: string[] = [];
    await page.exposeFunction('__recordKind', (kind: string) => {
      requestedKinds.push(kind);
    });
    await page.addInitScript(() => {
      const original = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
      if (!original) return;
      navigator.mediaDevices.getUserMedia = (constraints?: MediaStreamConstraints) => {
        if (constraints?.audio) void (window as never as { __recordKind: (k: string) => void }).__recordKind('audio');
        if (constraints?.video) void (window as never as { __recordKind: (k: string) => void }).__recordKind('video');
        return original(constraints);
      };
    });

    await page.goto('/talk/');
    await dismissFirstRunIntro(page);
    await page.getByRole('button', { name: /start camera/i }).click();
    await waitForLiveFrames(page);

    // Starting the camera must never open the microphone.
    expect(requestedKinds).toContain('video');
    expect(requestedKinds).not.toContain('audio');
  });
});

test.describe('starting the camera wires the preview and the status pill', () => {
  test('the stream reaches the video element and frames decode', async ({ page }) => {
    await page.goto('/talk/');
    await dismissFirstRunIntro(page);

    await page.getByRole('button', { name: /start camera/i }).click();

    // Regression guard for the blank-preview bug. Before the fix this timed out with
    // srcObject null and readyState 0, because the stream was attached while the element
    // did not exist yet.
    await waitForLiveFrames(page);

    const state = await page.evaluate(() => {
      const video = document.querySelector('video') as HTMLVideoElement | null;
      return {
        count: document.querySelectorAll('video').length,
        hasStream: Boolean(video?.srcObject),
        readyState: video?.readyState ?? -1,
        videoWidth: video?.videoWidth ?? 0,
      };
    });

    expect(state.count).toBe(1);
    expect(state.hasStream).toBe(true);
    expect(state.readyState).toBeGreaterThanOrEqual(2);
    expect(state.videoWidth).toBeGreaterThan(0);
  });

  test('the header pill stops claiming the camera is off', async ({ page }) => {
    await page.goto('/talk/');
    await dismissFirstRunIntro(page);

    expect(await cameraPillText(page)).toBe('Camera off');
    await page.getByRole('button', { name: /start camera/i }).click();
    await waitForLiveFrames(page);

    // Regression guard for the stuck-pill bug: `setCamera` was never called, so this stayed
    // "Camera off" forever.
    await expect
      .poll(async () => cameraPillText(page), { timeout: 20_000 })
      .toBe('Camera on');
  });

  test('the tracking loop runs and reports an honest "not recognised"', async ({ page }) => {
    await page.goto('/talk/');
    await dismissFirstRunIntro(page);
    await page.getByRole('button', { name: /start camera/i }).click();
    await waitForLiveFrames(page);

    // The loop must actually iterate. "0 FPS" is what a stream attached to nothing produced.
    await expect
      .poll(
        async () => {
          const text = await page.locator('body').innerText();
          const match = text.match(/(\d+)\s*FPS/);
          return match ? Number(match[1]) : 0;
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);

    // The synthetic device shows a test pattern, not hands, so the only correct outcome is a
    // refusal to guess.
    await expect(page.getByText(/not recognised/i).first()).toBeVisible();
  });

  test('pausing keeps the element but stops the loop', async ({ page }) => {
    await page.goto('/talk/');
    await dismissFirstRunIntro(page);
    await page.getByRole('button', { name: /start camera/i }).click();
    await waitForLiveFrames(page);

    await page.getByRole('button', { name: /pause camera/i }).click();

    await expect.poll(async () => cameraPillText(page), { timeout: 15_000 }).toBe('Camera paused');
    // Paused is not the same as torn down: the element remains so the preview can resume.
    await expect(videos(page)).toHaveCount(1);
  });

  test('stopping removes the preview and returns the pill to off', async ({ page }) => {
    await page.goto('/talk/');
    await dismissFirstRunIntro(page);
    await page.getByRole('button', { name: /start camera/i }).click();
    await waitForLiveFrames(page);

    await page.getByRole('button', { name: /stop camera/i }).click();

    await expect.poll(async () => cameraPillText(page), { timeout: 15_000 }).toBe('Camera off');
    await expect(videos(page)).toHaveCount(0);
  });
});
