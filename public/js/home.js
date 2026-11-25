(function () {
  const quizGrid = document.getElementById('quizGrid');
  const emptyState = document.getElementById('emptyState');
  const heroStats = document.getElementById('heroStats');
  const searchInput = document.getElementById('searchInput');
  const quickJoinForm = document.getElementById('quickJoinForm');
  const quickPinInput = document.getElementById('quickPinInput');

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
      const coverBg = quiz.coverImage
        ? `background-image: url('${escapeHtml(quiz.coverImage)}'), ${quiz.theme.bg};`
        : `background: ${quiz.theme.bg};`;
      const coverClass = quiz.coverImage ? 'quiz-cover has-cover-image' : 'quiz-cover';
      card.innerHTML = `
        <div class="${coverClass}" style="${coverBg}">
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
              ▶ Lanzar ${escapeHtml(quiz.tag)}
            </a>
          </div>
        </div>
      `;
      quizGrid.appendChild(card);
    });
  }

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
