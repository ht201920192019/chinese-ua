const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const root = path.resolve(__dirname, '..', 'public');
const domain = 'https://chinese-ua.pp.ua';

function walk(directory, base = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = path.posix.join(base, entry.name);
    return entry.isDirectory() ? walk(path.join(directory, entry.name), relative) : [relative];
  });
}

const allFiles = walk(root);
const htmlFiles = allFiles.filter(file => file.endsWith('.html'));
const routes = htmlFiles.map(file => file === 'index.html' ? '/' : `/${file.slice(0, -'index.html'.length)}`);
const htmlByRoute = new Map(routes.map((route, index) => [route, fs.readFileSync(path.join(root, htmlFiles[index]), 'utf8')]));
const idsByRoute = new Map([...htmlByRoute].map(([route, html]) => [route, new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]))]));
const redirects = fs.readFileSync(path.join(root, '_redirects'), 'utf8').trim().split(/\r?\n/).map(line => line.trim().split(/\s+/)).filter(parts => parts.length >= 3);

function staticFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  const clean = path.posix.normalize(decoded).replace(/^\/+/, '');
  if (clean.startsWith('..')) return null;
  const candidates = [];
  if (!clean || clean.endsWith('/')) candidates.push(path.join(root, clean, 'index.html'));
  else {
    candidates.push(path.join(root, clean));
    candidates.push(path.join(root, clean, 'index.html'));
    if (!path.extname(clean)) candidates.push(path.join(root, `${clean}.html`));
  }
  return candidates.find(candidate => candidate.startsWith(root) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, 'http://localhost');
  const rule = redirects.find(([from]) => from === requestUrl.pathname);
  if (rule) {
    res.writeHead(Number(rule[2]), { Location: rule[1] });
    return res.end();
  }
  const file = staticFile(requestUrl.pathname);
  if (!file) { res.writeHead(404); return res.end('Not found'); }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

