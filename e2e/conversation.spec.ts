/**
 * Conversation and the text-to-visual path.
 *
 * This is feature F end to end, and it needs no camera: a hearing person types, the text is
 * matched against the curated phrase list, and the app either shows a verified clip or says
 * plainly that none exists. Since no clip has been verified, the honest outcome is always the
 * notice — which is exactly what FR-VIS-03 requires and what these tests pin down.
 */

import { expect, test } from '@playwright/test';

import { dismissFirstRunIntro } from './helpers';

async function sendMessage(page: import('@playwright/test').Page, text: string): Promise<void> {
  await page.getByLabel(/message to send/i).fill(text);
  await page.getByRole('button', { name: /send message/i }).click();
}

test.describe('typing always works, with or without a microphone', () => {
  test('the typing fallback is offered on the hearing-user side', async ({ page }) => {
    await page.goto('/talk/');
    await dismissFirstRunIntro(page);

    await expect(page.getByText(/typing always works/i).first()).toBeVisible();
    await expect(page.getByLabel(/message to send/i)).toBeVisible();
  });

  test('a typed message is added to the shared conversation', async ({ page }) => {
    await page.goto('/talk/');
    await dismissFirstRunIntro(page);

    await expect(page.getByText(/no messages yet/i).first()).toBeVisible();
    await sendMessage(page, 'Where does it hurt?');

    await expect(page.getByText('Where does it hurt?').first()).toBeVisible();
    await expect(page.getByText(/no messages yet/i)).toHaveCount(0);
  });
});

test.describe('text-to-visual never invents a sign', () => {
  test('a matched phrase with no verified clip says so (FR-VIS-03)', async ({ page }) => {
    await page.goto('/talk/');
    await dismissFirstRunIntro(page);

    await sendMessage(page, 'Where does it hurt?');

    // The exact wording is a product requirement, so it is asserted verbatim.
    await expect(page.getByText(/no verified isl video for this phrase/i).first()).toBeVisible();
  });

  test('an alias matches the same phrase (FR-VIS-02)', async ({ page }) => {
    await page.goto('/talk/');
    await dismissFirstRunIntro(page);

    // "where is the pain" is an alias of "Where does it hurt?" in data/phrases.json.
    await sendMessage(page, 'where is the pain');

    // The app reports which phrase it matched, so the user can see it understood them. This
    // also guards a real defect: matching used to be tied to the reviewer setting, so with
    // nothing verified *no* phrase matched and the app claimed the phrase was not in the list.
    await expect(page.getByText(/where does it hurt\?/i).first()).toBeVisible();
    await expect(page.getByText(/no phrase in the curated list matches/i)).toHaveCount(0);
  });

  test('unmatched text is shown as written, and never passed off as a match', async ({ page }) => {
    await page.goto('/talk/');
    await dismissFirstRunIntro(page);

    const nonsense = 'the aardvark teleported sideways';
    await sendMessage(page, nonsense);

    // The user's own words are shown verbatim.
    await expect(page.getByText(nonsense).first()).toBeVisible();

    // The app says plainly that nothing in the list matches, and does not claim a video.
    await expect(page.getByText(/no phrase in the curated list matches/i).first()).toBeVisible();
    await expect(page.getByText(/shown as text only/i).first()).toBeVisible();

    // A phrase sharing a single token must not be offered as "the closest phrase": that reads
    // like a recognition the app did not make.
    await expect(page.getByText(/the closest phrase was/i)).toHaveCount(0);
  });

  test('draft phrases are hidden by default, and say why (FR-HOSP-05)', async ({ page }) => {
    await page.goto('/phrases/');
    await dismissFirstRunIntro(page);

    // Nothing is verified, so the board offers no phrases at all until a reviewer opts in —
    // and it explains that rather than showing an empty grid.
    await expect(page.getByText(/drafts are hidden by default/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^speak:/i })).toHaveCount(0);
  });

  test('once revealed, an unverified phrase offers an explanation, never a fake video', async ({
    page,
  }) => {
    await page.goto('/phrases/');
    await dismissFirstRunIntro(page);

    await page.getByRole('button', { name: /show unverified phrases/i }).click();

    // The cards appear, and each is badged as unverified rather than presented as reviewed.
    await expect(page.getByText(/^unverified$/i).first()).toBeVisible();

    // The board is grouped by category, so a category has to be opened before its phrases show.
    await page.getByRole('button', { name: /^pain\b/i }).first().click();

    // No card may offer a "Show ISL" control, because there is nothing verified to show.
    await expect(page.getByRole('button', { name: /^show isl video for/i })).toHaveCount(0);

    // The card offers to explain the absence instead, which is the honest affordance.
    await page
      .getByRole('button', { name: /show why there is no isl video for: where does it hurt/i })
      .first()
      .click();
    await expect(page.getByText(/no verified isl video/i).first()).toBeVisible();
  });
});

test.describe('the conversation can be cleared', () => {
  test('Clear messages empties it', async ({ page }) => {
    await page.goto('/talk/');
    await dismissFirstRunIntro(page);

    await sendMessage(page, 'I need water.');
    await expect(page.getByText('I need water.').first()).toBeVisible();

    await page.getByRole('button', { name: /clear messages/i }).first().click();
    await expect(page.getByText(/no messages yet/i).first()).toBeVisible();
  });
});

test.describe('speech output never plays on its own', () => {
  test('the speak controls exist and report nothing to speak yet', async ({ page }) => {
    await page.goto('/talk/');
    await dismissFirstRunIntro(page);

    await expect(page.getByRole('button', { name: /^speak$/i }).first()).toBeVisible();
    // The Stop control is labelled "Stop speaking" for screen readers, which is clearer than
    // a bare "Stop" next to a "Stop camera" button.
    await expect(page.getByRole('button', { name: /stop speaking/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^repeat$/i }).first()).toBeVisible();

    // FR-SPK-02: with nothing composed there is nothing to say, and the app says so rather
    // than speaking anything.
    await expect(page.getByText(/nothing to speak yet/i).first()).toBeVisible();
  });
});
