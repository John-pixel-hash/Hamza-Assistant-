import { chromium } from 'playwright';
import fs from 'node:fs';

const cookie = fs.readFileSync('/tmp/owner_cookie.txt', 'utf8').trim();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
await context.addCookies([{ name: 'sb-qtsndukhlchymsldvuet-auth-token', value: cookie, domain: 'hamza-assistant.vercel.app', path: '/' }]);
const page = await context.newPage();
page.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('requestfailed', (r) => console.log('[requestfailed]', r.url().slice(0, 140), r.failure()?.errorText));
page.on('response', async (r) => {
  if (r.url().includes('storage') || r.status() >= 400) console.log('[http]', r.status(), r.url().slice(0, 160));
  if (r.status() >= 500) {
    try { console.log('[body]', (await r.text()).slice(0, 900)); } catch {}
  }
});

await page.goto('https://hamza-assistant.vercel.app/chat', { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('loaded title:', await page.title());

await page.setInputFiles('#chat-screenshot', '/home/user/uploads/test-ig-dm.png');
try {
  await page.waitForSelector('button[title="Send"]:not([disabled])', { timeout: 25000 });
} catch {
  console.log('send still disabled. page text:', (await page.textContent('body')).replace(/\s+/g, ' ').slice(0, 500));
  await browser.close();
  process.exit(1);
}
console.log('upload done, clicking send at', new Date().toISOString());
await page.click('button[title="Send"]');

try {
  await page.waitForFunction(
    () => /Salam|model is busy|could not|busy right now|couldn't/i.test(document.body.innerText),
    { timeout: 120000 },
  );
  console.log('OUTCOME at', new Date().toISOString());
} catch {
  console.log('NO outcome in 120s');
}
console.log('PAGE TEXT:', (await page.textContent('body')).replace(/\s+/g, ' ').slice(0, 700));
await browser.close();