(async () => {
  assert.equal(htmlFiles.length, 42, 'expected all 42 planned HTML pages to be generated');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    const assetPaths = ['/styles.css', '/script.js', '/favicon.svg', '/robots.txt', '/sitemap.xml'];
    for (const asset of assetPaths) assert.equal((await page.request.get(`${baseUrl}${asset}`)).status(), 200, `${asset} should load`);
    const robots = await (await page.request.get(`${baseUrl}/robots.txt`)).text();
    assert.match(robots, new RegExp(`Sitemap: ${domain.replaceAll('.', '\\.')}\\/sitemap\\.xml`));

    const sitemap = await (await page.request.get(`${baseUrl}/sitemap.xml`)).text();
    const sitemapRoutes = [...sitemap.matchAll(/<loc>https:\/\/chinese-ua\.pp\.ua([^<]*)<\/loc>/g)].map(match => match[1]);
    assert.deepEqual([...sitemapRoutes].sort(), [...routes].sort(), 'sitemap should contain every canonical page exactly once');

    for (const [oldPath, destination] of [
      ['/pinyin-tones.html', '/pinyin/tones/'],
      ['/first-phrases.html', '/dialogues/introduction/'],
      ['/numbers-prices.html', '/vocabulary/numbers/'],
    ]) {
      const response = await page.request.get(`${baseUrl}${oldPath}`, { maxRedirects: 0 });
      assert.equal(response.status(), 301, `${oldPath} should permanently redirect`);
      assert.equal(response.headers().location, destination);
    }

    const checkedLinks = new Set();
    for (const route of routes) {
      const url = `${baseUrl}${route}`;
      const response = await page.goto(url);
      assert.equal(response.status(), 200, `${route} should load`);
      assert.equal(await page.locator('html').getAttribute('lang'), 'uk', `${route} should use Ukrainian as its primary language`);
      assert.equal(await page.locator('h1').count(), 1, `${route} should have one H1`);
      assert.ok((await page.title()).includes('Chinese UA'), `${route} should have a page title`);
      assert.ok((await page.locator('meta[name="description"]').getAttribute('content'))?.length > 50, `${route} should have a useful meta description`);
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), `${domain}${route}`);
      for (const property of ['og:title', 'og:description', 'og:url']) assert.ok(await page.locator(`meta[property="${property}"]`).count(), `${route} is missing ${property}`);
      assert.ok(await page.locator('header.site-header').count());
      assert.ok(await page.locator('footer.site-footer').count());
      if (route === '/characters/') assert.equal(await page.locator('#basic-characters .word-card').count(), 50);
      if (route === '/hsk/hsk1/') assert.equal(await page.locator('.hub-cards .hub-card').count(), 5);
      if (route.startsWith('/hsk/hsk1/lesson-')) {
        for (const section of ['words', 'grammar', 'dialogue', 'pronunciation', 'practice', 'summary']) {
          assert.equal(await page.locator(`#${section}`).count(), 1, `${route} is missing its ${section} lesson section`);
        }
      }

      const links = await page.locator('a[href]').evaluateAll(elements => elements.map(anchor => ({ href: anchor.href, raw: anchor.getAttribute('href') })));
      for (const link of links) {
        const parsed = new URL(link.href);
        if (parsed.origin !== baseUrl) continue;
        if (parsed.hash) {
          const targetRoute = parsed.pathname.endsWith('/') || parsed.pathname === '/' ? parsed.pathname : parsed.pathname;
          assert.ok(idsByRoute.get(targetRoute)?.has(decodeURIComponent(parsed.hash.slice(1))), `broken fragment: ${link.raw} from ${route}`);
        }
        const key = `${parsed.pathname}${parsed.search}`;
        if (checkedLinks.has(key)) continue;
        checkedLinks.add(key);
        const linkResponse = await page.request.get(`${baseUrl}${key}`);
        assert.equal(linkResponse.status(), 200, `broken internal link ${link.raw} from ${route}`);
      }

      const speechTargets = await page.locator('[data-speak]').evaluateAll(buttons => buttons.map(button => ({ id: button.dataset.speak, exists: Boolean(document.getElementById(button.dataset.speak)?.querySelector('[lang="zh-CN"]')) })));
      assert.ok(speechTargets.every(target => target.exists), `${route} has an audio button without Chinese text`);
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflows at ${width}px`);
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(baseUrl);
    await page.locator('#menuButton').click();
    assert.equal(await page.locator('#menuButton').getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#menuButton').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#menuButton').evaluate(button => button === document.activeElement), true);

    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedText = text; } } }));
    await page.locator('#copyDaily').click();
    await page.waitForFunction(() => window.copiedText);
    assert.equal(await page.evaluate(() => window.copiedText), '我想学中文。\nWǒ xiǎng xué Zhōngwén.\nЯ хочу вивчати китайську мову.');

    const speechPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await speechPage.addInitScript(() => {
      window.spoken = [];
      window.testVoices = [{ lang: 'zh-CN', name: 'Test Mandarin' }];
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
        getVoices: () => window.testVoices,
        cancel: () => {},
        speak: utterance => { window.lastUtterance = utterance; window.spoken.push(utterance.text); utterance.onstart?.(); },
      } });
      window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    });
    for (const route of routes) {
      await speechPage.goto(`${baseUrl}${route}`);
      const buttons = speechPage.locator('[data-speak]');
      const count = await buttons.count();
      for (let index = 0; index < count; index++) {
        const button = buttons.nth(index);
        const targetId = await button.getAttribute('data-speak');
        const expected = (await speechPage.locator(`#${targetId} [lang="zh-CN"]`).first().textContent()).trim();
        await button.click();
        assert.equal(await speechPage.evaluate(() => window.spoken.at(-1)), expected, `audio text mismatch on ${route}`);
        assert.equal(await button.getAttribute('aria-pressed'), 'true', `audio button state missing on ${route}`);
        await speechPage.evaluate(() => window.lastUtterance.onend());
        assert.equal(await button.getAttribute('aria-pressed'), null, `audio completion state did not reset on ${route}`);
      }
    }
    await speechPage.goto(baseUrl);
    const firstSpeechButton = speechPage.locator('[data-speak]').first();
    await firstSpeechButton.click();
    await firstSpeechButton.click();
    assert.match(await speechPage.locator('#actionStatus').textContent(), /зупинено/);
    await speechPage.evaluate(() => { window.testVoices = []; });
    await speechPage.locator('[data-speak]').first().click();
    assert.match(await speechPage.locator('#actionStatus').textContent(), /голос ще не доступний/);

    const noJs = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 320, height: 812 } });
    await noJs.goto(baseUrl);
    assert.equal(await noJs.locator('#navLinks').isVisible(), true, 'navigation should remain available without JavaScript');
    assert.equal(await noJs.locator('[data-speak]').first().isVisible(), false, 'unavailable audio buttons should stay hidden without JavaScript');
    assert.deepEqual(errors, []);
    console.log(`PASS: ${routes.length} pages, all internal links, metadata, sitemap, redirects, four viewport widths, menu, copy, and ${[...htmlByRoute.values()].join('').match(/data-speak=/g)?.length || 0} audio controls.`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
