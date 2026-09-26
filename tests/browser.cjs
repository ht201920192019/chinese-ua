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
  assert.equal(htmlFiles.length, 43, 'expected all 43 planned HTML pages to be generated');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

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
      if (route === '/tools/flashcards/') {
        assert.equal(await page.title(), 'Картки китайських слів українською | Chinese UA');
        assert.equal(await page.locator('h1').textContent(), 'Картки для вивчення китайських слів');
        assert.match(await page.locator('meta[name="description"]').getAttribute('content'), /Повторюйте китайські слова за темами/);
        assert.equal(await page.locator('[data-flashcard-app]').getAttribute('data-words') !== null, true);
        assert.equal(await page.locator('[data-flashcard-app]').evaluate(element => {
          const ids = JSON.parse(element.dataset.words).map(word => word.id);
          return ids.length === 53 && new Set(ids).size === ids.length;
        }), true, 'all 53 vocabulary records should have unique stable card IDs');
        assert.equal(await page.locator('[data-topic-filter] option').count(), 7);
        assert.equal(await page.locator('footer a[href="/tools/flashcards/"]').count(), 1, 'footer should link to the flashcards page');
      }
      if (route.startsWith('/hsk/hsk1/lesson-')) {
        for (const section of ['words', 'grammar', 'dialogue', 'pronunciation', 'practice', 'summary']) {
          assert.equal(await page.locator(`#${section}`).count(), 1, `${route} is missing its ${section} lesson section`);
        }
        assert.equal(await page.locator('[data-quiz] .quiz-question').count(), 5, `${route} should initialize five quiz questions`);
        assert.ok(await page.locator('[data-quiz-progress]').textContent());
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
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    assert.equal(await page.locator('#learningTitle').textContent(), 'Ваше навчання');
    assert.equal(await page.locator('[data-dashboard-prompt]').textContent(), 'Почніть свій перший урок');
    assert.equal(await page.locator('[data-continue-learning]').getAttribute('href'), '/hsk/hsk1/lesson-1/');
    await page.goto(`${baseUrl}/hsk/hsk1/lesson-1/`);
    const completeLesson = page.locator('#completeLesson');
    assert.equal(await completeLesson.isVisible(), true);
    await completeLesson.click();
    const savedProgress = await page.evaluate(() => JSON.parse(localStorage.getItem('chineseUaLearningProgressV1')));
    assert.deepEqual(savedProgress.lessons[0].slug, 'lesson-1');
    assert.equal(savedProgress.lessons[0].completed, true);
    assert.ok(Number.isFinite(Date.parse(savedProgress.lessons[0].completedAt)), 'completion should save a timestamp');
    await page.reload();
    assert.equal(await page.locator('#completeLesson').getAttribute('aria-pressed'), 'true', 'completion should persist after reload');
    await page.goto(`${baseUrl}/hsk/hsk1/`);
    assert.equal(await page.locator('[data-progress-count]').textContent(), '1 / 5 уроків завершено');
    assert.equal(await page.locator('[role="progressbar"]').getAttribute('aria-valuenow'), '1');
    assert.equal(await page.locator('[data-progress-fill]').evaluate(element => element.style.width), '20%');
    await page.goto(baseUrl);
    assert.equal(await page.locator('[data-continue-learning]').getAttribute('href'), '/hsk/hsk1/lesson-2/');
    assert.equal(await page.locator('[data-continue-learning]').textContent(), 'Продовжити навчання →');
    assert.equal(await page.locator('[data-completed-total]').textContent(), '1');
    assert.equal(await page.locator('[data-recent-lesson]').textContent(), 'Привітання та знайомство');
    await page.goto(`${baseUrl}/hsk/hsk1/lesson-1/`);
    await page.locator('#completeLesson').click();
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('chineseUaLearningProgressV1')))).lessons[0].completed, false, 'completion should be reversible');
    await page.evaluate(() => localStorage.clear());
    await page.goto(baseUrl);
    assert.equal(await page.locator('[data-completed-total]').textContent(), '0', 'clearing browser data should reset progress');

    await page.evaluate(() => localStorage.setItem('chineseUaLearningProgressV1', JSON.stringify({
      lessons: [{ slug: 'lesson-1', completed: true, completedAt: '2026-01-01T00:00:00.000Z' }],
      knownWords: ['你好'],
    })));
    await page.goto(`${baseUrl}/hsk/hsk1/lesson-1/`);
    const quizCards = page.locator('[data-quiz] .quiz-question');
    assert.equal(await quizCards.count(), 5, 'quiz should initialize all five questions');

    // Keyboard-select the right first answer and check it.
    await quizCards.nth(0).locator('input[type="radio"]').nth(0).focus();
    await page.keyboard.press('Space');
    await quizCards.nth(0).getByRole('button', { name: 'Перевірити' }).click();
    assert.match(await quizCards.nth(0).locator('.quiz-feedback').textContent(), /^Правильно\./);

    // Wrong choice is reported immediately and can be retried.
    await quizCards.nth(1).locator('input[type="radio"]').nth(1).check();
    await quizCards.nth(1).getByRole('button', { name: 'Перевірити' }).click();
    assert.match(await quizCards.nth(1).locator('.quiz-feedback').textContent(), /^Неправильно\./);
    await quizCards.nth(1).getByRole('button', { name: 'Спробувати ще раз' }).click();
    await quizCards.nth(1).locator('input[type="radio"]').nth(1).check();
    await quizCards.nth(1).getByRole('button', { name: 'Перевірити' }).click();
    assert.match(await quizCards.nth(1).locator('.quiz-feedback').textContent(), /^Неправильно\./);

    await quizCards.nth(2).locator('input[type="radio"]').nth(0).check();
    await quizCards.nth(2).getByRole('button', { name: 'Перевірити' }).click();
    assert.match(await quizCards.nth(2).locator('.quiz-feedback').textContent(), /^Правильно\./, 'true/false question should be evaluated');
    await quizCards.nth(3).locator('input[type="text"]').fill(' 叫 ');
    await quizCards.nth(3).getByRole('button', { name: 'Перевірити' }).click();
    assert.match(await quizCards.nth(3).locator('.quiz-feedback').textContent(), /^Правильно\./, 'fill blank should trim surrounding spaces');

    const orderCard = quizCards.nth(4);
    const orderChoices = orderCard.locator('.quiz-order-items');
    await orderChoices.getByRole('button', { name: '安娜' }).click();
    await orderCard.getByRole('button', { name: 'Скасувати останнє' }).click();
    const keyboardToken = orderChoices.getByRole('button', { name: '我' });
    await keyboardToken.focus();
    await page.keyboard.press('Enter');
    for (const token of ['叫', '安娜']) await orderChoices.getByRole('button', { name: token }).click();
    await orderCard.getByRole('button', { name: 'Перевірити' }).click();
    assert.match(await orderCard.locator('.quiz-feedback').textContent(), /^Правильно\./, 'sentence order should be evaluated');
    assert.equal(await page.locator('[data-quiz-result]').isVisible(), true);
    assert.equal(await page.locator('[data-quiz-score]').textContent(), '4 / 5 · 80%');
    let quizStorage = await page.evaluate(() => JSON.parse(localStorage.getItem('chineseUaLearningProgressV1')));
    assert.deepEqual(quizStorage.lessons[0].slug, 'lesson-1', 'quiz save must preserve lesson completion');
    assert.deepEqual(quizStorage.knownWords, ['你好'], 'quiz save must preserve existing fields');
    assert.deepEqual(quizStorage.quizResults[0], {
      slug: 'lesson-1', score: 4, total: 5, percentage: 80, completedAt: quizStorage.quizResults[0].completedAt,
    });
    assert.ok(Number.isFinite(Date.parse(quizStorage.quizResults[0].completedAt)));

    await page.locator('[data-quiz-restart]').click();
    assert.equal(await page.locator('[data-quiz-result]').isVisible(), false, 'restart should reset the quiz component');
    await page.reload();
    quizStorage = await page.evaluate(() => JSON.parse(localStorage.getItem('chineseUaLearningProgressV1')));
    assert.equal(quizStorage.quizResults[0].score, 4, 'quiz result should remain after reload');
    const retakeCards = page.locator('[data-quiz] .quiz-question');
    await retakeCards.nth(0).locator('input[type="radio"]').nth(0).check();
    await retakeCards.nth(0).getByRole('button', { name: 'Перевірити' }).click();
    await retakeCards.nth(1).locator('input[type="radio"]').nth(0).check();
    await retakeCards.nth(1).getByRole('button', { name: 'Перевірити' }).click();
    await retakeCards.nth(2).locator('input[type="radio"]').nth(0).check();
    await retakeCards.nth(2).getByRole('button', { name: 'Перевірити' }).click();
    await retakeCards.nth(3).locator('input[type="text"]').fill('叫');
    await retakeCards.nth(3).getByRole('button', { name: 'Перевірити' }).click();
    for (const token of ['我', '叫', '安娜']) await retakeCards.nth(4).locator('.quiz-order-items').getByRole('button', { name: token }).click();
    await retakeCards.nth(4).getByRole('button', { name: 'Перевірити' }).click();
    quizStorage = await page.evaluate(() => JSON.parse(localStorage.getItem('chineseUaLearningProgressV1')));
    assert.equal(quizStorage.quizResults.length, 1, 'retake should update the latest lesson score, not append duplicates');
    assert.equal(quizStorage.quizResults[0].score, 5);
    assert.equal(quizStorage.lessons[0].completed, true, 'quiz and lesson completion must stay independent');

    await page.goto(`${baseUrl}/hsk/hsk1/lesson-4/`);
    const falseQuestion = page.locator('[data-quiz] .quiz-question').nth(2);
    await falseQuestion.locator('input[type="radio"]').nth(1).check();
    await falseQuestion.getByRole('button', { name: 'Перевірити' }).click();
    assert.match(await falseQuestion.locator('.quiz-feedback').textContent(), /^Правильно\./, 'false true/false answer should work');
    await page.setViewportSize({ width: 320, height: 812 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'quiz should not overflow on a 320px mobile viewport');

    await page.evaluate(() => {
      localStorage.setItem('chineseUaLearningProgressV1', JSON.stringify({
        lessons: [{ slug: 'lesson-2', completed: true, completedAt: '2026-02-01T00:00:00.000Z' }],
        knownWords: [],
        quizResults: [{ slug: 'lesson-2', score: 3, total: 5, percentage: 60, completedAt: '2026-02-02T00:00:00.000Z' }],
      }));
    });
    await page.goto(`${baseUrl}/tools/flashcards/`);
    const flashcard = page.locator('[data-flashcard-app]');
    const face = page.locator('[data-flashcard-front]');
    assert.equal(await flashcard.count(), 1, 'flashcards page should initialize');
    assert.equal(await page.locator('[data-flashcard-progress]').textContent(), 'Картка 1 з 53 · Вивчено: 0 / 53');
    assert.equal(await face.locator('[lang="zh-CN"]').textContent(), '你好');
    assert.equal(await page.locator('[data-flashcard-back]').isVisible(), false, 'answer should be hidden on the front');
    assert.equal(await page.locator('[data-flashcard-back]').getByText('привіт').count(), 2, 'answer and example translation should be in the hidden back face');
    await face.click();
    assert.equal(await page.locator('[data-flashcard-back]').isVisible(), true, 'flip button should reveal the answer');
    assert.equal(await page.locator('[data-flashcard-back] [lang="zh-Latn"]').first().textContent(), 'nǐ hǎo');
    assert.equal(await page.locator('[data-flashcard-back] [data-speak]').isVisible(), true, 'back should have the Chinese speech control');
    await page.locator('[data-next]').click();
    assert.equal(await page.locator('[data-flashcard-front] [lang="zh-CN"]').textContent(), '您好', 'next should advance one card');
    await page.locator('[data-previous]').click();
    assert.equal(await page.locator('[data-flashcard-front] [lang="zh-CN"]').textContent(), '你好', 'previous should return to the prior card');
    await page.locator('[data-flashcard-front]').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('[data-flashcard-back]').isVisible(), true, 'Space on the flip control should reveal the card');
    await page.locator('.flashcard-shortcuts').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-flashcard-front] [lang="zh-CN"]').textContent(), '您好', 'ArrowRight should advance when focus is outside controls');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('[data-flashcard-front] [lang="zh-CN"]').textContent(), '你好', 'ArrowLeft should go back when focus is outside controls');
    await page.locator('[data-next]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-flashcard-front] [lang="zh-CN"]').textContent(), '你好', 'arrow shortcuts should not fire while a button is focused');

    await page.locator('[data-topic-filter]').selectOption('family');
    assert.equal(await page.locator('[data-flashcard-progress]').textContent(), 'Картка 1 з 6 · Вивчено: 0 / 6', 'topic filter should scope the current words');
    await page.locator('[data-review-mode]').selectOption('known');
    assert.equal(await page.locator('[data-empty-message]').textContent(), 'Ви ще не позначили жодного слова як вивчене.');
    await page.locator('[data-start-review]').click();
    await page.locator('[data-topic-filter]').selectOption('all');
    await page.locator('[data-review-mode]').selectOption('unknown');
    assert.equal(await page.locator('[data-flashcard-progress]').textContent(), 'Картка 1 з 53 · Вивчено: 0 / 53');
    await page.locator('[data-review-mode]').selectOption('all');
    await page.locator('[data-flashcard-front]').click();
    await page.locator('[data-mark-word="known"]').click();
    let flashProgress = await page.evaluate(() => JSON.parse(localStorage.getItem('chineseUaLearningProgressV1')));
    assert.deepEqual(flashProgress.knownWords, ['greetings:你好'], 'known words should use stable topic:hanzi IDs');
    assert.equal(flashProgress.lessons[0].slug, 'lesson-2', 'flashcard updates must preserve lesson progress');
    assert.equal(flashProgress.quizResults[0].score, 3, 'flashcard updates must preserve quiz results');
    await page.goto(baseUrl);
    assert.equal(await page.locator('[data-known-total]').textContent(), '1', 'homepage learned-word statistic should update from knownWords');
    await page.goto(`${baseUrl}/tools/flashcards/`);
    await page.locator('[data-topic-filter]').selectOption('greetings');
    await page.locator('[data-review-mode]').selectOption('unknown');
    assert.equal(await page.locator('[data-flashcard-progress]').textContent(), 'Картка 1 з 5 · Вивчено: 1 / 6', 'unknown mode should exclude learned cards');
    await page.locator('[data-review-mode]').selectOption('known');
    assert.equal(await page.locator('[data-flashcard-progress]').textContent(), 'Картка 1 з 1 · Вивчено: 1 / 6');
    await page.locator('[data-flashcard-front]').click();
    await page.locator('[data-mark-word="unknown"]').click();
    flashProgress = await page.evaluate(() => JSON.parse(localStorage.getItem('chineseUaLearningProgressV1')));
    assert.deepEqual(flashProgress.knownWords, [], 'marking unknown should remove an existing learned ID');
    await page.reload();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('chineseUaLearningProgressV1')).lessons), flashProgress.lessons);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('chineseUaLearningProgressV1')).quizResults), flashProgress.quizResults);

    await page.locator('[data-topic-filter]').selectOption('all');
    await page.locator('[data-review-mode]').selectOption('all');
    await page.evaluate(() => { Math.random = () => 0; });
    const beforeShuffle = await page.locator('[data-flashcard-front] [lang="zh-CN"]').textContent();
    await page.locator('[data-shuffle]').click();
    const afterShuffle = await page.locator('[data-flashcard-front] [lang="zh-CN"]').textContent();
    assert.notEqual(afterShuffle, beforeShuffle, 'shuffle should change the current card order without editing vocabulary data');
    await page.goto(baseUrl);
    assert.equal(await page.locator('[data-known-total]').textContent(), '0', 'homepage should show current learned word count after removals');
    await page.goto(`${baseUrl}/tools/flashcards/`);
    await page.evaluate(() => {
      const progress = JSON.parse(localStorage.getItem('chineseUaLearningProgressV1'));
      progress.knownWords = JSON.parse(document.querySelector('[data-flashcard-app]').dataset.words).filter(word => word.topic === 'greetings').map(word => word.id);
      localStorage.setItem('chineseUaLearningProgressV1', JSON.stringify(progress));
    });
    await page.locator('[data-topic-filter]').selectOption('greetings');
    await page.locator('[data-review-mode]').selectOption('unknown');
    assert.equal(await page.locator('[data-empty-message]').textContent(), 'Чудово! Ви позначили всі слова цієї теми як вивчені.');
    await page.goto(baseUrl);
    await page.evaluate(() => localStorage.setItem('chineseUaLearningProgressV1', JSON.stringify({ lessons: [], knownWords: ['greetings:你好'], quizResults: [] })));
    await page.reload();
    assert.equal(await page.locator('[data-known-total]').textContent(), '1', 'homepage learned-word statistic should read knownWords');
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${baseUrl}/tools/flashcards/`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `flashcards should not overflow at ${width}px`);
    }

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
      if (route === '/tools/flashcards/') await speechPage.locator('[data-flashcard-front]').click();
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
    await noJs.goto(`${baseUrl}/tools/flashcards/`);
    assert.equal(await noJs.locator('h1').textContent(), 'Картки для вивчення китайських слів');
    assert.equal(await noJs.locator('a.flashcard-return[href="/vocabulary/"]').count(), 1, 'flashcards should provide a vocabulary link without JavaScript');
    assert.equal(await noJs.locator('.flashcard-noscript').isVisible(), true, 'flashcards should explain the JavaScript requirement');
    assert.deepEqual(errors, []);
    console.log(`PASS: ${routes.length} pages, all internal links, metadata, sitemap, redirects, four viewport widths, menu, copy, and ${[...htmlByRoute.values()].join('').match(/data-speak=/g)?.length || 0} audio controls.`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
