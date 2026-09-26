const fs = require('node:fs');
const path = require('node:path');
const { vocabulary, grammar, dialogues, hskLessons, pinyinPages, hubs, characters } = require('../src/site-data.cjs');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public');
const domain = 'https://chinese-ua.pp.ua';
const nav = [
  ['/', 'Головна'],
  ['/chinese-for-beginners/', 'Китайська з нуля'],
  ['/hsk/', 'HSK'],
  ['/vocabulary/', 'Слова'],
  ['/grammar/', 'Граматика'],
  ['/dialogues/', 'Діалоги'],
  ['/china/', 'Культура'],
];

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const urlFor = route => `${domain}${route === '/' ? '/' : route.startsWith('/') ? route : `/${route}`}`;
const slugId = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function header(route) {
  const currentPath = route === '/' ? '/' : route.startsWith('/') ? route : `/${route}`;
  const links = nav.map(([href, label]) => {
    const active = href === currentPath || (href !== '/' && currentPath.startsWith(href));
    return `<a href="${href}"${active ? ' aria-current="page"' : ''}>${label}</a>`;
  }).join('');
  return `<a class="skip-link" href="#content">Перейти до вмісту</a>
  <header class="site-header"><div class="container nav-wrap">
    <a class="brand" href="/" aria-label="Chinese UA — головна"><span class="brand-mark">中</span><span><strong>Chinese UA</strong><small>Китайська для українців</small></span></a>
    <button type="button" class="menu-button" id="menuButton" aria-label="Відкрити меню" aria-expanded="false" aria-controls="navLinks" hidden>☰</button>
    <nav id="navLinks" class="nav-links" aria-label="Основна навігація">${links}</nav>
  </div></header>`;
}

function footer() {
  return `<footer class="site-footer"><div class="container footer-grid">
    <div class="footer-brand"><a href="/" class="footer-logo">Chinese UA</a><p>Китайська мова для українців.</p><span>中文 · Українська</span></div>
    <div><h2>Навчання</h2><a href="/hsk/">HSK</a><a href="/pinyin/">Pinyin</a><a href="/grammar/">Граматика</a><a href="/vocabulary/">Слова</a></div>
    <div><h2>Практика</h2><a href="/dialogues/">Діалоги</a><a href="/tools/#hsk-test">Тести</a><a href="/tools/#flashcards">Картки</a></div>
    <div><h2>Chinese UA</h2><a href="/about/">Про проєкт</a><a href="/contact/">Контакт</a><a href="/privacy/">Конфіденційність</a><a href="/terms/">Умови</a></div>
  </div><div class="container footer-bottom"><span>Навчальні матеріали українською</span><span>© Chinese UA</span></div></footer>
  <p id="actionStatus" class="action-status" role="status" aria-live="polite" aria-atomic="true"></p>`;
}

function breadcrumbs(route) {
  if (route === '/') return '';
  const pieces = route.split('/').filter(Boolean);
  const items = [['/', 'Головна']];
  for (let i = 1; i <= pieces.length; i++) {
    const key = `${pieces.slice(0, i).join('/')}/`;
    const page = pageByRoute.get(key);
    if (page) items.push([`/${key}`, page.title]);
  }
  return `<nav class="breadcrumbs" aria-label="Навігаційний шлях">${items.map(([href, label], i) => `${i ? '<span aria-hidden="true">/</span>' : ''}${i === items.length - 1 ? `<span aria-current="page">${esc(label)}</span>` : `<a href="${href}">${esc(label)}</a>`}`).join('')}</nav>`;
}

function head(page, route) {
  const canonical = urlFor(route);
  const description = page.description || `${page.title} — урок китайської мови українською з Pinyin, прикладами та практикою. Chinese UA.`;
  const title = `${page.title} | Chinese UA`;
  const crumbItems = route === '/' ? [] : [['Головна', '/'], ...route.split('/').filter(Boolean).map((part, index, parts) => {
    const current = `${parts.slice(0, index + 1).join('/')}/`;
    return [pageByRoute.get(current)?.title || part, current];
  })];
  const breadcrumbSchema = crumbItems.length ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbItems.map(([name, item], index) => ({ '@type': 'ListItem', position: index + 1, name, item: urlFor(item) })) })}</script>` : '';
  return `<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${esc(description)}" />
  <meta name="theme-color" content="#0f172a" />
  <title>${esc(title)}</title>
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="${route === '/' ? 'website' : 'article'}" />
  <meta property="og:locale" content="uk_UA" />
  <meta property="og:site_name" content="Chinese UA" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${canonical}" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/styles.css" />
  ${breadcrumbSchema}
