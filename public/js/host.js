(function () {
  const params = new URLSearchParams(window.location.search);
  const quizId = params.get('quiz');

  if (!quizId) {
    window.location.href = '/';
    return;
  }

  const socket = io();

  const views = {
    lobby: document.getElementById('viewLobby'),
    intro: document.getElementById('viewIntro'),
    preQuestion: document.getElementById('viewPreQuestion'),
    question: document.getElementById('viewQuestion'),
    scoreboard: document.getElementById('viewScoreboard'),
    podium: document.getElementById('viewPodium'),
  };

  // Lobby elements
  const lobbyJoinUrl = document.getElementById('lobbyJoinUrl');
  const lobbyPinCode = document.getElementById('lobbyPinCode');
  const lobbyQrBox = document.getElementById('lobbyQrBox');
  const lobbyQrImg = document.getElementById('lobbyQrImg');
  const lobbyPlayerCount = document.getElementById('lobbyPlayerCount');
  const lobbyPlayerLabel = document.getElementById('lobbyPlayerLabel');
  const lobbyQuizBadge = document.getElementById('lobbyQuizBadge');
  const lobbyPlayersArea = document.getElementById('lobbyPlayersArea');
  const btnLockRoom = document.getElementById('btnLockRoom');
  const btnStartGame = document.getElementById('btnStartGame');
  const btnMuteLobby = document.getElementById('btnMuteLobby');
  const btnMuteQuestion = document.getElementById('btnMuteQuestion');

  // Intro & Pre-question elements
  const introTag = document.getElementById('introTag');
  const introTitle = document.getElementById('introTitle');
  const introSubtitle = document.getElementById('introSubtitle');
  const preqCounter = document.getElementById('preqCounter');
  const preqText = document.getElementById('preqText');
  const preqBar = document.getElementById('preqBar');

  // Question / Results elements
  const hqProgress = document.getElementById('hqProgress');
  const hqQuestionText = document.getElementById('hqQuestionText');
  const hqTimerCircle = document.getElementById('hqTimerCircle');
  const hqLivePrompt = document.getElementById('hqLivePrompt');
  const hqQuizIcon = document.getElementById('hqQuizIcon');
  const hqResultsChart = document.getElementById('hqResultsChart');
  const hqAnswerCount = document.getElementById('hqAnswerCount');
  const hqAnswerLabel = document.getElementById('hqAnswerLabel');
  const hqAnswersGrid = document.getElementById('hqAnswersGrid');
  const btnSkipQuestion = document.getElementById('btnSkipQuestion');
  const btnNextFromResults = document.getElementById('btnNextFromResults');

  // Scoreboard elements
  const sbSub = document.getElementById('sbSub');
  const scoreboardList = document.getElementById('scoreboardList');
  const btnNextFromScoreboard = document.getElementById('btnNextFromScoreboard');

  // Podium elements
  const podiumQuizTag = document.getElementById('podiumQuizTag');
  const podiumQuizTitle = document.getElementById('podiumQuizTitle');
  const podiumStage = document.getElementById('podiumStage');
  const fullRankingCard = document.getElementById('fullRankingCard');
  const fullRankingBody = document.getElementById('fullRankingBody');
  const btnPlayAgain = document.getElementById('btnPlayAgain');
  const btnExportCsv = document.getElementById('btnExportCsv');

  let currentPin = null;
  let currentQuiz = null;
  let lastLeaderboard = [];
  let lastTickSec = null;
  let prevPlayerCount = 0;

  function showView(name) {
    Object.entries(views).forEach(([key, el]) => {
      el.classList.toggle('hidden', key !== name);
    });
  }

  function formatPin(pin) {
    const s = String(pin || '');
    return s.length === 6 ? `${s.slice(0, 3)} ${s.slice(3)}` : s;
  }

  function syncMuteButtons() {
    const icon = window.soundEngine.muted ? '🔇' : '🔊';
    btnMuteLobby.textContent = icon;
    btnMuteQuestion.textContent = icon;
  }

  btnMuteLobby.addEventListener('click', () => {
    window.soundEngine.toggleMute();
    syncMuteButtons();
  });
  btnMuteQuestion.addEventListener('click', () => {
    window.soundEngine.toggleMute();
    syncMuteButtons();
  });

  lobbyPinCode.addEventListener('click', () => {
    if (!currentPin) return;
    navigator.clipboard?.writeText(currentPin).catch(() => {});
    const original = lobbyPinCode.textContent;
    lobbyPinCode.textContent = '¡COPIADO!';
    setTimeout(() => {
      lobbyPinCode.textContent = original;
    }, 900);
  });

  async function setupJoinDetails(pin) {
    try {
      const infoRes = await fetch('/api/server-info');
      const info = await infoRes.json();
      const isLocalhost =
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const baseUrl = isLocalhost ? info.lanUrl : window.location.origin;
      const playUrl = `${baseUrl}/play?pin=${encodeURIComponent(pin)}`;

      lobbyJoinUrl.textContent = `${baseUrl.replace(/^https?:\/\//, '')}/play`;

      const qrRes = await fetch(`/api/qr?text=${encodeURIComponent(playUrl)}`);
      if (qrRes.ok) {
        const { dataUrl } = await qrRes.json();
        lobbyQrImg.src = dataUrl;
        lobbyQrBox.classList.remove('hidden');
      }
    } catch (err) {
      lobbyJoinUrl.textContent = `${window.location.host}/play`;
    }
  }

  // Create game room once connected
  socket.on('connect', () => {
    if (currentPin) return;
    socket.emit('host:create', { quizId }, (res) => {
      if (!res || res.error) {
        alert(res?.error || 'No se pudo iniciar la sala.');
        window.location.href = '/';
        return;
      }
      currentPin = res.pin;
      currentQuiz = res.quiz;

      lobbyPinCode.textContent = formatPin(res.pin);
      lobbyQuizBadge.textContent = `${res.quiz.tag} · ${res.quiz.title}`;
      hqQuizIcon.textContent = res.quiz.theme?.icon || '💻';
      document.title = `PIN ${formatPin(res.pin)} — ${res.quiz.title}`;

      setupJoinDetails(res.pin);
      showView('lobby');
    });
  });

  // Lobby updates
  socket.on('host:lobbyUpdate', ({ players, locked }) => {
    lobbyPlayerCount.textContent = String(players.length);
    lobbyPlayerLabel.textContent = players.length === 1 ? 'jugador' : 'jugadores';
    if (players.length > prevPlayerCount) {
      window.soundEngine.playerJoin();
    }
    prevPlayerCount = players.length;

    btnLockRoom.textContent = locked ? '🔒 Bloqueada' : '🔓 Abierta';

    if (players.length === 0) {
      lobbyPlayersArea.innerHTML =
        '<div class="lobby-waiting-msg">Esperando a los jugadores...</div>';
      return;
    }

    lobbyPlayersArea.innerHTML = players
      .map(
        (p) => `
        <button type="button" class="player-chip" data-kick="${escapeHtml(p.id)}" title="Clic para expulsar">
          <span>${escapeHtml(p.avatar)}</span>
          <span>${escapeHtml(p.nickname)}</span>
        </button>
      `
      )
      .join('');
  });

  lobbyPlayersArea.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-kick]');
    if (!chip || !currentPin) return;
    const playerId = chip.getAttribute('data-kick');
    socket.emit('host:kickPlayer', { pin: currentPin, playerId });
  });

  btnLockRoom.addEventListener('click', () => {
    if (currentPin) socket.emit('host:toggleLock', { pin: currentPin });
  });

  btnStartGame.addEventListener('click', () => {
    if (currentPin) socket.emit('host:start', { pin: currentPin });
  });

  // Intro
  socket.on('host:intro', ({ title, tag, questionCount }) => {
    introTag.textContent = tag || 'Cuestionario';
    introTitle.textContent = title;
    introSubtitle.textContent = `${questionCount} preguntas · ¡Prepárate!`;
    showView('intro');
    window.soundEngine.questionReveal();
  });

  // Pre-question
  socket.on('host:preQuestion', ({ questionIndex, totalQuestions, text }) => {
    preqCounter.textContent = `Pregunta ${questionIndex + 1} de ${totalQuestions}`;
    preqText.textContent = text;

    // Restart CSS bar animation cleanly
    preqBar.style.animation = 'none';
    void preqBar.offsetWidth;
    preqBar.style.animation = 'shrinkBar 3.5s linear forwards';

    showView('preQuestion');
  });

  // Active Question
  socket.on('host:question', ({ questionIndex, totalQuestions, text, answers, timeLimit, connectedPlayers }) => {
    hqProgress.textContent = `Pregunta ${questionIndex + 1} / ${totalQuestions}`;
    hqQuestionText.textContent = text;
    hqTimerCircle.textContent = String(timeLimit);
    hqTimerCircle.classList.remove('urgent');
    hqTimerCircle.style.visibility = 'visible';

    hqLivePrompt.classList.remove('hidden');
    hqResultsChart.classList.add('hidden');
    btnSkipQuestion.classList.remove('hidden');
    btnNextFromResults.classList.add('hidden');

    hqAnswerCount.textContent = '0';
    hqAnswerLabel.textContent = connectedPlayers > 0 ? `de ${connectedPlayers} respuestas` : 'Respuestas';
    lastTickSec = timeLimit;

    hqAnswersGrid.innerHTML = answers
      .map(
        (ans, idx) => `
        <div class="hq-answer-tile ans-color-${idx}">
          <span class="shape-icon">${window.PEPEHOOT_SHAPES[idx]}</span>
          <span>${escapeHtml(ans)}</span>
        </div>
      `
      )
      .join('');

    showView('question');
    window.soundEngine.questionReveal();
  });

  socket.on('host:timer', ({ remainingSec }) => {
    hqTimerCircle.textContent = String(remainingSec);
    if (remainingSec <= 5 && remainingSec > 0) {
      hqTimerCircle.classList.add('urgent');
      if (lastTickSec !== remainingSec) {
        window.soundEngine.countdownTick(true);
      }
    }
    lastTickSec = remainingSec;
  });

  socket.on('host:answerCount', ({ count, total }) => {
    hqAnswerCount.textContent = String(count);
    hqAnswerLabel.textContent = total > 0 ? `de ${total} respuestas` : 'Respuestas';
  });

  btnSkipQuestion.addEventListener('click', () => {
    if (currentPin) socket.emit('host:skip', { pin: currentPin });
  });

  // Question Results
  socket.on('host:questionResults', ({ answers, correct, counts, totalResponses, isLastQuestion }) => {
    window.soundEngine.timeUp();
    hqTimerCircle.style.visibility = 'hidden';
    hqLivePrompt.classList.add('hidden');
    hqResultsChart.classList.remove('hidden');
    btnSkipQuestion.classList.add('hidden');
    btnNextFromResults.classList.remove('hidden');
    btnNextFromResults.textContent = isLastQuestion ? 'Ver podio 🏆' : 'Siguiente';

    hqAnswerCount.textContent = String(totalResponses);
    hqAnswerLabel.textContent = totalResponses === 1 ? 'Respuesta' : 'Respuestas';

    const maxCount = Math.max(1, ...counts);
    hqResultsChart.innerHTML = counts
      .map((cnt, idx) => {
        const isCorrect = correct.includes(idx);
        const pct = Math.max(8, Math.round((cnt / maxCount) * 100));
        return `
          <div class="chart-col">
            <div class="chart-count" style="color:${isCorrect ? 'var(--k-green)' : '#444'};">
              ${isCorrect ? '✓ ' : ''}${cnt}
            </div>
            <div class="chart-bar ans-bg-${idx} ${isCorrect ? '' : 'dimmed'}" style="height:${pct}%;"></div>
            <div class="chart-footer ans-bg-${idx}">
              <span class="shape-icon" style="width:20px;height:20px;">${window.PEPEHOOT_SHAPES[idx]}</span>
            </div>
          </div>
        `;
      })
      .join('');

    hqAnswersGrid.innerHTML = answers
      .map((ans, idx) => {
        const isCorrect = correct.includes(idx);
        return `
          <div class="hq-answer-tile ans-color-${idx} ${isCorrect ? 'correct-highlight' : 'dimmed'}">
            <span class="shape-icon">${window.PEPEHOOT_SHAPES[idx]}</span>
            <span>${escapeHtml(ans)}</span>
            ${isCorrect ? '<span class="hq-answer-check">✓</span>' : ''}
          </div>
        `;
      })
      .join('');
  });

  btnNextFromResults.addEventListener('click', () => {
    if (currentPin) socket.emit('host:next', { pin: currentPin });
  });

  // Scoreboard
  socket.on('host:scoreboard', ({ questionIndex, totalQuestions, topPlayers }) => {
    sbSub.textContent = `Tras la pregunta ${questionIndex + 1} de ${totalQuestions}`;
    if (!topPlayers.length) {
      scoreboardList.innerHTML =
        '<div class="score-row"><span class="score-name" style="text-align:center;">Sin jugadores conectados</span></div>';
    } else {
      scoreboardList.innerHTML = topPlayers
        .map(
          (p, i) => `
          <div class="score-row ${i === 0 ? 'top-1' : ''}" style="animation-delay:${i * 70}ms;">
            <div class="score-rank">#${p.rank}</div>
            <div class="score-avatar">${escapeHtml(p.avatar)}</div>
            <div class="score-name">${escapeHtml(p.nickname)}</div>
            ${p.streak >= 2 ? `<span class="score-streak">🔥 x${p.streak}</span>` : ''}
            ${p.lastDelta > 0 ? `<span class="score-delta">+${p.lastDelta}</span>` : ''}
            <div class="score-points">${p.score}</div>
          </div>
        `
        )
        .join('');
    }
    showView('scoreboard');
  });

  btnNextFromScoreboard.addEventListener('click', () => {
    if (currentPin) socket.emit('host:next', { pin: currentPin });
  });

  // Podium
  socket.on('host:podium', ({ quizTitle, quizTag, totalQuestions, leaderboard }) => {
    lastLeaderboard = leaderboard || [];
    podiumQuizTag.textContent = `${quizTag} · Podio Final`;
    podiumQuizTitle.textContent = quizTitle;

    // Order on stage: 2nd (left), 1st (center), 3rd (right)
    const order = [
      { idx: 1, cls: 'podium-2', medal: '🥈', delay: '0.25s' },
      { idx: 0, cls: 'podium-1', medal: '🥇', delay: '0.55s' },
      { idx: 2, cls: 'podium-3', medal: '🥉', delay: '0.05s' },
    ];

    if (lastLeaderboard.length === 0) {
      podiumStage.innerHTML =
        '<div style="font-size:1.25rem;font-weight:800;opacity:0.85;">No participaron jugadores en esta partida.</div>';
      fullRankingCard.classList.add('hidden');
    } else {
      podiumStage.innerHTML = order
        .map(({ idx, cls, medal, delay }) => {
          const p = lastLeaderboard[idx];
          if (!p) return '';
          return `
            <div class="podium-col ${cls}" style="animation-delay:${delay};">
              <div class="podium-avatar">${escapeHtml(p.avatar)}</div>
              <div class="podium-name">${escapeHtml(p.nickname)}</div>
              <div class="podium-score">${p.score} pts · ${p.correctCount}/${totalQuestions}</div>
              <div class="podium-block">
                <div class="podium-medal">${medal}</div>
              </div>
            </div>
          `;
        })
        .join('');

      fullRankingBody.innerHTML = lastLeaderboard
        .map(
          (p) => `
          <tr>
            <td><strong>#${p.rank}</strong></td>
            <td>${escapeHtml(p.avatar)} <strong>${escapeHtml(p.nickname)}</strong></td>
            <td>${p.correctCount} / ${totalQuestions}</td>
            <td style="text-align:right;font-weight:900;color:var(--k-purple);">${p.score}</td>
          </tr>
        `
        )
        .join('');
      fullRankingCard.classList.remove('hidden');
    }

    showView('podium');
    window.soundEngine.podiumFanfare();
    launchConfetti();
  });

  btnPlayAgain.addEventListener('click', () => {
    if (!currentPin) return;
    socket.emit('host:playAgain', { pin: currentPin }, (res) => {
      if (res?.ok) {
        showView('lobby');
      }
    });
  });

  btnExportCsv.addEventListener('click', () => {
    if (!lastLeaderboard.length) return;
    const rows = [
      ['Posicion', 'Alumno', 'Puntuacion', 'Aciertos', 'Respondidas'],
      ...lastLeaderboard.map((p) => [
        p.rank,
        `"${String(p.nickname).replace(/"/g, '""')}"`,
        p.score,
        p.correctCount,
        p.totalAnswered,
      ]),
    ];
    const csv = '\uFEFF' + rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resultados_${currentQuiz?.id || 'pepehoot'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Lightweight confetti animation for podium
  function launchConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#ffcf33', '#e21b3c', '#1368ce', '#26890c', '#ffffff', '#ff6b9d'];
    const pieces = Array.from({ length: 110 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      w: 8 + Math.random() * 6,
      h: 5 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      vy: 2.5 + Math.random() * 4,
      vx: (Math.random() - 0.5) * 2.5,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.16,
    }));

    let frames = 0;
    function frame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frames++;
      if (frames < 220) {
        requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    requestAnimationFrame(frame);
  }
})();
