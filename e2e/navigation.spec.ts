/**
 * Navigation, structure and the hospital/emergency content.
 *
 * The accessibility assertions here are structural (one h1, a skip link, labelled controls,
 * no unlabelled buttons). They are not a substitute for an axe scan or a screen-reader pass —
 * `docs/testing-and-evaluation.md` §4 asks for both, and neither is automated yet.
 */

import { expect, test } from '@playwright/test';

import { dismissFirstRunIntro } from './helpers';

const ROUTES = [
  { path: '/', heading: /two-way communication/i },
  { path: '/talk/', heading: /conversation/i },
  { path: '/phrases/', heading: /hospital phrases/i },
  { path: '/emergency/', heading: /emergency phrases/i },
  { path: '/settings/', heading: /settings/i },
  { path: '/help/', heading: /help/i },
  { path: '/privacy/', heading: /privacy/i },
  { path: '/limitations/', heading: /limitations/i },
  { path: '/collect/', heading: /collect/i },
];

test.describe('every route renders', () => {
  for (const route of ROUTES) {
    test(`${route.path} renders with a heading and a skip link`, async ({ page }) => {
      const response = await page.goto(route.path);
      expect(response?.status()).toBeLessThan(400);

      // Exactly one h1 per page: a screen reader user navigating by heading needs a single
      // unambiguous page title.
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(route.heading);

      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.locator('a[href^="#"]').first()).toBeAttached();
      await expect(page.locator('header').first()).toBeVisible();
    });
  }

  test('the 404 page lists somewhere to go rather than dead-ending', async ({ page }) => {
    const response = await page.goto('/no-such-page/');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('link', { name: /home/i }).first()).toBeVisible();
  });
});

test.describe('no control is an unlabelled icon', () => {
  test('every button on every route has an accessible name', async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route.path);
      await dismissFirstRunIntro(page);

      const unnamed = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .filter((button) => {
            const label = (button.getAttribute('aria-label') ?? '').trim();
            const text = (button.textContent ?? '').trim();
            const title = (button.getAttribute('title') ?? '').trim();
            return label.length === 0 && text.length === 0 && title.length === 0;
          })
          .map((button) => button.outerHTML.slice(0, 120)),
      );

      expect(unnamed, `unlabelled buttons on ${route.path}`).toEqual([]);
    }
  });

  test('every image has alternative text', async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route.path);
      const missing = await page.evaluate(() =>
        Array.from(document.querySelectorAll('img'))
          .filter((img) => !img.hasAttribute('alt'))
          .map((img) => img.getAttribute('src') ?? '(no src)'),
      );
      expect(missing, `images without alt on ${route.path}`).toEqual([]);
    }
  });
});

test.describe('Emergency mode is one tap from home and is not empty', () => {
  test('reachable in a single tap (FR-HOSP-04)', async ({ page }) => {
    await page.goto('/');
    await dismissFirstRunIntro(page);

    await page.getByRole('link', { name: /emergency phrases/i }).first().click();

    await expect(page).toHaveURL(/\/emergency\/$/);
    await expect(page.locator('h1')).toHaveText(/emergency phrases/i);
  });

  test('shows the flagged phrases and never more than eight (FR-HOSP-04)', async ({ page }) => {
    await page.goto('/emergency/');
    await dismissFirstRunIntro(page);

    const buttons = page.getByRole('button').filter({ hasNotText: /^$/ });
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(8);

    // Every phrase is bilingual, so the board is usable by a patient who reads Devanagari.
    await expect(page.getByText('हाँ').first()).toBeVisible();
    await expect(page.getByText('नहीं').first()).toBeVisible();
  });

  test('carries the emergency-number banner and the scope disclaimer', async ({ page }) => {
    await page.goto('/emergency/');
    await dismissFirstRunIntro(page);

    // The safety copy is the point of the screen: it must say plainly that the app does not
    // call anyone and does not judge how serious the situation is.
    await expect(page.getByText(/call 112/i).first()).toBeVisible();
    await expect(page.getByText(/does not call anyone/i).first()).toBeVisible();
  });
});

test.describe('the phrase board is honest about what it has', () => {
  test('says plainly that nothing has been verified by an ISL signer', async ({ page }) => {
    await page.goto('/phrases/');
    await dismissFirstRunIntro(page);

    await expect(page.getByText(/no phrase has been reviewed/i).first()).toBeVisible();
    await expect(page.getByText(/need native-speaker review/i).first()).toBeVisible();
  });

  test('does not claim clinical validation anywhere in the product', async ({ page }) => {
    // A negative assertion, which is the honest way to test an honesty requirement: the app
    // must never assert the thing it is not.
    const forbidden = [/clinically validated/i, /medically approved/i, /replaces? (an|the) interpreter/i];
    for (const route of ROUTES) {
      await page.goto(route.path);
      const text = await page.locator('body').innerText();
      for (const pattern of forbidden) {
        expect(text, `${route.path} must not claim ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