</head>`;
}

function shell(page, route, body) {
  const lessons = hskLessons.map(lesson => ({ slug: lesson.slug, title: lesson.title, route: `/hsk/hsk1/${lesson.slug}/` }));
  return `<!doctype html><html lang="uk">${head(page, route)}<body data-hsk-lessons="${esc(JSON.stringify(lessons))}">${header(route)}<main id="content" class="${route === '/' ? 'home-main' : 'article-page'}">${body}</main>${footer()}<script src="/script.js" defer></script></body></html>\n`;
}

function toc(sections) {
  if (!sections?.length) return '';
  return `<details class="article-index"><summary>Навігація по сторінці <span>${sections.length} розділів</span></summary><nav aria-label="Розділи сторінки">${sections.map(section => `<a href="#${section.id}">${esc(section.title)}</a>`).join('')}</nav></details>`;
}

function pageIntro(page, route, eyebrow = '') {
  return `${breadcrumbs(route)}${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}<h1>${esc(page.title)}</h1><p class="article-lead">${esc(page.lead || page.description)}</p>`;
}

function renderSections(sections) {
  const indexed = sections.map((section, index) => ({ ...section, id: section.id || slugId(section.title) || `section-${index + 1}` }));
  return { index: toc(indexed), content: indexed.map(section => `<section id="${section.id}" class="article-section"><h2>${esc(section.title)}</h2>${section.html || `<p>${esc(section.text)}</p>`}</section>`).join('') };
}

function cards(items, columns = 'three') {
  return `<div class="cards ${columns} hub-cards">${items.map(item => item.route
    ? `<a class="hub-card" href="/${item.route}"><span class="hub-card-icon" aria-hidden="true">↗</span><h2>${esc(item.title)}</h2><p>${esc(item.text)}</p><span class="hub-card-link">Відкрити →</span></a>`
    : `<article class="hub-card planned-card"><span class="hub-card-icon" aria-hidden="true">✦</span><h2>${esc(item.title)}</h2><p>${esc(item.text)}</p><span class="planned-label">Матеріал готується</span></article>`).join('')}</div>`;
}

function wordCard(item, id, showExample = true) {
  const example = showExample && item.example ? `<div class="word-example"><span class="example-label">Приклад</span><b lang="zh-CN">${esc(item.example)}</b><span class="reading" lang="zh-Latn">${esc(item.examplePinyin)}</span><span>${esc(item.exampleUk)}</span></div>` : '';
  return `<article class="word-card learning-item" id="${esc(id)}"><b lang="zh-CN">${esc(item.hanzi)}</b><span class="reading" lang="zh-Latn">${esc(item.pinyin)}</span><span>${esc(item.uk)}</span><button type="button" class="audio-button" data-speak="${esc(id)}" hidden>▶ Прослухати</button>${example}</article>`;
}

function renderHub(page, route) {
  const sections = renderSections((page.sections || []).map(([title, text]) => ({ title, text })));
  const content = page.cards ? cards(page.cards) : '';
  const links = page.links ? `<nav class="related-links" aria-label="Пов’язані навчальні сторінки">${page.links.map(target => `<a class="button secondary" href="/${target}">${esc(pageByRoute.get(target)?.title || target)} →</a>`).join('')}</nav>` : '';
  const special = route === 'tools/' ? `<div id="hsk-test" class="tool-slot"><h2>Тест HSK</h2><p>Завдання для самоперевірки з’являться разом із наступними матеріалами курсу.</p></div><div id="flashcards" class="tool-slot"><h2>Картки для повторення</h2><p>Поки що слова можна повторювати у тематичних словниках.</p></div>`
    : route === 'hsk/hsk1/' ? `<section class="course-progress" data-course-progress aria-labelledby="courseProgressTitle"><h2 id="courseProgressTitle">Прогрес курсу</h2><p><span data-progress-count>0 / ${hskLessons.length} уроків завершено</span></p><div class="progress-track" role="progressbar" aria-label="Прогрес курсу HSK 1" aria-valuemin="0" aria-valuemax="${hskLessons.length}" aria-valuenow="0"><span class="progress-fill" data-progress-fill></span></div></section>`
    : route === 'characters/' ? `<section id="basic-characters" class="article-section"><h2>50 базових ієрогліфів</h2><div class="cards three vocabulary-grid">${characters.map((item, index) => wordCard(item, `character-${index + 1}`, false)).join('')}</div></section>`
    : route === 'hsk/' ? `<section class="article-section"><h2>Навчальний шлях за рівнями</h2><div class="cards three level-grid"><a class="hub-card" id="level-hsk1" href="/hsk/hsk1/"><span class="hub-card-icon">01</span><h2>HSK 1</h2><p>П’ять початкових уроків уже доступні.</p><span class="hub-card-link">Почати курс →</span></a><article class="hub-card planned-card" id="level-hsk2"><span class="hub-card-icon">02</span><h2>HSK 2</h2><p>Продовження базового курсу з новими темами й діалогами.</p><span class="planned-label">Наступний етап</span></article><article class="hub-card planned-card" id="level-hsk3"><span class="hub-card-icon">03</span><h2>HSK 3</h2><p>Перехід до довших розмов і ширшої лексики.</p><span class="planned-label">Заплановано</span></article></div></section>` : '';
  const body = `<div class="container article-layout">${pageIntro(page, route)}${sections.index}${sections.content}${content}${links}${special}</div>`;
  return shell(page, route, body);
}

function renderVocabulary(group) {
  const route = `vocabulary/${group.slug}/`;
  const page = pageByRoute.get(route);
  const intro = pageIntro(page, route, 'Словник за темою');
  const section = { id: 'word-list', title: 'Слова й приклади' };
  const cardsHtml = `<section id="word-list" class="article-section"><h2>Слова й приклади</h2><div class="cards three vocabulary-grid">${group.words.map((item, index) => wordCard(item, `vocab-${group.slug}-${index + 1}`)).join('')}</div></section>`;
  const related = `<nav class="lesson-next lesson-pager" aria-label="Пов’язані матеріали"><a href="/vocabulary/"><span>Усі теми</span>← До словника</a><a href="/dialogues/${group.slug === 'greetings' ? 'introduction' : group.slug === 'food' ? 'restaurant' : group.slug === 'transport' ? 'transport' : group.slug === 'numbers' ? 'shopping' : 'university'}/"><span>Практика</span>Перейти до діалогу →</a></nav>`;
  return shell(page, route, `<div class="container article-layout">${intro}${toc([section])}${cardsHtml}${related}</div>`);
}

function renderGrammar(item) {
  const route = `grammar/${item.slug}/`;
  const page = pageByRoute.get(route);
  const sections = [
    { id: 'usage', title: 'Як працює ця конструкція', text: item.role },
    { id: 'pattern', title: 'Модель речення', html: `<div class="grammar-box"><b>${esc(item.pattern)}</b></div>` },
    { id: 'examples', title: 'Приклади', html: `<div class="cards three vocabulary-grid">${item.examples.map((entry, index) => wordCard({ hanzi: entry.hanzi, pinyin: entry.pinyin, uk: entry.uk }, `grammar-${item.slug}-${index + 1}`, false)).join('')}</div>` },
    { id: 'mistakes', title: 'Поширена помилка', text: item.mistake },
    { id: 'practice', title: 'Вправа', html: `<p>${esc(item.exercise)}</p><details class="answer"><summary>Показати відповідь</summary><p>${esc(item.answer)}</p></details>` },
  ];
  const rendered = renderSections(sections);
  const related = `<nav class="related-links" aria-label="Пов’язані сторінки"><a class="button secondary" href="/grammar/">Уся граматика →</a><a class="button secondary" href="/hsk/hsk1/">Перейти до HSK 1 →</a></nav>`;
  return shell(page, route, `<div class="container article-layout">${pageIntro(page, route, 'Граматика китайської')}${rendered.index}${rendered.content}${related}</div>`);
}

function renderDialogue(item) {
  const route = `dialogues/${item.slug}/`;
  const page = pageByRoute.get(route);
  const dialog = `<section id="conversation" class="article-section"><h2>Репліки</h2><p>${esc(item.scene)}</p><div class="dialogue">${item.lines.map((line, index) => `<div class="bubble ${index % 2 ? 'right' : 'left'} learning-item" id="dialogue-${item.slug}-${index + 1}"><small>${index % 2 ? 'Співрозмовник B' : 'Співрозмовник A'}</small><b lang="zh-CN">${esc(line.hanzi)}</b><span class="reading" lang="zh-Latn">${esc(line.pinyin)}</span><span>${esc(line.uk)}</span><button type="button" class="audio-button" data-speak="dialogue-${item.slug}-${index + 1}" hidden>▶ Прослухати</button></div>`).join('')}</div></section>`;
  const practice = `<section id="practice" class="article-section"><h2>Практика</h2><p>Прочитайте діалог уголос, потім замініть одну репліку власною інформацією.</p><details class="answer"><summary>Показати підказку</summary><p>Повторіть кожну репліку за Pinyin, звертаючи увагу на знаки тонів.</p></details></section>`;
  const tocSections = [{ id: 'conversation', title: 'Діалог' }, { id: 'practice', title: 'Практика' }];
  return shell(page, route, `<div class="container article-layout">${pageIntro(page, route, 'Розмовна практика')}${toc(tocSections)}${dialog}${practice}<nav class="lesson-next"><a href="/dialogues/">← Усі діалоги</a></nav></div>`);
}

function renderLesson(lesson, index) {
  const route = `hsk/hsk1/${lesson.slug}/`;
  const page = pageByRoute.get(route);
  const wordSection = `<section id="words" class="article-section"><h2>1. Нові слова</h2><div class="cards three vocabulary-grid">${lesson.words.map((item, i) => wordCard(item, `hsk-${lesson.slug}-${i + 1}`, false)).join('')}</div></section>`;
  const grammarSection = `<section id="grammar" class="article-section"><h2>2. Граматика</h2><div class="grammar-box"><p>${esc(lesson.grammar)}</p></div></section>`;
  const dialogueSection = `<section id="dialogue" class="article-section"><h2>3. Діалог</h2><div class="dialogue">${lesson.dialogue.map((line, i) => `<div class="bubble ${i % 2 ? 'right' : 'left'} learning-item" id="lesson-${lesson.slug}-line-${i + 1}"><small>${i % 2 ? 'B' : 'A'}</small><b lang="zh-CN">${esc(line.hanzi)}</b><span class="reading" lang="zh-Latn">${esc(line.pinyin)}</span><span>${esc(line.uk)}</span><button type="button" class="audio-button" data-speak="lesson-${lesson.slug}-line-${i + 1}" hidden>▶ Прослухати</button></div>`).join('')}</div></section>`;
  const pronunciation = `<section id="pronunciation" class="article-section"><h2>4. Вимова</h2><p>${esc(lesson.pronunciation)}</p><a href="/pinyin/pronunciation-guide/">Типові помилки вимови →</a></section>`;
  const exercise = `<section id="practice" class="article-section"><h2>5. Вправи</h2><div class="exercise-card"><h3>Оберіть відповідь</h3><p>${esc(lesson.exercise)}</p><details class="answer"><summary>Перевірити відповідь</summary><p>${esc(lesson.answer)}</p></details></div><div class="exercise-card"><h3>Заповніть пропуск</h3><p>${esc(lesson.dialogue[0].hanzi)} → спробуйте відтворити фразу за українським перекладом.</p><details class="answer"><summary>Показати підказку</summary><p>${esc(lesson.dialogue[0].pinyin)} — ${esc(lesson.dialogue[0].uk)}</p></details></div><div class="exercise-card"><h3>Порядок слів</h3><p>Складіть фразу з карток у правильному порядку: ${lesson.dialogue.slice(0, 3).map(line => esc(line.hanzi)).join(' / ')}</p><details class="answer"><summary>Показати зразок</summary><p>Почніть із репліки A й прочитайте діалог послідовно.</p></details></div></section>`;
  const summary = `<section id="summary" class="article-section"><h2>6. Підсумок уроку</h2><div class="summary-box"><p>${esc(lesson.goal)}</p><p>Повторіть нові слова, прочитайте діалог і спробуйте скласти власне речення за моделлю уроку.</p></div></section>`;
  const names = [{ id: 'words', title: 'Нові слова' }, { id: 'grammar', title: 'Граматика' }, { id: 'dialogue', title: 'Діалог' }, { id: 'pronunciation', title: 'Вимова' }, { id: 'practice', title: 'Вправи' }, { id: 'summary', title: 'Підсумок' }];
  const previous = index ? `<a href="/hsk/hsk1/${hskLessons[index - 1].slug}/"><span>Попередній урок</span>← ${esc(hskLessons[index - 1].title)}</a>` : `<a href="/hsk/hsk1/"><span>Курс HSK 1</span>← До плану курсу</a>`;
  const next = index + 1 < hskLessons.length ? `<a href="/hsk/hsk1/${hskLessons[index + 1].slug}/"><span>Наступний урок</span>${esc(hskLessons[index + 1].title)} →</a>` : `<a href="/hsk/"><span>Курс завершено</span>Переглянути рівні HSK →</a>`;
  const courseNav = `<nav class="course-track" aria-label="Прогрес курсу"><span class="course-track-label">HSK 1 · урок ${index + 1} із ${hskLessons.length}</span>${hskLessons.map((entry, i) => `<a href="/hsk/hsk1/${entry.slug}/"${i === index ? ' aria-current="step"' : ''}>${i + 1}. ${esc(entry.title)}</a>`).join('')}</nav>`;
  const completion = `<div class="lesson-completion"><button type="button" class="button primary" id="completeLesson" data-lesson-slug="${esc(lesson.slug)}" hidden aria-pressed="false">Позначити урок як завершений</button></div>`;
  return shell(page, route, `<div class="container article-layout lesson-content">${pageIntro({ ...page, lead: lesson.goal }, route, `HSK 1 · Урок ${index + 1}`)}${courseNav}${toc(names)}${wordSection}${grammarSection}${dialogueSection}${pronunciation}${exercise}${summary}${completion}<nav class="lesson-next lesson-pager" aria-label="Перехід між уроками">${previous}${next}</nav></div>`);
}

function renderPinyin(item) {
  const route = `pinyin/${item.slug}/`;
  const page = pageByRoute.get(route);
  const sections = item.sections.map(([title, text], index) => ({ id: slugId(title) || `section-${index}`, title, text }));
  if (item.slug === 'tones') {
    const toneItems = [
      wordFor('妈', 'mā', 'мама'), wordFor('麻', 'má', 'коноплі'), wordFor('马', 'mǎ', 'кінь'), wordFor('骂', 'mà', 'сварити'),
    ];
    sections.unshift({ id: 'four-tones', title: 'Чотири тони на прикладі ma', html: `<div class="cards four tone-examples">${toneItems.map((entry, index) => wordCard(entry, `tone-${index + 1}`, false)).join('')}</div><div class="article-example learning-item"><b lang="zh-CN">吗</b><span class="reading" lang="zh-Latn">ma</span><span>частка запитання з нейтральним тоном</span></div>` });
  }
  const rendered = renderSections(sections);
  const related = `<nav class="related-links"><a class="button secondary" href="/pinyin/">← У центр Pinyin</a><a class="button primary" href="/hsk/hsk1/lesson-1/">Почати HSK 1 →</a></nav>`;
  return shell(page, route, `<div class="container article-layout">${pageIntro(page, route, 'Навчальний центр Pinyin')}${rendered.index}${rendered.content}${related}</div>`);
}

function wordFor(hanzi, pinyin, uk) {
  return { hanzi, pinyin, uk };
}

function renderHome() {
  const page = pageByRoute.get('/');
  const entries = [
    ['/chinese-for-beginners/', 'Китайська з нуля', 'Почніть з вимови, Pinyin та базових речень.'],
    ['/hsk/', 'HSK 1–3', 'Перегляньте рівні та почніть із п’яти уроків HSK 1.'],
    ['/dialogues/', 'Розмовна китайська', 'Практикуйте знайомство, покупки, ресторан і транспорт.'],
    ['/grammar/', 'Китайська граматика', 'Розберіть основні частки та моделі речень.'],
  ];
  const popular = [
    ['/pinyin/tones/', 'Як вимовляти китайські тони', 'Почніть із чотирьох тонів і нейтрального тону.'],
    ['/dialogues/introduction/', 'Як привітатися китайською', 'Прочитайте діалог знайомства з Pinyin і перекладом.'],
    ['/vocabulary/', 'Базові китайські слова за темами', 'Відкрийте шість тематичних словників.'],
    ['/grammar/shi/', 'Як будувати просте речення', 'Познайомтеся з моделлю речень із 是.'],
  ];
  const routeSteps = [
    ['/chinese-for-beginners/', 'З нуля'], ['/pinyin/', 'Pinyin'], ['/hsk/hsk1/', 'HSK 1'], ['/hsk/#level-hsk2', 'HSK 2'], ['/hsk/#level-hsk3', 'HSK 3'],
  ];
  const body = `<section class="hero"><div class="container hero-grid"><div><div class="eyebrow">🇺🇦 Українською · 🇨🇳 Китайською</div><h1>Китайська мова <span>для українців</span></h1><p class="hero-copy">Вивчайте китайську від нуля — з поясненнями українською.</p><p class="hero-support">Pinyin, вимова, HSK, граматика, слова та живі діалоги. Без потреби переходити через англійську.</p><div class="hero-actions"><a class="button primary" href="/chinese-for-beginners/">Почати з нуля</a><a class="button secondary" href="/hsk/hsk1/">Перейти до HSK 1</a></div></div><div class="hero-card learning-item" id="dailyQuote"><div class="card-label">Сьогоднішня фраза</div><b lang="zh-CN">我想学中文。</b><span class="reading" lang="zh-Latn">Wǒ xiǎng xué Zhōngwén.</span><span class="translation">Я хочу вивчати китайську мову.</span><div class="daily-actions"><button type="button" class="audio-button" data-speak="dailyQuote" hidden>▶ Прослухати</button><button type="button" class="button secondary copy-button" id="copyDaily" hidden>Копіювати фразу</button></div><small class="hint">Для озвучення потрібен китайський голос на вашому пристрої.</small></div></div></section>
  <section class="section learning-dashboard" aria-labelledby="learningTitle"><div class="container"><div class="section-heading"><span>00</span><div><h2 id="learningTitle">Ваше навчання</h2><p data-dashboard-prompt>Почніть свій перший урок</p></div></div><div class="dashboard-card" data-learning-dashboard><div class="dashboard-next"><span class="dashboard-label">Ваш наступний крок</span><a class="button primary" data-continue-learning href="/hsk/hsk1/lesson-1/">Почніть свій перший урок →</a></div><div class="dashboard-stats"><div><strong data-completed-total>0</strong><span>завершено уроків</span></div><div><strong data-known-total>0</strong><span>слів знаю</span></div><div class="dashboard-recent"><strong data-recent-lesson>Ще немає</strong><span>останній урок</span></div></div></div></div></section>
  <section class="section" id="start"><div class="container"><div class="section-heading"><span>01</span><div><h2>Оберіть свій шлях</h2><p>Короткі уроки з практикою та зрозумілою послідовністю.</p></div></div><div class="cards four entry-grid">${entries.map(([href, title, text]) => `<a class="entry-card" href="${href}"><span aria-hidden="true">→</span><h3>${title}</h3><p>${text}</p></a>`).join('')}</div></div></section>
  <section class="section soft"><div class="container"><div class="section-heading"><span>02</span><div><h2>Навчальний маршрут</h2><p>Кожен етап спирається на попередній; до пройдених уроків можна повертатися.</p></div></div><ol class="learning-path">${routeSteps.map(([href, title], index) => `<li><a href="${href}"><span>${index + 1}</span>${title}</a></li>`).join('')}</ol></div></section>
  <section class="section"><div class="container"><div class="section-heading"><span>03</span><div><h2>Популярні уроки</h2><p>Відповіді на часті запитання та перші кроки для розмови.</p></div></div>${cards(popular.map(([route, title, text]) => ({ route: route.replace(/^\//, ''), title, text })), 'two')}</div></section>
  <section class="section soft"><div class="container"><div class="section-heading"><span>04</span><div><h2>Навчайтеся українською</h2><p>Chinese UA створений спеціально для україномовних учнів.</p></div></div><div class="cards four feature-grid"><article class="feature-card"><h3>Пояснення українською</h3><p>Зрозумілі правила без англійської мови-посередника.</p></article><article class="feature-card"><h3>Три опори</h3><p>Китайські ієрогліфи + Pinyin + українське значення.</p></article><article class="feature-card"><h3>Практичні діалоги</h3><p>Слова й граматика одразу у справжніх ситуаціях.</p></article><article class="feature-card"><h3>Базові уроки безкоштовні</h3><p>Відкритий стартовий курс і тематичні матеріали.</p></article></div></div></section>`;
  return shell(page, '/', body);
}

const pageByRoute = new Map();
function addPage(route, title, description, lead = description) { pageByRoute.set(route, { route, title, description, lead }); }
addPage('/', 'Китайська мова для українців', 'Вивчайте китайську від нуля українською: Pinyin, HSK, граматика, тематичні слова й діалоги. Безкоштовні уроки Chinese UA.', 'Вивчайте китайську від нуля — з поясненнями українською.');
for (const page of hubs) addPage(page.route, page.title, page.description, page.lead);
for (const item of pinyinPages) addPage(`pinyin/${item.slug}/`, item.title, `${item.intro} Приклади й пояснення українською.`, item.intro);
for (const item of vocabulary) addPage(`vocabulary/${item.slug}/`, item.title, `${item.intro} Китайські ієрогліфи, Pinyin, переклад і приклади.`, item.intro);
for (const item of grammar) addPage(`grammar/${item.slug}/`, item.title, `${item.role} Модель, приклади, типові помилки та вправа українською.`, item.role);
for (const item of dialogues) addPage(`dialogues/${item.slug}/`, item.title, `${item.scene} Практикуйте китайську з Pinyin та українським перекладом.`, item.scene);
for (const lesson of hskLessons) addPage(`hsk/hsk1/${lesson.slug}/`, `Урок ${hskLessons.indexOf(lesson) + 1}: ${lesson.title}`, `${lesson.goal} Слова, граматика, діалог і вправи українською.`, lesson.goal);

function build() {
  const pages = [];
  pages.push({ route: '/', render: renderHome });
  for (const hub of hubs) pages.push({ route: hub.route, render: () => renderHub(hub, hub.route) });
  for (const item of pinyinPages) pages.push({ route: `pinyin/${item.slug}/`, render: () => renderPinyin(item) });
  for (const item of vocabulary) pages.push({ route: `vocabulary/${item.slug}/`, render: () => renderVocabulary(item) });
  for (const item of grammar) pages.push({ route: `grammar/${item.slug}/`, render: () => renderGrammar(item) });
  for (const item of dialogues) pages.push({ route: `dialogues/${item.slug}/`, render: () => renderDialogue(item) });
  hskLessons.forEach((lesson, index) => pages.push({ route: `hsk/hsk1/${lesson.slug}/`, render: () => renderLesson(lesson, index) }));

  for (const page of pages) {
    const relative = page.route === '/' ? 'index.html' : path.join(page.route, 'index.html');
    const destination = path.join(output, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, page.render(), 'utf8');
  }
  for (const legacyPage of ['pinyin-tones.html', 'first-phrases.html', 'numbers-prices.html']) {
    const legacyFile = path.join(output, legacyPage);
    if (fs.existsSync(legacyFile)) fs.unlinkSync(legacyFile);
  }
  const urls = pages.map(page => `  <url><loc>${urlFor(page.route)}</loc></url>`).join('\n');
  fs.writeFileSync(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, 'utf8');
  fs.writeFileSync(path.join(output, '_redirects'), [
    '/pinyin-tones.html /pinyin/tones/ 301',
    '/first-phrases.html /dialogues/introduction/ 301',
    '/numbers-prices.html /vocabulary/numbers/ 301',
  ].join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(output, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${domain}/sitemap.xml\n`, 'utf8');
  console.log(`Generated ${pages.length} HTML pages in public/.`);
}

module.exports = { build };
if (require.main === module) build();
