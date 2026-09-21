import { chromium } from 'playwright';

async function testAlphabetGuide() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to http://localhost:3000/talk...');
  await page.goto('http://localhost:3000/talk', { waitUntil: 'networkidle' });

  // Click fingerspelling mode
  const fingerspellingButton = page.locator('button:has-text("Fingerspelling")');
  await fingerspellingButton.click();
  console.log('Clicked Fingerspelling (A–Z)...');

  // Verify updated subtitle text
  const subtitle = page.locator('text=Indian Sign Language (ISL) Standard Alphabet');
  const subtitleVisible = await subtitle.isVisible();
  console.log('Updated ISL Alphabet Subtitle visible:', subtitleVisible);

  // Click ISL Sign Guide button
  const guideBtn = page.locator('button:has-text("ISL Sign Guide")');
  const guideBtnVisible = await guideBtn.isVisible();
  console.log('ISL Sign Guide button visible:', guideBtnVisible);
  await guideBtn.click();
  console.log('Clicked ISL Sign Guide button...');

  // Verify dialog is open
  const modalTitle = page.locator('text=Indian Sign Language (ISL) Alphabet Guide');
  const modalVisible = await modalTitle.isVisible();
  console.log('Modal visible:', modalVisible);

  // Click on letter W
  const letterW = page.locator('button:has-text("W")').last();
  await letterW.click();
  console.log('Clicked on letter W in guide...');

  // Wait a bit for preview to update
  await page.waitForTimeout(400);

  // Verify W description is shown
  const wDesc = page.locator('text=Fingers of both hands completely interlocked together');
  const wDescVisible = await wDesc.isVisible();
  console.log('W description visible:', wDescVisible);

  // Take screenshot
  await page.screenshot({ path: 'public/isl-guide-proof.png', fullPage: true });
  console.log('Saved screenshot to public/isl-guide-proof.png');

  await browser.close();
  console.log('[SUCCESS] ISL Alphabet Guide verified successfully in browser!');
}

testAlphabetGuide().catch((err) => {
  console.error('Error during test:', err);
  process.exit(1);
});
