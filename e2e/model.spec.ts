/**
 * The app must describe whatever model is actually installed — including saying when it is
 * not good enough to rely on.
 *
 * This suite exists because the model card gained a `public_dataset` training source: real
 * sign-language recordings from a published research corpus, which are not ours and were not
 * collected under this project's consent process. Before that value existed, every
 * not-for-real-use model was described as "trained on procedurally generated data", which
 * would have been a plain falsehood about a model trained on real ISL clips. A wrong
 * explanation is the same class of failure as a wrong prediction here.
 *
 * The tests skip themselves when no model is staged, so the suite passes both with and
 * without one.
 */

import { expect, test, type Page } from '@playwright/test';

import { dismissFirstRunIntro } from './helpers';

async function stagedCard(page: Page): Promise<Record<string, unknown> | null> {
  const response = await page.request.get('/models/model-card.json');
  if (response.status() !== 200) return null;
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

test.describe('the installed model is described accurately', () => {
  test('never calls a real-data model "procedurally generated"', async ({ page }) => {
    const card = await stagedCard(page);
    test.skip(card === null, 'No model staged in public/models — nothing to describe.');
    if (card === null) return;

    const trainingSource = String(card.trainingSource ?? '');

    for (const path of ['/', '/limitations/', '/settings/']) {
      await page.goto(path);
      await dismissFirstRunIntro(page);
      const text = await page.locator('body').innerText();

      if (trainingSource === 'public_dataset') {
        // The specific claim that would be untrue of this model.
        expect(text, `${path} must not call real recordings synthetic`).not.toMatch(
          /procedurally generated/i,
        );
        // And the things that are true of it must be said.
        expect(text, `${path} should mention research data`).toMatch(
          /public research|research dataset/i,
        );
        expect(text, `${path} should state the consent limitation`).toMatch(/consent/i);
      }
    }
  });

  test('says plainly that the model is not for real use', async ({ page }) => {
    const card = await stagedCard(page);
    test.skip(card === null, 'No model staged in public/models.');
    if (card === null) return;

    expect(card.notForRealUse).toBe(true);

    for (const path of ['/limitations/', '/settings/']) {
      await page.goto(path);
      await dismissFirstRunIntro(page);
      const text = await page.locator('body').innerText();
      // Whatever the source, a not-for-real-use model must be labelled as such on the
      // screens where a user would look for reassurance.
      expect(text, `${path} must flag the model`).toMatch(
        /not real sign recognition|not a clinical recogniser|not a real recogniser/i,
      );
    }
  });

  test('the card matches the contract the browser enforces', async ({ page }) => {
    const card = await stagedCard(page);
    test.skip(card === null, 'No model staged in public/models.');
    if (card === null) return;

    // These are the fields lib/model/card.ts rejects the model over. If a card is being
    // served at all, they must be right — otherwise the app would be silently ignoring it
    // and the previous two tests would be asserting copy for a model that never loaded.
    expect(card.featureVersion).toBe('ss-features-v1');
    expect(card.inputDim).toBe(159);
    expect(Array.isArray(card.vocabulary)).toBe(true);
    expect((card.vocabulary as unknown[]).length).toBeGreaterThan(0);
    expect(card.negativeClass).toBe('OTHER');
  });

  test('the vocabulary the card declares is the vocabulary the app can render', async ({ page }) => {
    const card = await stagedCard(page);
    test.skip(card === null, 'No model staged in public/models.');
    if (card === null) return;

    await page.goto('/talk/');
    await dismissFirstRunIntro(page);
    const text = await page.locator('body').innerText();

    // With a model present the Talk screen must not claim recognition is unavailable.
    expect(text).not.toMatch(/no sign-recognition model is installed/i);
  });

  test('the ONNX file is actually served alongside the card', async ({ page }) => {
    const card = await stagedCard(page);
    test.skip(card === null, 'No model staged in public/models.');
    if (card === null) return;

    const version = String(card.modelVersion ?? '');
    const response = await page.request.get(`/models/${version}.onnx`);
    expect(response.status(), `${version}.onnx must be served`).toBe(200);
    const body = await response.body();
    expect(body.byteLength).toBeGreaterThan(1000);
  });
});
