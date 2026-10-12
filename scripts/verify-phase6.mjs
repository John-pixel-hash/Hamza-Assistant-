import { chromium } from 'playwright';
import fs from 'node:fs';

const cookie = fs.readFileSync('/tmp/owner_cookie.txt', 'utf8').trim();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
await context.addCookies([
  { name: 'sb-qtsndukhlchymsldvuet-auth-token', value: cookie, domain: 'hamza-assistant.vercel.app', path: '/' },
]);
const page = await context.newPage();
page.on('response', (r) => {
  if (r.status() >= 500) console.log('[http]', r.status(), r.url().slice(0, 120));
});

async function bodyText() {
  return (await page.innerText('body')).replace(/\s+/g, ' ');
}

// 1. Intake.
await page.goto('https://hamza-assistant.vercel.app/projects/new', { waitUntil: 'networkidle', timeout: 60000 });
await page.fill('#project-title', 'Phase6 test: landing page for Omar');
await page.fill(
  '#project-brief',
  'Omar wants a one page landing for his gym with a signup form and his Instagram feed on it. He has a logo but no other content. He wants it live in ten days. Budget around 200 dollars.',
);
await page.getByRole('button', { name: 'Create the project' }).click();
await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 70000 });
const projectId = page.url().split('/').pop();
console.log('1 intake ok:', projectId);

// 2. Research.
await page.waitForSelector('text=Research the method', { timeout: 20000 });
await page.getByRole('button', { name: 'Research the method' }).click();
await page.waitForSelector('text=Research behind the method', { timeout: 90000 });
let body = await bodyText();
console.log('2 research ok, notes on page:', body.includes('Research behind the method'));

// 3. Plan. The free tier spikes at peak: if both models 429, wait it out and
// tap again. The step cards are the success signal, not the pending copy.
for (let attempt = 1; attempt <= 3; attempt += 1) {
  await page.getByRole('button', { name: 'Build the plan' }).click();
  const done = await page
    .waitForSelector('li:has-text("Quality checklist")', { timeout: 90000 })
    .then(() => true)
    .catch(() => false);
  if (done) break;
  const failed = (await bodyText()).includes('could not finish');
  console.log(`3 attempt ${attempt} ended without steps (planner failed: ${failed}); waiting out the spike`);
  if (attempt < 3) await page.waitForTimeout(75000);
}
const stepCards = page.locator('li:has-text("Quality checklist")');
const stepCount = await stepCards.count();
console.log('3 plan steps on page:', stepCount);
if (stepCount === 0) {
  await browser.close();
  process.exit(1);
}

// 4. Tracker: start first step, try done before checks, then pass checks.
const first = stepCards.first();
await first.getByRole('button', { name: 'Start', exact: true }).click();
await page.waitForSelector('text=Send to review', { timeout: 20000 });
const firstAfter = page.locator('li:has-text("Quality checklist")').first();
await firstAfter.getByRole('button', { name: 'Mark done' }).click();
await page.waitForSelector('text=Not done yet', { timeout: 20000 });
console.log('4 done refused before checklist:', (await bodyText()).includes('Not done yet'));

const checks = page.locator('li:has-text("Quality checklist")').first().locator('button[title="Toggle this check"]');
const checkCount = await checks.count();
for (let i = 0; i < checkCount; i += 1) {
  await page.locator('li:has-text("Quality checklist")').first().locator('button[title="Toggle this check"]').nth(i).click();
  await page.waitForTimeout(1500);
}
await page.locator('li:has-text("Quality checklist")').first().getByRole('button', { name: 'Mark done' }).click();
await page.waitForTimeout(3000);
body = await bodyText();
console.log('5 step done after checklist:', body.includes('1 of') || /1\/\d+ steps|\bDone\b/.test(body));

// 6. Block and unblock the second step.
const second = page.locator('li:has-text("Quality checklist")').nth(1);
await second.getByRole('button', { name: 'Start', exact: true }).click();
await page.waitForTimeout(2500);
await page.locator('li:has-text("Quality checklist")').nth(1).getByRole('button', { name: 'Block', exact: true }).click();
await page.locator('textarea[name="blocked_reason"]').first().fill('Waiting on Omar to send the logo files.');
await page.getByRole('button', { name: 'Block this step' }).click();
await page.waitForSelector('text=Blocked by:', { timeout: 20000 });
console.log('6 blocked with reason:', (await bodyText()).includes('Waiting on Omar'));

// 7. Client update draft, with the same spike retry.
for (let attempt = 1; attempt <= 3; attempt += 1) {
  await page.getByRole('button', { name: 'Draft the update' }).click();
  const ok = await page.waitForSelector('#update-text', { timeout: 60000 }).then(() => true).catch(() => false);
  if (ok) {
    const updateText = await page.inputValue('#update-text');
    console.log('7 update drafted:', updateText.length > 40, '| starts:', updateText.slice(0, 60).replace(/\n/g, ' '));
    break;
  }
  console.log(`7 attempt ${attempt} failed, waiting out the spike`);
  if (attempt < 3) await page.waitForTimeout(75000);
}

console.log('PROJECT_ID', projectId);
await browser.close();
