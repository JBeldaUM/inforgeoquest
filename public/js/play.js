(function () {
  const socket = io();

  const views = {
    pin: document.getElementById('viewPin'),
    nickname: document.getElementById('viewNickname'),
    lobby: document.getElementById('viewLobby'),
    waiting: document.getElementById('viewWaiting'),
    question: document.getElementById('viewQuestion'),
    result: document.getElementById('viewResult'),
    podium: document.getElementById('viewPodium'),
    message: document.getElementById('viewMessage'),
  };

  // PIN elements
  const pinForm = document.getElementById('pinForm');
  const pinInput = document.getElementById('pinInput');
  const pinError = document.getElementById('pinError');

  // Nickname elements
  const joinQuizTitle = document.getElementById('joinQuizTitle');
  const avatarPicker = document.getElementById('avatarPicker');
  const nicknameForm = document.getElementById('nicknameForm');
  const nicknameInput = document.getElementById('nicknameInput');
  const nicknameError = document.getElementById('nicknameError');

  // Lobby & Waiting elements
  const lobbyPlayerAvatar = document.getElementById('lobbyPlayerAvatar');
  const lobbyPlayerName = document.getElementById('lobbyPlayerName');
  const waitingTitle = document.getElementById('waitingTitle');
  const waitingSub = document.getElementById('waitingSub');

  // Question elements
  const pqPlayerIdentity = document.getElementById('pqPlayerIdentity');
  const pqProgress = document.getElementById('pqProgress');
  const pqScorePill = document.getElementById('pqScorePill');
  const pqQuestionText = document.getElementById('pqQuestionText');
  const pqTimerFill = document.getElementById('pqTimerFill');
  const pqAnswerPad = document.getElementById('pqAnswerPad');

  // Result elements
  const resPlayerIdentity = document.getElementById('resPlayerIdentity');
  const resScorePill = document.getElementById('resScorePill');
  const resFeedbackScreen = document.getElementById('resFeedbackScreen');
  const resBadge = document.getElementById('resBadge');
  const resHeading = document.getElementById('resHeading');
  const resPoints = document.getElementById('resPoints');
  const resStreak = document.getElementById('resStreak');
  const resRankInfo = document.getElementById('resRankInfo');
  const resCorrectAnswer = document.getElementById('resCorrectAnswer');

  // Podium & Message elements
  const podMedal = document.getElementById('podMedal');
  const podRankTitle = document.getElementById('podRankTitle');
  const podName = document.getElementById('podName');
  const podScore = document.getElementById('podScore');
  const podAccuracy = document.getElementById('podAccuracy');
  const msgTitle = document.getElementById('msgTitle');
  const msgSub = document.getElementById('msgSub');

  let currentPin = null;
  let selectedAvatar = window.PEPEHOOT_AVATARS[0];
  let playerNickname = '';
  let playerScore = 0;
  let answeredCurrent = false;
  let timerInterval = null;

  function showView(name) {
    Object.entries(views).forEach(([key, el]) => {
      el.classList.toggle('hidden', key !== name);
    });
  }

  function showWaiting(title, sub) {
    waitingTitle.textContent = title;
    waitingSub.textContent = sub;
    showView('waiting');
  }

  function clearLocalTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // Render avatar picker
  avatarPicker.innerHTML = window.PEPEHOOT_AVATARS.map(
    (av, idx) =>
      `<button type="button" class="avatar-opt ${idx === 0 ? 'selected' : ''}" data-avatar="${av}">${av}</button>`
  ).join('');

  avatarPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-avatar]');
    if (!btn) return;
    selectedAvatar = btn.getAttribute('data-avatar');
    avatarPicker.querySelectorAll('.avatar-opt').forEach((el) => el.classList.remove('selected'));
    btn.classList.add('selected');
  });

  function checkPinAndAdvance(pin) {
    pinError.classList.add('hidden');
    socket.emit('player:checkPin', { pin }, (res) => {
      if (!res || !res.ok) {
        pinError.textContent = res?.error || 'PIN no válido.';
        pinError.classList.remove('hidden');
        showView('pin');
        return;
      }
      currentPin = res.pin;
      joinQuizTitle.textContent = res.quizTitle || '';
      showView('nickname');
      nicknameInput.focus();
    });
  }

  pinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = pinInput.value.replace(/\s+/g, '');
    if (!pin) return;
    checkPinAndAdvance(pin);
  });

  nicknameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    nicknameError.classList.add('hidden');
    const nickname = nicknameInput.value.trim();
    if (!nickname || !currentPin) return;

    socket.emit(
      'player:join',
      { pin: currentPin, nickname, avatar: selectedAvatar },
      (res) => {
        if (!res || !res.ok) {
          nicknameError.textContent = res?.error || 'No se pudo unir a la partida.';
          nicknameError.classList.remove('hidden');
          return;
        }

        playerNickname = res.nickname;
        selectedAvatar = res.avatar;
        playerScore = res.score || 0;

        const identity = `${selectedAvatar} ${playerNickname}`;
        lobbyPlayerAvatar.textContent = selectedAvatar;
        lobbyPlayerName.textContent = playerNickname;
        pqPlayerIdentity.textContent = identity;
        resPlayerIdentity.textContent = identity;
        pqScorePill.textContent = String(playerScore);
        resScorePill.textContent = String(playerScore);

        if (res.activeQuestion) {
          renderQuestion(res.activeQuestion);
        } else if (res.state === 'LOBBY') {
          showView('lobby');
        } else {
          showWaiting('¡Estás dentro!', 'Esperando a la siguiente pregunta...');
        }
      }
    );
  });

  function renderQuestion({ questionIndex, totalQuestions, text, answers, timeLimit }) {
    clearLocalTimer();
    answeredCurrent = false;

    pqProgress.textContent = `${questionIndex + 1} / ${totalQuestions}`;
    pqScorePill.textContent = String(playerScore);
    pqQuestionText.textContent = text;
    pqTimerFill.style.width = '100%';

    pqAnswerPad.innerHTML = answers
      .map(
        (ans, idx) => `
        <button type="button" class="pad-btn ans-color-${idx}" data-answer="${idx}">
          <span class="shape-icon">${window.PEPEHOOT_SHAPES[idx]}</span>
          <span class="pad-btn-text">${escapeHtml(ans)}</span>
        </button>
      `
      )
      .join('');

    showView('question');

    const startedAt = Date.now();
    const totalMs = (timeLimit || 20) * 1000;
    timerInterval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.max(0, 100 - (elapsed / totalMs) * 100);
      pqTimerFill.style.width = `${pct}%`;
      if (pct <= 0) clearLocalTimer();
    }, 100);
  }

  pqAnswerPad.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-answer]');
    if (!btn || answeredCurrent || !currentPin) return;
    answeredCurrent = true;
    clearLocalTimer();

    const answerIdx = parseInt(btn.getAttribute('data-answer'), 10);
    socket.emit('player:answer', { pin: currentPin, answerIndices: [answerIdx] }, (res) => {
      if (res?.ok) {
        showWaiting('¡Respuesta enviada!', 'Esperando al resto de la clase...');
      }
    });
  });

  // Socket game lifecycle events
  socket.on('player:intro', ({ title }) => {
    showWaiting('¡Comenzamos!', title || 'Prepárate para jugar');
  });

  socket.on('player:preQuestion', ({ questionIndex, totalQuestions }) => {
    clearLocalTimer();
    showWaiting(`Pregunta ${questionIndex + 1} de ${totalQuestions}`, '¡Prepárate para responder!');
  });

  socket.on('player:question', (payload) => {
    renderQuestion(payload);
  });

  socket.on('player:questionResult', (data) => {
    clearLocalTimer();
    playerScore = data.totalScore;
    pqScorePill.textContent = String(playerScore);
    resScorePill.textContent = String(playerScore);

    if (data.correct) {
      resFeedbackScreen.className = 'feedback-screen is-correct';
      resBadge.textContent = '✓';
      resHeading.textContent = '¡Correcto!';
      resPoints.textContent = `+ ${data.pointsEarned}`;
      resPoints.classList.remove('hidden');
      resCorrectAnswer.classList.add('hidden');
      window.soundEngine.correct();
    } else {
      resFeedbackScreen.className = 'feedback-screen is-wrong';
      resBadge.textContent = '✕';
      resHeading.textContent = data.timedOut ? '¡Se acabó el tiempo!' : 'Incorrecto';
      resPoints.classList.add('hidden');
      if (data.correctAnswers && data.correctAnswers.length) {
        resCorrectAnswer.textContent = `Respuesta correcta: ${data.correctAnswers.join(', ')}`;
        resCorrectAnswer.classList.remove('hidden');
      } else {
        resCorrectAnswer.classList.add('hidden');
      }
      window.soundEngine.wrong();
    }

    if (data.streak >= 2) {
      resStreak.textContent = `🔥 Racha de aciertos: ${data.streak}`;
      resStreak.classList.remove('hidden');
    } else {
      resStreak.classList.add('hidden');
    }

    if (data.rank === 1) {
      resRankInfo.textContent = `¡Vas en 1.º lugar de ${data.totalPlayers}!`;
    } else if (data.aheadNickname) {
      resRankInfo.textContent = `Vas en ${data.rank}.º lugar · a ${data.pointsBehind} pts de ${data.aheadNickname}`;
    } else {
      resRankInfo.textContent = `Posición: ${data.rank}.º de ${data.totalPlayers}`;
    }

    showView('result');
  });

  socket.on('player:scoreboard', () => {
    showWaiting('Marcador en pantalla', `Tu puntuación actual: ${playerScore} pts`);
  });

  socket.on('player:podium', ({ rank, totalPlayers, score, correctCount, totalQuestions, nickname, avatar }) => {
    clearLocalTimer();
    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    podMedal.textContent = medals[rank] || '🏅';
    podRankTitle.textContent = `${rank}.º lugar de ${totalPlayers}`;
    podName.textContent = `${avatar} ${nickname}`;
    podScore.textContent = `${score} pts`;
    podAccuracy.textContent = `${correctCount} de ${totalQuestions} respuestas correctas`;
    showView('podium');
    if (rank <= 3) window.soundEngine.podiumFanfare();
  });

  socket.on('player:backToLobby', () => {
    playerScore = 0;
    pqScorePill.textContent = '0';
    resScorePill.textContent = '0';
    showView('lobby');
  });

  socket.on('player:kicked', () => {
    clearLocalTimer();
    msgTitle.textContent = 'Has salido de la sala';
    msgSub.textContent = 'El profesor te ha desconectado de esta partida.';
    showView('message');
  });

  socket.on('player:hostDisconnected', () => {
    clearLocalTimer();
    msgTitle.textContent = 'La partida ha terminado';
    msgSub.textContent = 'El profesor ha cerrado la sala.';
    showView('message');
  });

  // Auto-check PIN if provided in query string (?pin=123456)
  const params = new URLSearchParams(window.location.search);
  const urlPin = params.get('pin');
  if (urlPin) {
    pinInput.value = urlPin;
    socket.on('connect', () => {
      if (!currentPin) checkPinAndAdvance(urlPin);
    });
  }
})();
