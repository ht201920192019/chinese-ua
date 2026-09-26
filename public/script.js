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
      quizResults: Array.isArray(saved.quizResults) ? saved.quizResults.filter(item => item && typeof item.slug === 'string') : [],
    };
  } catch { return { lessons: [], knownWords: [], quizResults: [] }; }
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

function initializeQuiz(quizElement) {
  let questions;
  try { questions = JSON.parse(quizElement.dataset.quizData); }
  catch { return; }
  if (!Array.isArray(questions) || !questions.length) return;
  const slug = quizElement.dataset.lessonSlug;
  const cards = quizElement.querySelector('[data-quiz-questions]');
  const progressLabel = quizElement.querySelector('[data-quiz-progress]');
  const resultPanel = quizElement.querySelector('[data-quiz-result]');
  const scoreLabel = quizElement.querySelector('[data-quiz-score]');
  const resultFeedback = quizElement.querySelector('[data-quiz-feedback]');
  const restartButton = quizElement.querySelector('[data-quiz-restart]');
  const answers = questions.map(() => ({ value: null, checked: false, correct: false }));
  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const setProgress = () => {
    const count = answers.filter(answer => answer.checked).length;
    progressLabel.textContent = count === questions.length
      ? 'Усі запитання перевірено.'
      : `Відповіді: ${count} з ${questions.length}`;
  };
  const displayAnswer = question => {
    if (question.type === 'single-choice') return question.options[question.correct];
    if (question.type === 'true-false') return question.correct ? 'Так' : 'Ні';
    if (question.type === 'fill-blank') return question.displayAnswer;
    return question.correctOrder.join(' → ');
  };
  const saveResult = score => {
    const progress = readLearningProgress();
    const total = questions.length;
    const result = { slug, score, total, percentage: Math.round(score / total * 100), completedAt: new Date().toISOString() };
    progress.quizResults = [...progress.quizResults.filter(item => item.slug !== slug), result];
    if (saveLearningProgress(progress)) announce(`Результат ${score} з ${total} збережено на цьому пристрої.`);
  };
  const showResult = () => {
    if (!answers.every(answer => answer.checked)) {
      resultPanel.hidden = true;
      return;
    }
    const score = answers.filter(answer => answer.correct).length;
    const percentage = Math.round(score / questions.length * 100);
    scoreLabel.textContent = `${score} / ${questions.length} · ${percentage}%`;
    resultFeedback.textContent = score === questions.length ? 'Відмінно!'
      : score === questions.length - 1 ? 'Дуже добре!'
        : score === 3 ? 'Добрий результат. Повторіть складні слова.'
          : 'Рекомендуємо повторити матеріал уроку.';
    resultPanel.hidden = false;
    saveResult(score);
  };

  function renderQuestion(index) {
    const question = questions[index];
    const state = answers[index];
    const card = make('article', 'quiz-question');
    card.dataset.questionIndex = String(index);
    card.append(make('h3', '', `Питання ${index + 1} з ${questions.length}`));
    const prompt = question.type === 'true-false' ? question.statement : question.question;
    const fieldset = make('fieldset', 'quiz-fieldset');
    fieldset.append(make('legend', '', prompt));
    const controls = make('div', 'quiz-controls');
    let focusTarget;

    if (question.type === 'single-choice' || question.type === 'true-false') {
      const options = question.type === 'single-choice' ? question.options : ['Так', 'Ні'];
      options.forEach((option, optionIndex) => {
        const label = make('label', 'quiz-option');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `quiz-${slug}-${index}`;
        input.value = String(optionIndex);
        input.checked = state.value === optionIndex;
        input.disabled = state.checked;
        input.addEventListener('change', () => { state.value = optionIndex; });
        label.append(input, make('span', '', option));
        controls.append(label);
        focusTarget ||= input;
      });
    } else if (question.type === 'fill-blank') {
      const label = make('label', 'quiz-text-label', 'Ваша відповідь');
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'quiz-text-input';
      input.autocomplete = 'off';
      input.value = state.value || '';
      input.disabled = state.checked;
      input.addEventListener('input', () => { state.value = input.value; });
      label.append(input);
      controls.append(label);
      focusTarget = input;
    } else if (question.type === 'sentence-order') {
      if (!Array.isArray(state.value)) state.value = [];
      const selected = make('div', 'quiz-order-answer');
      selected.setAttribute('aria-label', 'Складене речення');
      selected.setAttribute('aria-live', 'polite');
      const candidates = make('div', 'quiz-order-items');
      candidates.setAttribute('aria-label', 'Доступні слова');
      const orderActions = make('div', 'quiz-order-actions');
      const renderOrder = () => {
        selected.replaceChildren();
        if (!state.value.length) selected.append(make('span', 'quiz-order-placeholder', 'Натискайте слова в потрібному порядку'));
        state.value.forEach((itemIndex, position) => {
          const token = make('button', 'quiz-token selected', question.items[itemIndex]);
          token.type = 'button';
          token.disabled = state.checked;
          token.setAttribute('aria-label', `Прибрати слово ${question.items[itemIndex]} з позиції ${position + 1}`);
          token.addEventListener('click', () => { state.value.splice(position, 1); renderOrder(); });
          selected.append(token);
        });
        candidates.replaceChildren();
        question.items.forEach((item, itemIndex) => {
          if (state.value.includes(itemIndex)) return;
          const token = make('button', 'quiz-token', item);
          token.type = 'button';
          token.disabled = state.checked;
          token.addEventListener('click', () => { state.value.push(itemIndex); renderOrder(); });
          candidates.append(token);
          focusTarget ||= token;
        });
        undo.disabled = state.checked || !state.value.length;
        clear.disabled = state.checked || !state.value.length;
      };
      const undo = make('button', 'button secondary quiz-small-button', 'Скасувати останнє');
      undo.type = 'button';
      undo.disabled = state.checked || !state.value.length;
      undo.addEventListener('click', () => { state.value.pop(); renderOrder(); undo.disabled = !state.value.length; });
      const clear = make('button', 'button secondary quiz-small-button', 'Очистити');
      clear.type = 'button';
      clear.disabled = state.checked || !state.value.length;
      clear.addEventListener('click', () => { state.value = []; renderOrder(); undo.disabled = true; clear.disabled = true; });
      orderActions.append(undo, clear);
      controls.append(selected, candidates, orderActions);
      renderOrder();
    } else return;

    fieldset.append(controls);
    card.append(fieldset);
    const feedback = make('p', 'quiz-feedback');
    feedback.setAttribute('aria-live', 'polite');
    feedback.setAttribute('aria-atomic', 'true');
    if (state.checked) {
      feedback.classList.add(state.correct ? 'is-correct' : 'is-incorrect');
      feedback.textContent = state.correct
        ? `Правильно. ${question.explanation}`
        : `Неправильно. Правильна відповідь: ${displayAnswer(question)}. ${question.explanation}`;
    }
    card.append(feedback);
    const actions = make('div', 'quiz-actions');
    const check = make('button', 'button primary', 'Перевірити');
    check.type = 'button';
    check.hidden = state.checked;
    check.addEventListener('click', () => {
      let hasAnswer = false;
      if (question.type === 'single-choice' || question.type === 'true-false') hasAnswer = Number.isInteger(state.value);
      else if (question.type === 'fill-blank') hasAnswer = typeof state.value === 'string' && state.value.trim().length > 0;
      else hasAnswer = Array.isArray(state.value) && state.value.length === question.items.length;
      if (!hasAnswer) {
        feedback.classList.remove('is-correct', 'is-incorrect');
        feedback.textContent = 'Спочатку надайте відповідь.';
        if (focusTarget) focusTarget.focus();
        return;
      }
      if (question.type === 'single-choice') state.correct = state.value === question.correct;
      else if (question.type === 'true-false') state.correct = (state.value === 0) === question.correct;
      else if (question.type === 'fill-blank') {
        const normalized = state.value.trim().replace(/[\s\u00a0]+/gu, '');
        state.correct = question.answer.some(answer => normalized === answer.trim().replace(/[\s\u00a0]+/gu, ''));
      } else {
        const chosen = state.value.map(itemIndex => question.items[itemIndex]);
        state.correct = chosen.length === question.correctOrder.length && chosen.every((item, i) => item === question.correctOrder[i]);
      }
      state.checked = true;
      renderQuestion(index);
      setProgress();
      showResult();
      quizElement.querySelector(`[data-question-index="${index}"] .quiz-retry`)?.focus({ preventScroll: true });
    });
    actions.append(check);
    const retry = make('button', 'button secondary quiz-small-button quiz-retry', 'Спробувати ще раз');
    retry.type = 'button';
    retry.hidden = !state.checked;
    retry.addEventListener('click', () => {
      answers[index] = { value: question.type === 'sentence-order' ? [] : null, checked: false, correct: false };
      renderQuestion(index);
      setProgress();
      resultPanel.hidden = true;
      quizElement.querySelector(`[data-question-index="${index}"] input, [data-question-index="${index}"] .quiz-token`)?.focus({ preventScroll: true });
    });
    actions.append(retry);
    card.append(actions);
    const oldCard = cards.querySelector(`[data-question-index="${index}"]`);
    if (oldCard) oldCard.replaceWith(card);
    else cards.append(card);
  }

  questions.forEach((_, index) => renderQuestion(index));
  setProgress();
  restartButton.addEventListener('click', () => {
    answers.forEach((_, index) => { answers[index] = { value: null, checked: false, correct: false }; });
    questions.forEach((_, index) => renderQuestion(index));
    setProgress();
    resultPanel.hidden = true;
    quizElement.querySelector('.quiz-question input, .quiz-question .quiz-token')?.focus({ preventScroll: true });
  });
}

