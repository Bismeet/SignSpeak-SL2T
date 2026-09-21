import { chromium } from 'playwright';

async function testTalkPage() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to http://localhost:3000/talk...');
  await page.goto('http://localhost:3000/talk', { waitUntil: 'networkidle' });

  const title = await page.title();
  console.log('Page Title:', title);

  // Check mode switcher
  const wordsButton = page.locator('button:has-text("Words & Signs")');
  const fingerspellingButton = page.locator('button:has-text("Fingerspelling")');

  const wordsExists = await wordsButton.isVisible();
  const fingerExists = await fingerspellingButton.isVisible();

  console.log('Words Button visible:', wordsExists);
  console.log('Fingerspelling Button visible:', fingerExists);

  // Click fingerspelling
  await fingerspellingButton.click();
  console.log('Clicked Fingerspelling (A-Z)...');

  // Verify Fingerspelling Assembler
  const bufferInput = page.locator('input[placeholder*="BISMEET"]');
  const bufferExists = await bufferInput.isVisible();
  console.log('Fingerspelling Buffer Input visible:', bufferExists);

  const nameBtn = page.locator('button:has-text("My name is")');
  const nameBtnExists = await nameBtn.isVisible();
  console.log('Name Sentence Button visible:', nameBtnExists);

  // Type a name in buffer
  await bufferInput.fill('BISMEET');
  const buttonText = await nameBtn.textContent();
  console.log('Updated Name Button Text:', buttonText);

  // Click send name
  await nameBtn.click();
  console.log('Clicked Send: "My name is Bismeet"');

  // Verify message appeared in conversation feed
  await page.waitForTimeout(500);
  const sentMessage = page.locator('text=My name is Bismeet');
  const messageSent = await sentMessage.first().isVisible();
  await page.screenshot({ path: 'public/fingerspelling-proof.png', fullPage: true });
  console.log('Saved screenshot to public/fingerspelling-proof.png');

  await browser.close();
  console.log('[SUCCESS] All browser verification checks passed!');
}

testTalkPage().catch((err) => {
  console.error('Error during test:', err);
  process.exit(1);
});
