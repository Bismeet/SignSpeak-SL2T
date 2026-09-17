/**
 * Shared helpers for the browser tests.
 *
 * Kept small on purpose: a helper that hides a real interaction makes the test prove less.
 */

import { expect, type Page } from '@playwright/test';

/**
 * Dismiss the first-run introduction if it is showing.
 *
 * It is a real onboarding step, not an obstacle, so the test that cares about it asserts on
 * it directly. Everywhere else it just needs to be out of the way — it covers the page with a
 * full-screen overlay and would intercept clicks.
 *
 * The wait matters: the intro is client-rendered, so immediately after `goto` resolves it may
 * not have mounted yet. Checking visibility once and moving on raced it, and the overlay then
 * appeared and swallowed the next click.
 */
export async function dismissFirstRunIntro(page: Page): Promise<void> {
  const skip = page.getByRole('button', { name: /skip/i });
  try {
    await skip.waitFor({ state: 'visible', timeout: 2_000 });
  } catch {
    return; // Not shown: already seen in this profile, or this route has no intro.
  }
  await skip.click();
  await expect(skip).toBeHidden();
}

/** The persistent header, which carries the camera and microphone status pills. */
export function header(page: Page) {
  return page.locator('header').first();
}

/** Read the header's camera pill text. */
export async function cameraPillText(page: Page): Promise<string> {
  const text = await header(page).innerText();
  const match = text.match(/Camera[^\n]*/);
  return (match?.[0] ?? '').trim();
}

/** Read the header's microphone pill text. */
export async function micPillText(page: Page): Promise<string> {
  const text = await header(page).innerText();
  const match = text.match(/Mic[^\n]*/);
  return (match?.[0] ?? '').trim();
}

/** Every `<video>` on the page, so tests can assert on element existence. */
export function videos(page: Page) {
  return page.locator('video');
}

/**
 * Wait until the camera preview is actually delivering frames.
 *
 * `readyState >= 2` is HAVE_CURRENT_DATA: the element has decoded at least one frame. This is
 * the assertion that catches a stream attached to nothing — the bug where the app reported
 * "Camera on" while `srcObject` was null and the preview stayed blank.
 */
export async function waitForLiveFrames(page: Page, timeoutMs = 60_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const video = document.querySelector('video');
      return Boolean(video && video.srcObject && video.readyState >= 2);
    },
    undefined,
    { timeout: timeoutMs },
  );
}