document.querySelectorAll('[data-quiz]').forEach(initializeQuiz);

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

function bindSpeechButton(button) {
  if (button.dataset.speechBound) return;
  button.dataset.speechBound = 'true';
  button.hidden = false;
  button.addEventListener('click', () => speakChinese(button));
}

function initializeFlashcards(app) {
  let words;
  try { words = JSON.parse(app.dataset.words || '[]'); } catch { words = []; }
  if (!Array.isArray(words) || !words.length) return;
  const topicFilter = app.querySelector('[data-topic-filter]');
  const modeFilter = app.querySelector('[data-review-mode]');
  const shuffleButton = app.querySelector('[data-shuffle]');
  const progressLabel = app.querySelector('[data-flashcard-progress]');
  const stage = app.querySelector('[data-flashcard-stage]');
  const cardShell = app.querySelector('[data-flashcard-shell]');
  const emptyPanel = app.querySelector('[data-flashcard-empty]');
  const emptyMessage = app.querySelector('[data-empty-message]');
  const previousButton = app.querySelector('[data-previous]');
  const nextButton = app.querySelector('[data-next]');
  const startButton = app.querySelector('[data-start-review]');
  const topicNames = { all: 'Усі слова', greetings: 'Привітання', numbers: 'Числа', family: 'Сім’я', food: 'Їжа', transport: 'Транспорт', work: 'Робота' };
  let currentWords = [];
  let topicWords = [];
  let currentIndex = 0;
  let isShuffled = false;
  let isFlipped = false;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const knownSet = () => new Set(readLearningProgress().knownWords.filter(id => typeof id === 'string'));
  const showFace = flipped => {
    isFlipped = flipped;
    const front = cardShell.querySelector('[data-flashcard-front]');
    const back = cardShell.querySelector('[data-flashcard-back]');
    if (front) front.hidden = flipped;
    if (front) front.setAttribute('aria-expanded', String(flipped));
    if (back) back.hidden = !flipped;
  };

  const renderCard = () => {
    const word = currentWords[currentIndex];
    if (!word) return;
    const known = knownSet().has(word.id);
    const speechTargetId = `flashcard-${word.topic}-${[...word.hanzi].map(character => character.codePointAt(0).toString(16)).join('-')}`;
    const image = word.image ? `<span class="flashcard-image-frame"><img src="${escape(word.image)}" alt="${escape(word.imageAlt || '')}" loading="lazy" decoding="async" data-vocabulary-image></span>` : '';
    const example = word.example ? `<div class="flashcard-example"><b lang="zh-CN">${escape(word.example)}</b><span lang="zh-Latn">${escape(word.examplePinyin)}</span><span>${escape(word.exampleUk)}</span></div>` : '';
    cardShell.innerHTML = `<article class="flashcard-card" id="${escape(speechTargetId)}">
      <button type="button" class="flashcard-face" data-flashcard-front aria-expanded="false" aria-controls="flashcardBack">
        <span class="flashcard-topic">${escape(topicNames[word.topic] || word.topicTitle)}</span>${image}<b lang="zh-CN">${escape(word.hanzi)}</b><span class="flashcard-reveal">Показати відповідь</span>
      </button>
      <div class="flashcard-back" id="flashcardBack" data-flashcard-back hidden>
        <div class="flashcard-answer"><b lang="zh-CN">${escape(word.hanzi)}</b><span class="flashcard-pinyin" lang="zh-Latn">${escape(word.pinyin)}</span><span class="flashcard-meaning">${escape(word.uk)}</span><button class="audio-button flashcard-audio" type="button" data-speak="${escape(speechTargetId)}" hidden>▶ Прослухати</button>${example}</div>
        <button class="flashcard-hide" type="button" data-flip-back>Повернутися до слова</button>
        <div class="flashcard-learning" aria-label="Позначити знання слова"><button class="button secondary" type="button" data-mark-word="unknown" aria-pressed="${!known}">Ще не знаю</button><button class="button primary" type="button" data-mark-word="known" aria-pressed="${known}">Знаю</button></div>
      </div>
    </article>`;
    const front = cardShell.querySelector('[data-flashcard-front]');
    const vocabularyImage = cardShell.querySelector('[data-vocabulary-image]');
    if (vocabularyImage) vocabularyImage.addEventListener('error', () => vocabularyImage.closest('.flashcard-image-frame')?.remove(), { once: true });
    front.addEventListener('click', () => { showFace(true); cardShell.querySelector('[data-flip-back]').focus({ preventScroll: true }); });
    cardShell.querySelector('[data-flip-back]').addEventListener('click', () => { showFace(false); front.focus({ preventScroll: true }); });
    cardShell.querySelector('[data-flashcard-back]').addEventListener('click', event => {
      if (!event.target.closest('button')) { showFace(false); front.focus({ preventScroll: true }); }
    });
    cardShell.querySelectorAll('[data-mark-word]').forEach(button => button.addEventListener('click', () => {
      const progress = readLearningProgress();
      const ids = new Set(progress.knownWords.filter(id => typeof id === 'string'));
      if (button.dataset.markWord === 'known') ids.add(word.id);
      else ids.delete(word.id);
      progress.knownWords = [...ids];
      if (!saveLearningProgress(progress)) return;
      updateLearningProgress();
      announce(button.dataset.markWord === 'known' ? 'Слово додано до вивчених.' : 'Слово позначено для повторення.');
      refreshDeck(false);
    }));
    bindSpeechButton(cardShell.querySelector('[data-speak]'));
    showFace(false);
  };

  const render = () => {
    const known = knownSet();
    const learnedInTopic = topicWords.filter(word => known.has(word.id)).length;
    progressLabel.textContent = currentWords.length
      ? `Картка ${currentIndex + 1} з ${currentWords.length} · Вивчено: ${learnedInTopic} / ${topicWords.length}`
      : `Вивчено: ${learnedInTopic} / ${topicWords.length}`;
    if (!currentWords.length) {
      stage.hidden = true;
      emptyPanel.hidden = false;
      if (modeFilter.value === 'known') emptyMessage.textContent = 'Ви ще не позначили жодного слова як вивчене.';
      else if (modeFilter.value === 'unknown') emptyMessage.textContent = 'Чудово! Ви позначили всі слова цієї теми як вивчені.';
      else emptyMessage.textContent = 'У цій темі ще немає слів.';
      return;
    }
    emptyPanel.hidden = true;
    stage.hidden = false;
    renderCard();
  };

  function refreshDeck(resetShuffle = true) {
    if (resetShuffle) isShuffled = false;
    const known = knownSet();
    topicWords = words.filter(word => topicFilter.value === 'all' || word.topic === topicFilter.value);
    currentWords = modeFilter.value === 'known'
      ? topicWords.filter(word => known.has(word.id))
      : modeFilter.value === 'unknown' ? topicWords.filter(word => !known.has(word.id)) : [...topicWords];
    if (isShuffled) {
      for (let i = currentWords.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [currentWords[i], currentWords[j]] = [currentWords[j], currentWords[i]];
      }
    }
    currentIndex = Math.min(currentIndex, Math.max(0, currentWords.length - 1));
    render();
  }

  const changeCard = direction => {
    if (!currentWords.length) return;
    currentIndex = (currentIndex + direction + currentWords.length) % currentWords.length;
    render();
  };
  topicFilter.addEventListener('change', () => { currentIndex = 0; refreshDeck(); });
  modeFilter.addEventListener('change', () => { currentIndex = 0; refreshDeck(); });
  shuffleButton.addEventListener('click', () => { isShuffled = true; currentIndex = 0; refreshDeck(false); announce('Порядок карток перемішано.'); });
  previousButton.addEventListener('click', () => changeCard(-1));
  nextButton.addEventListener('click', () => changeCard(1));
  startButton.addEventListener('click', () => { modeFilter.value = 'all'; currentIndex = 0; refreshDeck(); });
  app.addEventListener('keydown', event => {
    if (event.target.closest('button, input, select, textarea, a, [contenteditable="true"]')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); changeCard(-1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); changeCard(1); }
    else if (event.key === ' ' || event.key === 'Enter') {
      if (event.target.closest('.flashcard-shortcuts')) { event.preventDefault(); showFace(!isFlipped); }
    }
  });
  const shortcuts = document.querySelector('.flashcard-shortcuts');
  if (shortcuts) shortcuts.addEventListener('click', () => showFace(!isFlipped));
  refreshDeck();
}

document.querySelectorAll('[data-flashcard-app]').forEach(initializeFlashcards);

if (speechAvailable) window.speechSynthesis.getVoices();
document.querySelectorAll('[data-speak]').forEach(bindSpeechButton);
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
