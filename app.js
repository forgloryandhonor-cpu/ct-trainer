(function () {
  'use strict';

  const Core = window.TestCore;
  const STORAGE_KEY = 'vd-lab.attempt.v1';
  const app = document.getElementById('app');
  const modalRoot = document.getElementById('modal-root');
  const toastElement = document.getElementById('toast');
  const topicNames = {
    analytical: 'Аналитические исследования', design: 'Дизайн исследований',
    descriptive: 'Описательные исследования', diagnostic: 'Диагностические тесты',
    treatment: 'Лечебные и профилактические препараты', indicators: 'Показатели в эпидемиологии',
    reviews: 'Систематические обзоры и метанализ', errors: 'Случайные и систематические ошибки',
    approach: 'Эпидемиологический подход'
  };
  let bank;
  let attempt = null;
  let screen = 'intro';
  let questions = [];
  let modal = null;
  let previousFocus = null;
  let scrollTimer;
  let toastTimer;
  let bankSearchTimer;
  let bankTopic = 'all';
  let bankQuery = '';
  let bankSearchIndex;
  let storageWarning = false;
  let lastNumber = 0;
  let startBusy = false;

  function escape(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function icon(name, extra) {
    return '<svg class="icon ' + (extra || '') + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  }
  function mark(extra) {
    return '<svg class="mark ' + (extra || '') + '" aria-hidden="true"><use href="#vd-mark"></use></svg>';
  }
  function plural(number, one, few, many) {
    const n = Math.abs(number) % 100;
    return number + ' ' + (n > 10 && n < 20 ? many : (n % 10 === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 ? few : many)));
  }
  function serial() { return String(attempt.number).padStart(2, '0'); }
  function scrollTop() { window.scrollTo(0, 0); }
  function scrollToElement(element) {
    if (!element) return;
    const sticky = app.querySelector('.test-header');
    const top = Math.max(0, element.getBoundingClientRect().top + window.scrollY - (sticky ? sticky.offsetHeight : 0) - 18);
    if (window.CSS && CSS.supports('scroll-behavior', 'smooth') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.scrollTo({ top: top, behavior: 'smooth' });
    } else window.scrollTo(0, top);
  }
  function focusHeading() {
    const heading = app.querySelector('h1');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
  }
  function setScreen(name, html) {
    clearTimeout(bankSearchTimer);
    screen = name;
    document.body.className = 'screen-' + name;
    app.innerHTML = html;
    document.querySelector('meta[name="theme-color"]').content = name === 'intro' ? '#123c36' : '#f5f6f1';
    if (window.AndroidHost && typeof window.AndroidHost.setAppearance === 'function') {
      window.AndroidHost.setAppearance(name === 'intro');
    }
    scrollTop();
    if (name !== 'intro') focusHeading();
  }
  function toast(message) {
    clearTimeout(toastTimer);
    toastElement.textContent = message;
    toastElement.hidden = false;
    toastTimer = setTimeout(function () { toastElement.hidden = true; }, 4500);
  }
  function save() {
    if (!attempt) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ attempt: attempt, lastNumber: lastNumber }));
    } catch (_) {
      if (!storageWarning) { toast('Не удалось сохранить попытку. Пожалуйста, не закрывайте приложение до завершения.'); storageWarning = true; }
    }
  }
  function rememberScroll() {
    if (attempt && (screen === 'quiz' || screen === 'results')) {
      attempt.scrollY = window.scrollY;
      save();
    }
  }
  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      attempt = Core.restoreAttempt(bank, data.attempt);
      lastNumber = Number.isSafeInteger(data.lastNumber) && data.lastNumber >= 0 ? data.lastNumber : 0;
      if (attempt) lastNumber = Math.max(lastNumber, attempt.number);
      else toast('Сохранённая попытка недоступна. Можно начать новую.');
    } catch (_) { attempt = null; }
  }

  function renderIntro() {
    setScreen('intro', `
      <main class="intro">
        <div class="intro-middle">
          <div class="science-seal" aria-hidden="true">
            <span class="seal-orbit"></span><span class="seal-orbit orbit-two"></span><span class="seal-orbit orbit-three"></span>
            <span class="seal-dot dot-one"></span><span class="seal-dot dot-two"></span><span class="seal-dot dot-three"></span>
            <div class="seal-center">${mark()}</div>
          </div>
          <h1>Лаборатория<br><span>Владислава<br>Дворикова</span></h1>
        </div>
      </main>`);
  }

  function renderHome() {
    let saved = '';
    const inProgress = attempt && !attempt.finishedAt;
    if (attempt) {
      const summary = attempt.finishedAt ? Core.grade(Core.questionsFor(bank, attempt), attempt.answers) : null;
      saved = `<section class="saved-card" aria-label="${inProgress ? 'Сохранённая попытка' : 'Последний результат'}">
        <div class="saved-card-head"><div class="saved-card-icon">${icon(inProgress ? 'book' : 'target')}</div>
        <div><strong>${inProgress ? 'Ваша попытка сохранена' : 'Последняя попытка · ' + summary.score + ' / 100'}</strong>
        <p>${inProgress ? 'Отвечено ' + Core.answeredCount(attempt) + ' из 30 вопросов' : summary.correct + ' из 30 правильных ответов'}</p></div></div>
        ${inProgress ? '' : '<button class="text-button" data-action="review">Посмотреть разбор ' + icon('arrow') + '</button>'}
      </section>`;
    }
    setScreen('home', `
      <main class="page home-page">
        <header class="brand-header">
          <div class="brand-lockup"><span class="brand-tile">${mark()}</span><div class="brand-name">Лаборатория VD</div></div>
        </header>
        <div class="home-layout"><div class="home-details">
        <section class="home-heading">
          <h1>Тренировка ЦТ<br><span>по общей<br>эпидемиологии</span></h1>
        </section>
        <section class="practice-card" aria-label="30 вопросов в каждой попытке">
          <div class="practice-main"><div><div class="practice-number">30</div><div class="practice-copy"><strong>вопросов</strong><br>в каждой попытке</div></div>
          <div class="practice-art" aria-hidden="true"><span class="art-orbit"></span><span class="art-orbit"></span><span class="art-orbit"></span><span class="art-dot"></span>${icon('spark', 'art-star')}</div></div>
          <div class="practice-foot">${icon('infinity')} Без таймера. В удобном для вас темпе.</div>
        </section>
        <div class="bank-stats" aria-label="База и оценивание">
          <div class="bank-stat"><strong>${bank.questions.length}</strong><span>вопросов в базе</span></div>
          <div class="bank-stat"><strong>${bank.topics.length}</strong><span>тем для практики</span></div>
          <div class="bank-stat"><strong>100</strong><span>максимальный балл</span></div>
        </div>
        </div><div class="home-controls">
        ${saved || `<div class="home-rules">${icon('stack')}<p>Все вопросы — на одном экране.<br><strong>Точный набор ответов = 1 верный вопрос.</strong></p></div>`}
        <button class="button button-primary button-full button-spread" data-action="${inProgress ? 'resume' : 'start'}">${inProgress ? 'Продолжить попытку' : 'Начать попытку'} ${icon('arrow')}</button>
        ${inProgress ? '<div class="home-secondary"><button class="text-button" data-action="restart">Начать новую попытку</button></div>' : ''}
        <button class="button button-quiet button-full bank-entry" data-action="bank">${icon('book')} Банк вопросов</button>
        <div class="home-footer">${icon('shield')} Работает без интернета</div>
        </div></div>
      </main>`);
  }

  function normalizeSearch(value) {
    return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  }

  function renderStudyQuestion(question) {
    const options = question.options.map(function (option) {
      const right = question.correct.indexOf(option.id) !== -1;
      return `<div class="option study-option${right ? ' is-right' : ''}" role="listitem" data-option="${option.id}">
        <span class="study-option-marker" aria-hidden="true">${right ? icon('check') : '<span class="study-dot"></span>'}</span>
        <div class="option-main"><div class="option-text">${option.html}</div>${right ? '<span class="answer-note">Правильный ответ</span>' : ''}</div>
      </div>`;
    }).join('');
    return `<article class="question-card bank-question" id="bank-question-${question.id}" data-question-id="${question.id}" aria-label="Вопрос ${question.sourceNumber}">
      <div class="question-meta"><span class="question-number" aria-hidden="true">${String(question.sourceNumber).padStart(2, '0')}</span>
        <span class="choice-caption${question.multiple ? ' multiple' : ''}">${question.multiple ? 'Несколько правильных ответов' : 'Один правильный ответ'}</span></div>
      <div class="qtext">${question.html}</div>
      <div class="options study-options" role="list" aria-label="Варианты ответов">${options}</div>
    </article>`;
  }

  function renderBankContent() {
    if (screen !== 'bank') return;
    const normalized = normalizeSearch(bankQuery);
    const terms = normalized ? normalized.split(' ') : [];
    const matches = bank.questions.filter(function (question) {
      return (bankTopic === 'all' || question.topicId === bankTopic) && terms.every(function (term) {
        return bankSearchIndex.get(question.id).indexOf(term) !== -1;
      });
    });
    document.getElementById('bank-count').textContent = 'Показано ' + matches.length + ' из ' + bank.questions.length;
    document.getElementById('clear-search').hidden = !bankQuery;
    document.getElementById('bank-content').innerHTML = matches.length ? bank.topics.map(function (topic) {
      const topicQuestions = matches.filter(function (question) { return question.topicId === topic.id; });
      if (!topicQuestions.length) return '';
      return `<section class="bank-topic-group" data-topic-id="${topic.id}" aria-labelledby="bank-topic-${topic.id}">
        <div class="bank-topic-heading"><h2 id="bank-topic-${topic.id}">${escape(topic.name)}</h2><span>${topicQuestions.length}</span></div>
        <div class="question-list">${topicQuestions.map(renderStudyQuestion).join('')}</div>
      </section>`;
    }).join('') : `<div class="bank-empty"><span class="bank-empty-icon">${icon('search')}</span><h2>Ничего не найдено</h2><p>Измените запрос или выберите другую тему.</p></div>`;
    decorateFigures();
    scrollTop();
  }

  function renderBank() {
    setScreen('bank', `<header class="test-header bank-header"><div class="test-header-inner">
      <div class="test-top"><button class="icon-button" data-action="home" aria-label="Вернуться на главный экран">${icon('back')}</button><h1>Банк вопросов</h1></div>
      <div class="bank-tools">
        <div class="bank-search">${icon('search')}<input id="bank-search" type="search" placeholder="Поиск по вопросам и ответам" aria-label="Поиск по вопросам и ответам" autocomplete="off" enterkeyhint="search" value="${escape(bankQuery)}">
          <button id="clear-search" class="search-clear" data-action="clear-search" aria-label="Очистить поиск" ${bankQuery ? '' : 'hidden'}>${icon('close')}</button></div>
        <label class="bank-topic-select" for="bank-topic"><span>Тема</span><span class="bank-select-wrap"><select id="bank-topic">
          <option value="all">Все темы</option>${bank.topics.map(function (topic) { return `<option value="${topic.id}" ${bankTopic === topic.id ? 'selected' : ''}>${escape(topic.name)}</option>`; }).join('')}
        </select>${icon('down')}</span></label>
      </div>
    </div></header>
    <main class="page bank-page"><p id="bank-count" class="bank-count" role="status" aria-live="polite" aria-atomic="true"></p><div id="bank-content"></div></main>`);
    renderBankContent();
  }

  function header(results) {
    const count = Core.answeredCount(attempt);
    return `<header class="test-header"><div class="test-header-inner">
      <div class="test-top"><button class="icon-button" data-action="home" aria-label="Вернуться на главный экран">${icon('back')}</button>
      <div class="test-title"><strong>${results ? 'Результаты попытки' : 'Тренировка ЦТ'}</strong><span>Общая эпидемиология</span></div><span class="attempt-tag">№ ${serial()}</span></div>
      ${results ? '' : `<div class="test-progress-line"><span>Отвечено на вопросы</span><strong id="progress-label" aria-live="polite">${count} / 30</strong></div>
      <div class="progress-track" id="test-progress" role="progressbar" aria-label="Количество отвеченных вопросов" aria-valuenow="${count}" aria-valuemin="0" aria-valuemax="30"><div id="progress-fill" class="progress-fill" style="width:${count / 30 * 100}%"></div></div>`}
    </div></header>`;
  }

  function verdictText(detail, multiple) {
    if (detail.status === 'correct') return 'Засчитано. ' + (multiple ? 'Выбраны все правильные ответы и ни одного лишнего.' : 'Выбран правильный ответ.');
    if (detail.status === 'unanswered') return 'Не засчитано. Ответ не выбран.';
    if (!multiple) return 'Не засчитано. Правильный ответ выделен зелёным.';
    if (detail.missing.length && detail.extra.length) return 'Не засчитано. Есть лишние и пропущенные варианты.';
    if (detail.missing.length) return 'Не засчитано. Выбрана только часть правильных ответов.';
    return 'Не засчитано. Выбраны лишние варианты.';
  }

  function renderQuestion(question, index, detail) {
    const selected = attempt.answers[question.id] || [];
    const review = Boolean(detail);
    const type = question.multiple ? 'checkbox' : 'radio';
    const options = question.options.map(function (option) {
      const picked = selected.indexOf(option.id) !== -1;
      const right = review && question.correct.indexOf(option.id) !== -1;
      const wrong = review && picked && !right;
      const classes = ['option'];
      if (picked) classes.push('is-selected');
      if (review) classes.push('is-review');
      if (right) classes.push('is-right');
      if (right && !picked) classes.push('is-missed');
      if (wrong) classes.push('is-wrong');
      let note = '';
      if (right) note = icon('check') + (picked ? 'Правильно · ваш ответ' : 'Правильный ответ · не выбран');
      if (wrong) note = icon('close') + 'Неправильно · ваш ответ';
      return `<label class="${classes.join(' ')}" data-option="${option.id}">
        <input type="${type}" name="answer-${question.id}" value="${option.id}" data-question="${question.id}" ${picked ? 'checked' : ''} ${review ? 'disabled' : ''} aria-labelledby="option-${question.id}-${option.id}${note ? ' note-' + question.id + '-' + option.id : ''}">
        <span class="option-control ${type}">${icon('check')}</span>
        <span class="option-main"><span class="option-text" id="option-${question.id}-${option.id}">${option.html}</span>${note ? `<span class="answer-note" id="note-${question.id}-${option.id}">${note}</span>` : ''}</span>
      </label>`;
    }).join('');
    return `<section class="question-card${selected.length ? ' has-answer' : ''}${review ? ' result-' + detail.status + '-card' : ''}" id="question-${question.id}" data-question-id="${question.id}" aria-label="Вопрос ${index + 1} из 30">
      <div class="question-meta"><span class="question-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
      <span class="question-topic">${escape(topicNames[question.topicId])}</span>
      ${review ? `<span class="question-grade" aria-label="${detail.earned} из 1 балла">${icon(detail.earned ? 'check' : 'close')} ${detail.earned} / 1</span>` : `<span class="answer-picked">${icon('check')} Выбрано</span>`}</div>
      <div class="qtext" id="text-${question.id}">${question.html}</div>
      <fieldset class="answer-fieldset" aria-describedby="text-${question.id}">
        <legend class="choice-caption${question.multiple ? ' multiple' : ''}">${review ? (question.multiple ? 'Несколько правильных ответов' : 'Один правильный ответ') : (question.multiple ? 'Выберите все правильные ответы' : 'Выберите один ответ')}</legend>
        <div class="options">${options}</div>
      </fieldset>
      ${review ? `<p class="question-verdict ${detail.earned ? 'is-correct' : ''}">${verdictText(detail, question.multiple)}</p>` : ''}
    </section>`;
  }

  function decorateFigures() {
    app.querySelectorAll('.qtext img').forEach(function (img) {
      if (img.closest('.figure-trigger')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'figure-trigger';
      button.dataset.action = 'image';
      button.dataset.src = img.getAttribute('src');
      button.dataset.alt = img.alt;
      button.setAttribute('aria-label', 'Увеличить рисунок к вопросу');
      img.parentNode.insertBefore(button, img);
      button.appendChild(img);
      const caption = document.createElement('span');
      caption.className = 'figure-caption';
      caption.innerHTML = icon('expand') + 'Нажмите, чтобы увеличить';
      button.appendChild(caption);
    });
  }

  function renderQuiz(resume) {
    questions = Core.questionsFor(bank, attempt);
    const previousY = resume ? attempt.scrollY : 0;
    setScreen('quiz', header(false) + `<main class="page test-page">
      <h1 class="sr-only">Попытка ${attempt.number}: 30 вопросов по общей эпидемиологии</h1>
      <div class="test-intro-note">${icon('infinity')}<div><strong>Спокойно, без таймера</strong><p>Листайте вниз. Ответы сохраняются автоматически.</p></div></div>
      <div class="question-list">${questions.map(function (q, i) { return renderQuestion(q, i, null); }).join('')}</div>
      <section class="finish-panel" id="finish-panel"><div class="finish-symbol">${icon('target')}</div><h2>Готовы проверить себя?</h2>
        <p id="finish-hint"></p>
        <button class="button button-primary button-full button-spread" data-action="finish">Завершить тестирование ${icon('arrow')}</button>
        <button class="text-button" id="first-empty" data-action="first-empty">К первому вопросу без ответа ${icon('back')}</button>
      </section>
      <p class="test-bottom-note">Частично верные ответы не засчитываются.<br>После завершения ответы изменить нельзя.</p>
    </main>`);
    decorateFigures();
    updateProgress();
    if (previousY) restoreScroll(previousY);
  }

  function restoreScroll(y) {
    const images = Array.from(app.querySelectorAll('img'));
    images.forEach(function (img) { img.loading = 'eager'; });
    const ready = images.map(function (img) {
      if (img.complete) return Promise.resolve();
      return new Promise(function (resolve) { img.addEventListener('load', resolve, { once: true }); img.addEventListener('error', resolve, { once: true }); });
    });
    Promise.all(ready).then(function () { requestAnimationFrame(function () { window.scrollTo(0, y); }); });
  }

  function updateProgress() {
    if (screen !== 'quiz') return;
    const count = Core.answeredCount(attempt);
    document.getElementById('progress-label').textContent = count + ' / 30';
    document.getElementById('progress-fill').style.width = count / 30 * 100 + '%';
    document.getElementById('test-progress').setAttribute('aria-valuenow', count);
    document.getElementById('finish-hint').textContent = count === 30 ? 'Вы ответили на все 30 вопросов. Посмотрим результат.' : 'Отвечено ' + count + ' из 30. ' + plural(30 - count, 'вопрос без ответа', 'вопроса без ответа', 'вопросов без ответа') + ' — они не будут засчитаны.';
    document.getElementById('first-empty').hidden = count === 30;
  }

  function renderResults(resume) {
    questions = Core.questionsFor(bank, attempt);
    const result = Core.grade(questions, attempt.answers);
    const previousY = resume ? attempt.scrollY : 0;
    const circumference = 263.894;
    setScreen('results', header(true) + `<main class="page result-page">
      <div class="result-summary"><div class="result-overview">
      <div class="result-lead"><h1>Ваш результат</h1>${icon('spark')}</div>
      <section class="result-card" aria-label="Результат тестирования">
        <div class="eyebrow">Попытка ${serial()} завершена</div>
        <div class="result-score-row"><div><div class="result-score"><strong class="score-number" id="result-score">${result.score}</strong><span class="score-outof">/ 100</span></div><span class="score-unit">баллов за попытку</span></div>
        <svg class="score-ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="ring-track" cx="50" cy="50" r="42" fill="none" stroke-width="5"/><circle class="ring-fill" cx="50" cy="50" r="42" fill="none" stroke-width="5" stroke-dasharray="${result.score / 100 * circumference} ${circumference}"/><g class="ring-mark"><circle cx="50" cy="50" r="13"/><circle cx="50" cy="50" r="5"/><path d="M50 31v5m0 28v5M31 50h5m28 0h5"/></g></svg></div>
        <p class="result-correct" id="result-correct">${result.correct} из 30 правильных ответов</p>
        <div class="result-breakdown"><span><i class="error-dot"></i>${plural(result.incorrect, 'ошибка', 'ошибки', 'ошибок')}</span><span><i></i>${result.unanswered} без ответа</span></div>
      </section>
      </div><div class="result-controls">
      <p class="score-formula">${result.correct} ÷ 30 × 100 ${result.correct * 100 % 30 ? '≈' : '='} ${result.score} · округление до целого</p>
      <div class="result-actions"><button class="button button-primary" data-action="start">${icon('retry')} Новая попытка</button><button class="button button-quiet" data-action="review-scroll">К разбору ${icon('down')}</button></div>
      </div></div>
      <section aria-labelledby="review-heading"><div class="review-heading" id="review-heading"><h2>Разбор ответов</h2><span>Все 30 вопросов</span></div>
      <div class="review-legend"><span><i></i>Правильные ответы</span><span><i class="legend-wrong"></i>Ваши ошибки</span></div>
      <div class="question-list">${questions.map(function (q, index) { return renderQuestion(q, index, result.details[index]); }).join('')}</div></section>
      <div class="review-end"><p>Каждая попытка — ещё один шаг к уверенности.<br>Продолжим практику?</p>
      <button class="button button-primary button-full button-spread" data-action="start">Начать новую попытку ${icon('arrow')}</button>
      <button class="text-button" data-action="home">Вернуться на главный экран</button></div>
    </main>`);
    decorateFigures();
    if (previousY) restoreScroll(previousY);
  }

  function startAttempt() {
    if (startBusy) return;
    startBusy = true;
    lastNumber += 1;
    attempt = Core.createAttempt(bank, lastNumber);
    save();
    renderQuiz(false);
    setTimeout(function () { startBusy = false; }, 450);
  }

  function finishAttempt() {
    if (!attempt || attempt.finishedAt || screen !== 'quiz') return;
    clearTimeout(scrollTimer);
    attempt.finishedAt = new Date().toISOString();
    attempt.scrollY = 0;
    save();
    renderResults(false);
  }

  function showModal(kind, title, content, className) {
    previousFocus = document.activeElement;
    modal = kind;
    document.body.classList.add('modal-open');
    modalRoot.innerHTML = `<div class="modal-backdrop${kind === 'image' ? ' image-modal-backdrop' : ''}" data-dismiss="true">
      <section class="modal ${className || ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">
        ${kind === 'image' ? '' : '<div class="modal-handle" aria-hidden="true"></div>'}
        <div class="modal-heading"><h2 id="modal-title">${escape(title)}</h2><button class="icon-button" data-action="close-modal" aria-label="Закрыть">${icon('close')}</button></div>
        ${content}
      </section></div>`;
    modalRoot.querySelector('.modal').focus({ preventScroll: true });
  }

  function closeModal() {
    modalRoot.innerHTML = '';
    document.body.classList.remove('modal-open');
    modal = null;
    if (previousFocus && document.contains(previousFocus)) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }

  function showRestart() {
    showModal('restart', 'Начать заново?', `<p>В текущей попытке отвечено на ${Core.answeredCount(attempt)} из 30 вопросов. Новая попытка заменит её и выберет другие случайные вопросы.</p>
      <button class="button button-primary button-full" data-action="confirm-restart">Начать новую попытку</button>
      <button class="button button-secondary button-full" data-action="resume-current">Продолжить текущую</button>`, 'modal-small');
  }

  function showImage(button) {
    const source = button.dataset.src;
    if (!/^media\/[a-f0-9]+\.(png|jpg|gif|webp)$/.test(source)) return;
    showModal('image', 'Рисунок к вопросу', `<div class="image-stage"><img src="${escape(source)}" alt="${escape(button.dataset.alt || 'Рисунок к вопросу')}"></div>
      <button class="text-button" data-action="zoom-image" aria-pressed="false">${icon('expand')} Увеличить</button><p class="image-help">В увеличенном виде рисунок можно прокручивать.</p>`, 'image-modal');
  }

  function handleBack() {
    if (modal) { closeModal(); return true; }
    if (screen === 'quiz' || screen === 'results') { rememberScroll(); renderHome(); return true; }
    if (screen === 'bank') { renderHome(); return true; }
    return false;
  }

  function onAction(action, button) {
    switch (action) {
      case 'home': rememberScroll(); renderHome(); break;
      case 'bank': rememberScroll(); renderBank(); break;
      case 'clear-search': {
        clearTimeout(bankSearchTimer);
        bankQuery = '';
        const search = document.getElementById('bank-search');
        search.value = '';
        renderBankContent();
        search.focus({ preventScroll: true });
        break;
      }
      case 'start':
        if (attempt && !attempt.finishedAt) showRestart(); else startAttempt();
        break;
      case 'resume': renderQuiz(true); break;
      case 'review': renderResults(false); break;
      case 'restart': showRestart(); break;
      case 'confirm-restart': closeModal(); startAttempt(); break;
      case 'resume-current': closeModal(); renderQuiz(true); break;
      case 'finish': finishAttempt(); break;
      case 'review-scroll': scrollToElement(document.getElementById('review-heading')); break;
      case 'first-empty': {
        const q = questions.find(function (question) { return !(attempt.answers[question.id] || []).length; });
        if (q) scrollToElement(document.getElementById('question-' + q.id));
        break;
      }
      case 'close-modal': closeModal(); break;
      case 'image': showImage(button); break;
      case 'zoom-image': {
        const stage = modalRoot.querySelector('.image-stage');
        const img = stage.querySelector('img');
        const enlarged = stage.classList.toggle('is-zoomed');
        img.style.width = enlarged ? Math.max(img.naturalWidth, stage.clientWidth * 1.8) + 'px' : '';
        button.setAttribute('aria-pressed', enlarged);
        button.innerHTML = icon('expand') + (enlarged ? 'По ширине экрана' : 'Увеличить');
        break;
      }
      case 'reload': window.location.reload(); break;
    }
  }

  document.addEventListener('click', function (event) {
    const button = event.target.closest('[data-action]');
    if (button && !button.disabled) onAction(button.dataset.action, button);
    else if (event.target.dataset && event.target.dataset.dismiss) closeModal();
  });
  document.addEventListener('change', function (event) {
    const input = event.target;
    if (screen === 'bank' && input.id === 'bank-topic') {
      clearTimeout(bankSearchTimer);
      bankTopic = input.value;
      renderBankContent();
      return;
    }
    if (screen !== 'quiz' || attempt.finishedAt || !input.matches('input[data-question]')) return;
    const question = questions.find(function (q) { return q.id === input.dataset.question; });
    if (!question) return;
    attempt.answers[question.id] = Core.choose(question, attempt.answers[question.id], input.value, input.checked);
    if (!attempt.answers[question.id].length) delete attempt.answers[question.id];
    const card = document.getElementById('question-' + question.id);
    card.classList.toggle('has-answer', Boolean((attempt.answers[question.id] || []).length));
    card.querySelectorAll('.option').forEach(function (label) { label.classList.toggle('is-selected', label.querySelector('input').checked); });
    attempt.scrollY = window.scrollY;
    save();
    updateProgress();
  });
  document.addEventListener('input', function (event) {
    if (screen !== 'bank' || event.target.id !== 'bank-search') return;
    bankQuery = event.target.value;
    document.getElementById('clear-search').hidden = !bankQuery;
    clearTimeout(bankSearchTimer);
    bankSearchTimer = setTimeout(renderBankContent, 150);
  });
  document.addEventListener('keydown', function (event) {
    if (screen === 'bank' && event.target.id === 'bank-search' && event.key === 'Enter') {
      event.preventDefault();
      clearTimeout(bankSearchTimer);
      renderBankContent();
      event.target.blur();
      return;
    }
    if (event.key === 'Escape') { if (handleBack()) event.preventDefault(); return; }
    if (event.key !== 'Tab' || !modal) return;
    const dialog = modalRoot.querySelector('.modal');
    const focusable = Array.from(dialog.querySelectorAll('button, a[href], input, [tabindex="0"]')).filter(function (element) { return !element.disabled && !element.hidden; });
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  window.addEventListener('scroll', function () {
    if (!attempt || (screen !== 'quiz' && screen !== 'results')) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(rememberScroll, 200);
  }, { passive: true });
  window.addEventListener('pagehide', rememberScroll);
  document.addEventListener('visibilitychange', function () { if (document.hidden) rememberScroll(); });

  window.VDApp = { handleBack: handleBack, persist: rememberScroll };

  renderIntro();
  const introFinished = new Promise(function (resolve) { setTimeout(resolve, 1600); });
  const bankLoaded = fetch('questions.json').then(function (response) {
    if (!response.ok) throw new Error('Не удалось прочитать базу вопросов.');
    return response.json();
  });
  Promise.all([bankLoaded, introFinished]).then(function (values) {
    bank = Core.assertBank(values[0]);
    bankSearchIndex = new Map(bank.questions.map(function (question) {
      return [question.id, normalizeSearch(question.text + ' ' + question.options.map(function (option) { return option.text; }).join(' '))];
    }));
    restore();
    renderHome();
  }).catch(function (error) {
    setScreen('error', `<main class="page error-page"><span class="brand-tile">${mark()}</span><h1>Не удалось открыть лабораторию</h1><p>${escape(error.message)} Попробуйте открыть приложение ещё раз.</p><button class="button button-primary" data-action="reload">Повторить ${icon('retry')}</button></main>`);
  });
})();
