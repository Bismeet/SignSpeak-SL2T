/**
 * Privacy behaviour, tested as behaviour rather than as copy.
 *
 * The app promises that a conversation lives in memory only and that nothing about it is
 * persisted or transmitted. Copy asserting that is not evidence, so these tests check the
 * actual storage and the actual network traffic.
 */

import { expect, test } from '@playwright/test';

import { dismissFirstRunIntro } from './helpers';

test.describe('the conversation is in memory only', () => {
  test('reloading the page loses everything (FR-CONV-04)', async ({ page }) => {
    await page.goto('/talk/');
    await dismissFirstRunIntro(page);

    const secret = 'my chest hurts a lot';
    await page.getByLabel(/message to send/i).fill(secret);
    await page.getByRole('button', { name: /send message/i }).click();
    await expect(page.getByText(secret).first()).toBeVisible();

    await page.reload();
    await dismissFirstRunIntro(page);

    await expect(page.getByText(/no messages yet/i).first()).toBeVisible();
    await expect(page.getByText(secret)).toHaveCount(0);
  });

  test('no message text reaches localStorage or sessionStorage', async ({ page }) => {
    await page.goto('/talk/');
    await dismissFirstRunIntro(page);

    const secret = 'unique-canary-8f3a1c';
    await page.getByLabel(/message to send/i).fill(secret);
    await page.getByRole('button', { name: /send message/i }).click();
    await expect(page.getByText(secret).first()).toBeVisible();

    const stored = await page.evaluate(() => {
      const dump: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key) dump[`local:${key}`] = localStorage.getItem(key) ?? '';
      }
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i);
        if (key) dump[`session:${key}`] = sessionStorage.getItem(key) ?? '';
      }
      return JSON.stringify(dump);
    });

    expect(stored).not.toContain(secret);
  });

  test('no request carries the message text', async ({ page }) => {
    const outbound: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'GET' || request.method() === 'POST') {
        outbound.push(`${request.method()} ${request.url()} ${request.postData() ?? ''}`);
      }
    });

    await page.goto('/talk/');
    await dismissFirstRunIntro(page);

    const secret = 'unique-canary-4d7e2b';
    await page.getByLabel(/message to send/i).fill(secret);
    await page.getByRole('button', { name: /send message/i }).click();
    await expect(page.getByText(secret).first()).toBeVisible();

    // Nothing may leave the origin carrying what the user said.
    const leaks = outbound.filter((entry) => entry.includes(secret));
    expect(leaks).toEqual([]);

    // And nothing should be going to a third party at all on this screen.
    const thirdParty = outbound.filter(
      (entry) => !/127\.0\.0\.1|localhost/.test(entry) && !entry.includes('data:'),
    );
    expect(thirdParty, 'no third-party requests expected on the conversation screen').toEqual([]);
  });
});

test.describe('the privacy and limitations screens say the real thing', () => {
  test('the privacy screen states the no-storage default and the ASR exception', async ({ page }) => {
    await page.goto('/privacy/');
    await dismissFirstRunIntro(page);

    const text = await page.locator('body').innerText();
    expect(text).toMatch(/not recorded|never recorded|no recording/i);
    expect(text).toMatch(/memory|not stored/i);
    // The one honest exception: the browser's own speech service may receive audio.
    expect(text).toMatch(/speech recognition|browser/i);
  });

  test('the limitations screen lists what the app cannot do', async ({ page }) => {
    await page.goto('/limitations/');
    await dismissFirstRunIntro(page);

    const text = await page.locator('body').innerText();
    // The three limitations that matter most to a user deciding whether to trust it.
    expect(text).toMatch(/not a medical device/i);
    expect(text).toMatch(/interpreter/i);
    expect(text).toMatch(/non-manual|facial|expression/i);
  });
});

test.describe('the camera is never opened by a screen that does not need it', () => {
  test('loading Home, Phrases, Emergency, Help, Privacy or Limitations opens no camera', async ({
    page,
  }) => {
    const videoRequests: string[] = [];
    await page.addInitScript(() => {
      const original = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
      if (!original) return;
      navigator.mediaDevices.getUserMedia = (constraints?: MediaStreamConstraints) => {
        if (constraints?.video || constraints?.audio) {
          (window as never as { __gum: string[] }).__gum ??= [];
          (window as never as { __gum: string[] }).__gum.push(
            constraints.video ? 'video' : 'audio',
          );
        }
        return original(constraints);
      };
    });

    for (const path of ['/', '/phrases/', '/emergency/', '/help/', '/privacy/', '/limitations/']) {
      await page.goto(path);
      await dismissFirstRunIntro(page);
      // Give any stray effect a chance to fire before asserting nothing did.
      await page.waitForTimeout(300);
      const calls = await page.evaluate(
        () => (window as never as { __gum?: string[] }).__gum ?? [],
      );
      videoRequests.push(`${path}: ${calls.join(',') || 'none'}`);
    }

    // No screen may touch the camera or microphone without an explicit user action.
    for (const entry of videoRequests) {
      expect(entry, entry).toMatch(/: none$/);
    }
  });
});
