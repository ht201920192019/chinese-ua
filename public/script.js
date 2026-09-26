// Keep every lesson readable when JavaScript is unavailable.
document.documentElement.classList.add('js');

const menuButton = document.getElementById('menuButton');
const navLinks = document.getElementById('navLinks');
const status = document.getElementById('actionStatus');
let statusTimer;

const progressStorageKey = 'chineseUaLearningProgressV1';
let courseLessons = [];
try { courseLessons = JSON.parse(document.body.dataset.hskLessons || '[]'); } catch { courseLessons = []; }

function readLearningProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(progressStorageKey) || '{}');
    return {
      lessons: Array.isArray(saved.lessons) ? saved.lessons.filter(item => item && typeof item.slug === 'string') : [],
      knownWords: Array.isArray(saved.knownWords) ? saved.knownWords : [],
    };
  } catch { return { lessons: [], knownWords: [] }; }
}

function saveLearningProgress(progress) {
  try { localStorage.setItem(progressStorageKey, JSON.stringify(progress)); return true; }
  catch { announce('Не вдалося зберегти прогрес у цьому браузері. Перевірте налаштування сховища.'); return false; }
}

function completedLessonMap(progress) {
  return new Map(progress.lessons.filter(item => item.completed === true).map(item => [item.slug, item]));
}

function updateLearningProgress() {
  const progress = readLearningProgress();
  const completed = completedLessonMap(progress);
  const count = courseLessons.filter(lesson => completed.has(lesson.slug)).length;
  const progressCount = document.querySelector('[data-progress-count]');
  const progressBar = document.querySelector('[role="progressbar"][aria-label="Прогрес курсу HSK 1"]');
  const progressFill = document.querySelector('[data-progress-fill]');
  if (progressCount) progressCount.textContent = `${count} / ${courseLessons.length} уроків завершено`;
  if (progressBar) progressBar.setAttribute('aria-valuenow', String(count));
  if (progressFill) progressFill.style.width = `${courseLessons.length ? count / courseLessons.length * 100 : 0}%`;

  const completeButton = document.getElementById('completeLesson');
  if (completeButton) {
    const isComplete = completed.has(completeButton.dataset.lessonSlug);
    completeButton.hidden = false;
    completeButton.setAttribute('aria-pressed', String(isComplete));
    completeButton.textContent = isComplete ? 'Урок завершено ✓' : 'Позначити урок як завершений';
  }

  const continueLink = document.querySelector('[data-continue-learning]');
  if (continueLink) {
    const nextLesson = courseLessons.find(lesson => !completed.has(lesson.slug));
    const latest = [...completed.values()].sort((a, b) => Date.parse(b.completedAt || 0) - Date.parse(a.completedAt || 0))[0];
    const prompt = document.querySelector('[data-dashboard-prompt]');
    const completedTotal = document.querySelector('[data-completed-total]');
    const knownTotal = document.querySelector('[data-known-total]');
    const recent = document.querySelector('[data-recent-lesson]');
    continueLink.href = nextLesson?.route || '/hsk/hsk1/';
    continueLink.textContent = count ? (nextLesson ? 'Продовжити навчання →' : 'Повторити курс HSK 1 →') : 'Почніть свій перший урок →';
    if (count) continueLink.setAttribute('aria-label', nextLesson ? `Продовжити навчання: ${nextLesson.title}` : 'Повторити курс HSK 1');
    if (prompt) prompt.textContent = count ? 'Продовжуйте з наступного уроку HSK 1' : 'Почніть свій перший урок';
    if (completedTotal) completedTotal.textContent = String(count);
    if (knownTotal) knownTotal.textContent = String(progress.knownWords.length);
    if (recent) recent.textContent = latest ? (courseLessons.find(lesson => lesson.slug === latest.slug)?.title || latest.slug) : 'Ще немає';
  }
}

const completeLessonButton = document.getElementById('completeLesson');
if (completeLessonButton) completeLessonButton.addEventListener('click', () => {
  const progress = readLearningProgress();
  const slug = completeLessonButton.dataset.lessonSlug;
  const oldRecord = progress.lessons.find(item => item.slug === slug);
  const complete = oldRecord?.completed !== true;
  const record = { slug, completed: complete, completedAt: complete ? new Date().toISOString() : null };
  progress.lessons = [...progress.lessons.filter(item => item.slug !== slug), record];
  if (saveLearningProgress(progress)) {
    updateLearningProgress();
    announce(complete ? 'Урок позначено як завершений. Прогрес збережено на цьому пристрої.' : 'Урок знову позначено як незавершений.');
  }
});
updateLearningProgress();

