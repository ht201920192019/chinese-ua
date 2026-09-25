// Content and navigation remain available without JavaScript.
document.documentElement.classList.add('js');
const menuButton = document.getElementById('menuButton');
const navLinks = document.getElementById('navLinks');
const status = document.getElementById('actionStatus');
let statusTimer;
function announce(message) {
  clearTimeout(statusTimer);
  status.textContent = message;
  statusTimer = setTimeout(() => { status.textContent = ''; }, 10000);
}
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
window.matchMedia('(min-width: 861px)').addEventListener('change', () => setMenu(false));
const header = document.querySelector('.site-header');
function updateHeaderOffset() {
  document.documentElement.style.setProperty('--header-offset', `${header.offsetHeight + 16}px`);
}
updateHeaderOffset();
if ('ResizeObserver' in window) new ResizeObserver(updateHeaderOffset).observe(header);
else window.addEventListener('resize', updateHeaderOffset);

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
    announce('Цей браузер не підтримує озвучення. Ви можете прочитати піньїнь під фразою.');
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
    announce('Китайський голос ще не доступний. Спробуйте знову або додайте голос китайської мови в налаштуваннях пристрою.');
    return;
  }
  const phrase = document.getElementById(button.dataset.speak).querySelector('[lang="zh-CN"]');
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
    if (activeSpeech?.utterance === utterance) finishSpeech('Не вдалося відтворити звук. Перевірте голос і звук пристрою та спробуйте ще раз.');
  };
  speechTimer = setTimeout(() => {
    if (activeSpeech?.utterance === utterance) {
      finishSpeech('Озвучення не відповідає. Спробуйте ще раз.');
      window.speechSynthesis.cancel();
    }
  }, 20000);
  try { window.speechSynthesis.speak(utterance); }
  catch { finishSpeech('Не вдалося почати озвучення. Перевірте голос пристрою або спробуйте інший браузер.'); }
}
// Some browsers populate their voice list asynchronously after the first request.
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
copyButton.hidden = false;
copyButton.addEventListener('click', async () => {
  const source = document.getElementById('practicePhrase');
  const text = [...source.querySelectorAll('h2, p')].map(node => node.textContent.trim()).join('\n');
  const label = copyButton.textContent;
  copyButton.disabled = true;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    copyButton.textContent = 'Скопійовано ✓';
    announce('Фразу, піньїнь і переклад скопійовано.');
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(source);
    selection.removeAllRanges();
    selection.addRange(range);
    announce('Автоматичне копіювання недоступне. Текст виділено: скористайтеся командою «Копіювати» вашого пристрою.');
  } finally {
    setTimeout(() => {
      copyButton.textContent = label;
      copyButton.disabled = false;
    }, 1600);
  }
});
