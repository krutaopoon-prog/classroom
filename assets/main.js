/**
 * ==========================================================================
 * WBI Electronics Teacher — main.js
 * ==========================================================================
 * Shared vanilla JavaScript for the Thai-language electronics education site.
 *
 * Features:
 *   1. Quiz Engine        – one-question-at-a-time with transitions & scoring
 *   2. Navigation Helpers – breadcrumbs, smooth scroll, active nav
 *   3. Utility Functions  – localStorage score helpers
 *   4. Page-Load Animations – fade-in & staggered cards
 *
 * No frameworks. No dependencies. Pure vanilla JS.
 * ==========================================================================
 */

/* -----------------------------------------------------------------------
   1. QUIZ ENGINE
   ----------------------------------------------------------------------- */

/**
 * Initialise and render an interactive quiz inside a container element.
 *
 * @param {Object}   config
 * @param {string}   config.containerId  – ID of the target <div>
 * @param {string}   config.subject      – e.g. 'electronics1'
 * @param {number}   config.chapter      – chapter number
 * @param {Array}    config.questions     – array of question objects
 *
 * Each question object:
 *   { question: string, options: string[4], correct: number, explanation: string }
 */
function initQuiz(config) {
  const { containerId, subject, chapter, questions } = config;
  const container = document.getElementById(containerId);

  if (!container) {
    console.error(`[Quiz] Container #${containerId} not found.`);
    return;
  }

  if (!questions || questions.length === 0) {
    container.innerHTML = '<p class="quiz-empty">ไม่มีคำถามสำหรับแบบทดสอบนี้</p>';
    return;
  }

  /* ---- state ---- */
  let currentIndex = 0;
  let score = 0;
  let answered = false; // prevents double-click on same question

  /* ---- build static shell ---- */
  container.innerHTML = '';
  container.classList.add('quiz-wrapper');

  // Progress bar
  const progressWrap = _el('div', 'quiz-progress-wrap', container);
  const progressBar  = _el('div', 'quiz-progress-bar', progressWrap);
  const progressText = _el('span', 'quiz-progress-text', progressWrap);

  // Question card (animated)
  const card = _el('div', 'quiz-card', container);

  // Question number + text
  const qNumber = _el('p', 'quiz-q-number', card);
  const qText   = _el('p', 'quiz-q-text', card);

  // Options list
  const optionsList = _el('ul', 'quiz-options', card);

  // Explanation area (hidden by default)
  const explWrap = _el('div', 'quiz-explanation', card);
  explWrap.style.display = 'none';

  // Navigation buttons
  const btnWrap = _el('div', 'quiz-btn-wrap', container);
  const btnNext = _el('button', 'btn btn-primary quiz-btn-next', btnWrap);
  btnNext.textContent = 'ข้อถัดไป';
  btnNext.style.display = 'none';
  btnNext.addEventListener('click', nextQuestion);

  // Summary overlay (hidden until quiz ends)
  const summary = _el('div', 'quiz-summary', container);
  summary.style.display = 'none';

  /* ---- render first question ---- */
  renderQuestion(currentIndex);

  /* ---- internal helpers ---- */

  /** Render question at given index */
  function renderQuestion(idx) {
    answered = false;
    const q = questions[idx];

    // Update progress
    const pct = Math.round(((idx) / questions.length) * 100);
    progressBar.style.width = pct + '%';
    progressText.textContent = `ข้อที่ ${idx + 1} / ${questions.length}`;

    // Question text
    qNumber.textContent = `คำถามที่ ${idx + 1}`;
    qText.textContent = q.question;

    // Clear & create option buttons
    optionsList.innerHTML = '';
    q.options.forEach((opt, i) => {
      const li = _el('li', 'quiz-option', optionsList);
      li.textContent = opt;
      li.dataset.index = i;
      li.setAttribute('role', 'button');
      li.setAttribute('tabindex', '0');
      li.addEventListener('click', () => selectOption(li, i, q));
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectOption(li, i, q);
        }
      });
    });

    // Hide explanation & next button
    explWrap.style.display = 'none';
    explWrap.textContent = '';
    btnNext.style.display = 'none';

    // Smooth transition – fade in card
    card.classList.remove('quiz-card--visible');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        card.classList.add('quiz-card--visible');
      });
    });
  }

  /** Handle option selection */
  function selectOption(li, chosenIndex, q) {
    if (answered) return; // prevent changing answer
    answered = true;

    const allOptions = optionsList.querySelectorAll('.quiz-option');

    // Highlight correct & incorrect
    allOptions.forEach((opt) => {
      const idx = parseInt(opt.dataset.index, 10);
      opt.classList.add('quiz-option--disabled');

      if (idx === q.correct) {
        opt.classList.add('quiz-option--correct');
      }
      if (idx === chosenIndex && chosenIndex !== q.correct) {
        opt.classList.add('quiz-option--incorrect');
      }
    });

    // Update score
    if (chosenIndex === q.correct) {
      score++;
    }

    // Show explanation
    if (q.explanation) {
      explWrap.style.display = 'block';
      explWrap.innerHTML =
        '<strong>คำอธิบาย:</strong> ' + _escapeHTML(q.explanation);
    }

    // Show next / finish button
    btnNext.style.display = 'inline-flex';
    if (currentIndex === questions.length - 1) {
      btnNext.textContent = 'ดูผลคะแนน';
    } else {
      btnNext.textContent = 'ข้อถัดไป';
    }
  }

  /** Advance to next question or show summary */
  function nextQuestion() {
    currentIndex++;
    if (currentIndex < questions.length) {
      renderQuestion(currentIndex);
    } else {
      showSummary();
    }
  }

  /** Display final score summary */
  function showSummary() {
    // Save score to localStorage
    saveQuizScore(subject, chapter, score, questions.length);

    // Update progress bar to 100 %
    progressBar.style.width = '100%';
    progressText.textContent = 'เสร็จสิ้น!';

    // Hide card & next button
    card.style.display = 'none';
    btnNext.style.display = 'none';

    // Build summary UI
    const pct = Math.round((score / questions.length) * 100);
    summary.style.display = 'flex';
    summary.innerHTML = `
      <div class="quiz-summary-inner">
        <h2 class="quiz-summary-title">ผลคะแนนของคุณ</h2>
        <div class="quiz-summary-score">${score} / ${questions.length}</div>
        <div class="quiz-summary-pct">${pct}%</div>
        <p class="quiz-summary-msg">${_summaryMessage(pct)}</p>
        <div class="quiz-summary-actions">
          <button class="btn btn-primary quiz-btn-retry" id="quiz-btn-retry">ทำแบบทดสอบอีกครั้ง</button>
          <button class="btn btn-secondary quiz-btn-back" id="quiz-btn-back">กลับไปยังบทเรียน</button>
        </div>
      </div>
    `;

    // Retry button — reset and restart
    summary.querySelector('#quiz-btn-retry').addEventListener('click', () => {
      score = 0;
      currentIndex = 0;
      summary.style.display = 'none';
      card.style.display = '';
      renderQuestion(0);
    });

    // Back to lesson button — navigate to parent folder
    summary.querySelector('#quiz-btn-back').addEventListener('click', () => {
      // Attempt to go up one directory; fallback to index
      const parts = window.location.pathname.split('/');
      parts.pop(); // remove current file
      window.location.href = parts.join('/') + '/index.html';
    });
  }

  /** Return an encouraging message based on percentage */
  function _summaryMessage(pct) {
    if (pct === 100) return 'ยอดเยี่ยม! คุณตอบถูกทุกข้อ! 🎉';
    if (pct >= 80)  return 'ดีมาก! คุณเข้าใจเนื้อหาได้ดี 👍';
    if (pct >= 60)  return 'พอใช้ได้ ลองทบทวนเนื้อหาอีกครั้งนะ 📖';
    return 'ยังต้องฝึกฝนอีก ลองอ่านบทเรียนและทำแบบทดสอบใหม่ 💪';
  }
}