function announce(message) {
  if (!status) return;
  clearTimeout(statusTimer);
  status.textContent = message;
  statusTimer = setTimeout(() => { status.textContent = ''; }, 10000);
}

if (menuButton && navLinks) {
  function setMenu(open) {
    navLinks.classList.toggle('open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Закрити меню' : 'Відкрити меню');
  }
  menuButton.hidden = false;
  menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
  navLinks.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      menuButton.focus();
    }
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.site-header')) setMenu(false);
  });
  const breakpoint = window.matchMedia('(min-width: 861px)');
  const closeMenu = () => setMenu(false);
  if (breakpoint.addEventListener) breakpoint.addEventListener('change', closeMenu);
  else breakpoint.addListener(closeMenu);
  const header = document.querySelector('.site-header');
  if (header) {
    const updateHeaderOffset = () => document.documentElement.style.setProperty('--header-offset', `${header.offsetHeight + 16}px`);
    updateHeaderOffset();
    if ('ResizeObserver' in window) new ResizeObserver(updateHeaderOffset).observe(header);
    else window.addEventListener('resize', updateHeaderOffset);
  }
}

const speechAvailable = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
let activeSpeech;
let speechTimer;

function finishSpeech(message = '') {
  clearTimeout(speechTimer);
  if (activeSpeech) {
    activeSpeech.button.textContent = activeSpeech.label;
    activeSpeech.button.removeAttribute('aria-pressed');
    activeSpeech = null;
  }
  if (message) announce(message);
}

function speakChinese(button) {
  if (!speechAvailable) {
    announce('Цей браузер не підтримує озвучення. Ви можете прочитати Pinyin під фразою.');
    return;
  }
  const sameButton = activeSpeech?.button === button;
  finishSpeech();
  window.speechSynthesis.cancel();
  if (sameButton) {
    announce('Озвучення зупинено.');
    return;
  }
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find(item => /^zh[-_]CN$/i.test(item.lang))
    || voices.find(item => /^zh[-_](TW|SG)$/i.test(item.lang));
  if (!voice) {
    announce('Китайський голос ще не доступний. Додайте голос китайської мови в налаштуваннях пристрою та спробуйте знову.');
    return;
  }
  const phrase = document.getElementById(button.dataset.speak)?.querySelector('[lang="zh-CN"]');
  if (!phrase) {
    announce('Не вдалося знайти китайський текст для озвучення.');
    return;
  }
  const utterance = new SpeechSynthesisUtterance(phrase.textContent.trim());
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.rate = 0.8;
  activeSpeech = { button, label: button.textContent, utterance };
  button.textContent = '■ Зупинити';
  button.setAttribute('aria-pressed', 'true');
  announce('Підготовка озвучення…');
  utterance.onstart = () => {
    if (activeSpeech?.utterance === utterance) announce('Відтворюється китайська фраза. Натисніть ще раз, щоб зупинити.');
  };
  utterance.onend = () => {
    if (activeSpeech?.utterance === utterance) finishSpeech('Озвучення завершено.');
  };
  utterance.onerror = () => {
    if (activeSpeech?.utterance === utterance) finishSpeech('Не вдалося відтворити звук. Перевірте голос і звук пристрою.');
  };
  speechTimer = setTimeout(() => {
    if (activeSpeech?.utterance === utterance) {
      finishSpeech('Озвучення не відповідає. Спробуйте ще раз.');
      window.speechSynthesis.cancel();
    }
  }, 20000);
  try { window.speechSynthesis.speak(utterance); }
  catch { finishSpeech('Не вдалося почати озвучення. Спробуйте інший браузер або голос.'); }
}

if (speechAvailable) window.speechSynthesis.getVoices();
document.querySelectorAll('[data-speak]').forEach(button => {
  button.hidden = false;
  button.addEventListener('click', () => speakChinese(button));
});
window.addEventListener('pagehide', () => {
  finishSpeech();
  if (speechAvailable) window.speechSynthesis.cancel();
});

const copyButton = document.getElementById('copyDaily');
if (copyButton) {
  const source = document.getElementById('dailyQuote');
  copyButton.hidden = false;
  copyButton.addEventListener('click', async () => {
    const text = [...source.querySelectorAll('[lang="zh-CN"], .reading, .translation')].map(node => node.textContent.trim()).join('\n');
    const label = copyButton.textContent;
    copyButton.disabled = true;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      copyButton.textContent = 'Скопійовано ✓';
      announce('Фразу, Pinyin і переклад скопійовано.');
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(source);
      selection.removeAllRanges();
      selection.addRange(range);
      announce('Текст виділено. Скопіюйте його командою вашого пристрою.');
    } finally {
      setTimeout(() => {
        copyButton.textContent = label;
        copyButton.disabled = false;
      }, 1600);
    }
  });
}
