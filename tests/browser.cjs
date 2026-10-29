const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  let file = path.join(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (file.endsWith(path.sep)) file += 'index.html';
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    let analyticsRequests = 0;
    page.on('pageerror', err => errors.push(err.message));
    await context.route('**/*', route => {
      const req = route.request();
      if (req.url().includes('googletagmanager.com')) {
        analyticsRequests++;
        return route.fulfill({ contentType: 'text/javascript', body: '' });
      }
      if (!req.url().startsWith(base)) return route.abort();
      // Images are irrelevant to these behavioural tests; layout sizes come from CSS.
      if (req.resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"/>' });
      return route.continue();
    });
    await page.goto(base);
    assert.equal(analyticsRequests, 0, 'No analytics before consent');
    await page.getByRole('button', { name: 'Reject analytics', exact: true }).click();
    await page.goto(base + '/contact.html');
    assert.equal(analyticsRequests, 0, 'Rejection persists across pages');
    assert.equal(await page.locator('.cookie-banner').isVisible(), false);
    await page.getByRole('button', { name: 'Cookie settings', exact: true }).click();
    await page.getByRole('button', { name: 'Accept analytics', exact: true }).click();
    await page.waitForFunction(() => !!document.querySelector('script[src*="googletagmanager"]'));
    await page.waitForTimeout(100);
    assert.equal(analyticsRequests, 1, 'Analytics loads after acceptance');
    await page.reload();
    await page.waitForTimeout(100);
    assert.equal(analyticsRequests, 2, 'Acceptance persists');
    await context.addCookies([{ name: '_ga', value: 'test', url: base }]);
    await page.getByRole('button', { name: 'Cookie settings', exact: true }).click();
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Reject analytics', exact: true }).click()]);
    assert.equal(analyticsRequests, 2, 'Withdrawal prevents further loads');
    assert.equal((await context.cookies()).some(c => c.name === '_ga'), false);

    const pages = fs.readdirSync(root).filter(p => p.endsWith('.html')).concat(fs.readdirSync(path.join(root, 'insights')).filter(p => p.endsWith('.html')).map(p => 'insights/' + p));
    for (const file of pages) {
      await page.goto(base + '/' + file);
      assert.equal(await page.locator('script[src="/assets/js/site.js"]').count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Cookie settings', exact: true }).count(), 1);
    }
    for (const width of [390, 900, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base);
      for (let i = 0; i < 25; i++) await page.locator('#galleryNext').click();
      await page.waitForTimeout(500);
      const delta = await page.locator('.gallery-wrap').evaluate(wrap => wrap.querySelector('.gallery-item:last-child').getBoundingClientRect().right - wrap.getBoundingClientRect().right);
      assert.ok(Math.abs(delta) < 2, `Gallery reaches final image at ${width}px: ${delta}`);
      await page.setViewportSize({ width: 600, height: 900 });
      await page.waitForTimeout(500);
      const overscroll = await page.locator('.gallery-wrap').evaluate(wrap => wrap.getBoundingClientRect().right - wrap.querySelector('.gallery-item:last-child').getBoundingClientRect().right);
      assert.ok(overscroll < 2, 'Resize does not leave blank space');
    }
    for (const file of ['index.html', 'inspiration-commercial.html', 'inspiration-hospitality.html']) {
      await page.goto(base + '/' + file);
      const card = page.locator('.product-card, .gallery-item').first();
      await card.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Enlarged image' });
      await dialog.waitFor({ state: 'visible' });
      await page.waitForTimeout(30);
      assert.equal(await dialog.locator('button').first().evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Shift+Tab');
      assert.equal(await dialog.locator('button').last().evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await card.evaluate(el => el === document.activeElement), true, 'Focus returns to selected card');
    }
    await page.goto(base);
    const menu = page.locator('.mobile-menu-toggle');
    await menu.click();
    assert.equal(await menu.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#mobileNav').evaluate(el => el.inert), true);
    assert.equal(await menu.evaluate(el => el === document.activeElement), true);
    assert.deepEqual(errors, [], 'No runtime errors on reviewed pages');
    await page.addInitScript(() => {
      Storage.prototype.getItem = function () { throw new Error('Storage unavailable'); };
      Storage.prototype.setItem = function () { throw new Error('Storage unavailable'); };
    });
    await page.goto(base);
    await page.getByRole('button', { name: 'Reject analytics', exact: true }).click();
    assert.equal(await page.locator('.cookie-banner').isVisible(), false, 'Cookie choices work with storage blocked');
    assert.deepEqual(errors, [], 'Storage errors are handled');
    console.log(`Passed: ${pages.length} pages, consent lifecycle, three gallery sizes, resize, keyboard lightboxes and mobile menu.`);
    await context.close();
  } finally { await browser.close(); server.close(); }
})().catch(err => { console.error(err); server.close(); process.exitCode = 1; });