/* -----------------------------------------------------------------------
   2. NAVIGATION HELPERS
   ----------------------------------------------------------------------- */

/**
 * Auto-generate breadcrumbs from the current URL path.
 * Renders into an element with id="breadcrumb" if present.
 *
 * Example output:
 *   หน้าแรก > อิเล็กทรอนิกส์ 1 > บทที่ 1
 */
function generateBreadcrumb() {
  const el = document.getElementById('breadcrumb');
  if (!el) return;

  const segments = window.location.pathname
    .split('/')
    .filter(Boolean)
    .filter((s) => s !== 'index.html');

  const crumbs = [{ label: 'หน้าแรก', href: '/' }];
  let path = '';

  segments.forEach((seg) => {
    path += '/' + seg;
    // Clean segment name for display
    const label = seg
      .replace(/\.html$/, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    crumbs.push({ label, href: path });
  });

  el.innerHTML = crumbs
    .map((c, i) => {
      if (i === crumbs.length - 1) {
        return `<span class="breadcrumb-current">${_escapeHTML(c.label)}</span>`;
      }
      return `<a href="${c.href}" class="breadcrumb-link">${_escapeHTML(c.label)}</a>`;
    })
    .join('<span class="breadcrumb-sep"> › </span>');
}

/**
 * Smooth-scroll to the top of the page.
 * Attach to a "scroll to top" button via onclick or event listener.
 */
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Highlight the navigation link that matches the current page.
 * Looks for <a> elements inside `nav` or `.main-nav`.
 */
function highlightActiveNav() {
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll('nav a, .main-nav a');

  navLinks.forEach((link) => {
    const linkPath = new URL(link.href, window.location.origin).pathname;
    if (linkPath === currentPath) {
      link.classList.add('nav-active');
    } else {
      link.classList.remove('nav-active');
    }
  });
}


/* -----------------------------------------------------------------------
   3. UTILITY FUNCTIONS — localStorage Score Helpers
   ----------------------------------------------------------------------- */

/**
 * Build a consistent localStorage key.
 * Pattern: quiz_[subject]_ch[N]
 *
 * @param {string} subject
 * @param {number} chapter
 * @returns {string}
 */
function _quizKey(subject, chapter) {
  return `quiz_${subject}_ch${chapter}`;
}

/**
 * Save quiz score to localStorage.
 *
 * @param {string} subject
 * @param {number} chapter
 * @param {number} score
 * @param {number} total
 */
function saveQuizScore(subject, chapter, score, total) {
  const key = _quizKey(subject, chapter);
  const data = {
    score,
    total,
    percentage: Math.round((score / total) * 100),
    date: new Date().toISOString(),
  };
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('[Quiz] Unable to save score to localStorage:', e);
  }
}

