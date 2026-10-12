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

await page.goto('https://hamza-assistant.vercel.app/chat', { waitUntil: 'networkidle', timeout: 60000 });
await page.setInputFiles('#chat-screenshot', '/home/user/uploads/test-ig-dm.png');
await page.waitForTimeout(1500);
await page.click('button[title="Send"]');

const outcome = await page
  .waitForSelector('text=Copy', { timeout: 90000 })
  .then(() => 'reply')
  .catch(() => 'no reply');
const body = (await page.innerText('body')).replace(/\s+/g, ' ');
console.log('outcome:', outcome);
if (outcome === 'no reply') {
  console.log('error shown:', body.match(/busy[^.]*\.|could not read[^.]*\./i)?.[0] ?? 'none');
} else {
  console.log('platform line:', body.match(/Instagram[^·]*/)?.[0] ?? '?');
  console.log('thread line:', body.match(/\d+ new message[s]? added|nothing new to add[^·]*/)?.[0] ?? '?');
  console.log('snippet:', body.slice(body.indexOf('Instagram'), body.indexOf('Instagram') + 260));
}
await browser.close();
