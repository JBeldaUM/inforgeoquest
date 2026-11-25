(function () {
  const quizGrid = document.getElementById('quizGrid');
  const emptyState = document.getElementById('emptyState');
  const heroStats = document.getElementById('heroStats');
  const searchInput = document.getElementById('searchInput');
  const quickJoinForm = document.getElementById('quickJoinForm');
  const quickPinInput = document.getElementById('quickPinInput');

  // Preview Modal elements
  const previewModal = document.getElementById('previewModal');
  const modalHeader = document.getElementById('modalHeader');
  const modalTag = document.getElementById('modalTag');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const modalHostBtn = document.getElementById('modalHostBtn');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalCancelBtn = document.getElementById('modalCancelBtn');

  let allQuizzes = [];

  function formatMinutes(totalSeconds) {
    const mins = Math.max(1, Math.round(totalSeconds / 60));
    return `~${mins} min`;
  }

  function renderQuizzes(list) {
    quizGrid.innerHTML = '';
    if (!list.length) {
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');

    list.forEach((quiz) => {
      const card = document.createElement('article');
      card.className = 'quiz-card';
      card.innerHTML = `
        <div class="quiz-cover" style="background: ${quiz.theme.bg};">
          <div class="quiz-cover-top">
            <span class="quiz-tag">${escapeHtml(quiz.tag)}</span>
            <span class="quiz-icon">${quiz.theme.icon}</span>
          </div>
          <div class="quiz-cover-bottom">
            <span class="quiz-qcount">${quiz.questionCount} preguntas</span>
            <span class="quiz-qcount">${formatMinutes(quiz.totalTime)}</span>
          </div>
        </div>
        <div class="quiz-body">
          <h3 class="quiz-title">${escapeHtml(quiz.title)}</h3>
          <div class="quiz-meta">
            <span>📄 ${escapeHtml(quiz.filename)}</span>
          </div>
          <div class="quiz-actions">
            <a href="/host?quiz=${encodeURIComponent(quiz.id)}" class="k-btn k-btn-green">
              ▶ Presentar
            </a>
            <button type="button" class="k-btn k-btn-light" data-preview="${escapeHtml(quiz.id)}">
              Ver preguntas
            </button>
          </div>
        </div>
      `;
      quizGrid.appendChild(card);
    });
  }

  async function openPreview(quizId) {
    try {
      const res = await fetch(`/api/quizzes/${encodeURIComponent(quizId)}`);
      if (!res.ok) return;
      const quiz = await res.json();

      modalHeader.style.background = quiz.theme.bg;
      modalTag.textContent = `${quiz.tag} · ${quiz.questionCount} preguntas`;
      modalTitle.textContent = quiz.title;
      modalHostBtn.href = `/host?quiz=${encodeURIComponent(quiz.id)}`;

      modalBody.innerHTML = quiz.questions
        .map((q, idx) => {
          const answersHtml = q.answers
            .map((ans, aIdx) => {
              const isCorrect = q.correct.includes(aIdx);
              return `
                <div class="preview-ans ${isCorrect ? 'is-correct' : ''}">
                  <span class="shape-icon ans-bg-${aIdx}" style="width:22px;height:22px;padding:4px;border-radius:4px;">
                    ${window.QUEST_SHAPES[aIdx]}
                  </span>
                  <span>${escapeHtml(ans)}</span>
                  ${isCorrect ? '<span style="margin-left:auto;">✓</span>' : ''}
                </div>
              `;
            })
            .join('');

          return `
            <div class="preview-q-item">
              <div class="preview-q-head">
                <span>PREGUNTA ${idx + 1}</span>
                <span>⏱ ${q.timeLimit} s</span>
              </div>
              <div class="preview-q-text">${escapeHtml(q.text)}</div>
              <div class="preview-ans-grid">${answersHtml}</div>
            </div>
          `;
        })
        .join('');

      previewModal.classList.remove('hidden');
    } catch (err) {
      console.error('Error cargando vista previa:', err);
    }
  }

  function closePreview() {
    previewModal.classList.add('hidden');
  }

  quizGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-preview]');
    if (btn) {
      openPreview(btn.getAttribute('data-preview'));
    }
  });

  modalCloseBtn.addEventListener('click', closePreview);
  modalCancelBtn.addEventListener('click', closePreview);
  previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) closePreview();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePreview();
  });

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      renderQuizzes(allQuizzes);
      return;
    }
    const filtered = allQuizzes.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.tag.toLowerCase().includes(q) ||
        item.filename.toLowerCase().includes(q)
    );
    renderQuizzes(filtered);
  });

  quickJoinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = quickPinInput.value.replace(/\s+/g, '');
    if (pin) {
      window.location.href = `/play?pin=${encodeURIComponent(pin)}`;
    }
  });

  async function init() {
    try {
      const [qRes, infoRes] = await Promise.all([
        fetch('/api/quizzes'),
        fetch('/api/server-info'),
      ]);
      allQuizzes = await qRes.json();
      const info = await infoRes.json();

      const totalQuestions = allQuizzes.reduce((acc, q) => acc + q.questionCount, 0);
      const isLocal =
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const displayUrl = isLocal ? `Red local: ${info.lanUrl}` : window.location.origin;
      heroStats.innerHTML = `
        <span class="hero-pill">📚 ${allQuizzes.length} cuestionarios</span>
        <span class="hero-pill">❓ ${totalQuestions} preguntas</span>
        <span class="hero-pill">🌐 ${escapeHtml(displayUrl)}</span>
      `;

      renderQuizzes(allQuizzes);
    } catch (err) {
      heroStats.innerHTML = '<span class="hero-pill">⚠️ Error al conectar con el servidor</span>';
      console.error(err);
    }
  }

  init();
})();