/**
 * Retrieve a saved quiz score from localStorage.
 *
 * @param {string} subject
 * @param {number} chapter
 * @returns {Object|null}  { score, total, percentage, date } or null
 */
function getQuizScore(subject, chapter) {
  const key = _quizKey(subject, chapter);
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('[Quiz] Unable to read score from localStorage:', e);
    return null;
  }
}

/**
 * Format a score for display.
 *
 * @param {number} score
 * @param {number} total
 * @returns {string}  e.g. "8/10 (80%)"
 */
function formatScore(score, total) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  return `${score}/${total} (${pct}%)`;
}


/* -----------------------------------------------------------------------
   4. PAGE-LOAD ANIMATIONS
   ----------------------------------------------------------------------- */

/**
 * Apply fade-in animation to `<main>` or `.main-content` on load,
 * and stagger card animations for any `.card` elements.
 */
function initPageAnimations() {
  // Fade-in main content
  const main =
    document.querySelector('main') ||
    document.querySelector('.main-content');

  if (main) {
    main.classList.add('fade-in');
  }

  // Staggered animation for cards
  const cards = document.querySelectorAll('.card');
  cards.forEach((card, i) => {
    card.style.animationDelay = `${i * 0.1}s`;
    card.classList.add('card-animate');
  });
}


/* -----------------------------------------------------------------------
   5. SCROLL-TO-TOP BUTTON (auto-created)
   ----------------------------------------------------------------------- */

/**
 * Create a floating "scroll to top" button that appears after scrolling down.
 */
function initScrollToTopButton() {
  // Only create if one doesn't already exist
  if (document.getElementById('scroll-top-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'scroll-top-btn';
  btn.className = 'scroll-top-btn';
  btn.setAttribute('aria-label', 'เลื่อนขึ้นด้านบน');
  btn.innerHTML = '&#8679;'; // ⇧ arrow
  btn.addEventListener('click', scrollToTop);
  document.body.appendChild(btn);

  window.addEventListener(
    'scroll',
    _throttle(() => {
      btn.classList.toggle('scroll-top-btn--visible', window.scrollY > 300);
    }, 200),
    { passive: true }
  );
}


/* -----------------------------------------------------------------------
   INTERNAL DOM & STRING HELPERS
   ----------------------------------------------------------------------- */

/**
 * Create an element, assign classes, and optionally append to a parent.
 *
 * @param {string}      tag
 * @param {string}      className  – space-separated class names
 * @param {HTMLElement}  [parent]
 * @returns {HTMLElement}
 */
function _el(tag, className, parent) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (parent) parent.appendChild(el);
  return el;
}

/**
 * Escape HTML special characters to prevent XSS.
 *
 * @param {string} str
 * @returns {string}
 */
function _escapeHTML(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/**
 * Basic throttle helper.
 *
 * @param {Function} fn
 * @param {number}   delay  – ms
 * @returns {Function}
 */
function _throttle(fn, delay) {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn.apply(this, args);
    }
  };
}


/* -----------------------------------------------------------------------
   AUTO-INIT ON DOMContentLoaded
   ----------------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  initPageAnimations();
  highlightActiveNav();
  generateBreadcrumb();
  initScrollToTopButton();
});
