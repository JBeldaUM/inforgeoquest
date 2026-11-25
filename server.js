const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { loadAllQuizzes } = require('./excelLoader');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', quizzes: quizzesCache.length });
});

let quizzesCache = loadAllQuizzes();
console.log(`Cargados ${quizzesCache.length} cuestionarios desde Excel.`);

// Active game rooms keyed by 6-digit PIN string
const games = new Map();

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

function generatePin() {
  let pin;
  do {
    pin = String(Math.floor(100000 + Math.random() * 900000));
  } while (games.has(pin));
  return pin;
}

function sanitizeQuizForSummary(q) {
  return {
    id: q.id,
    filename: q.filename,
    tag: q.tag,
    title: q.title,
    theme: q.theme,
    questionCount: q.questionCount,
    totalTime: q.totalTime,
  };
}

// REST API
app.get('/api/quizzes', (req, res) => {
  res.json(quizzesCache.map(sanitizeQuizForSummary));
});

app.get('/api/quizzes/:id', (req, res) => {
  const quiz = quizzesCache.find((q) => q.id === req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Cuestionario no encontrado' });
  res.json(quiz);
});

app.post('/api/quizzes/reload', (req, res) => {
  quizzesCache = loadAllQuizzes();
  res.json({
    count: quizzesCache.length,
    quizzes: quizzesCache.map(sanitizeQuizForSummary),
  });
});

app.get('/api/server-info', (req, res) => {
  const ip = getLocalIp();
  const hostHeader = req.headers.host || `${ip}:${PORT}`;
  const protocol = req.protocol || 'http';
  res.json({
    port: PORT,
    localIp: ip,
    lanUrl: `http://${ip}:${PORT}`,
    requestOrigin: `${protocol}://${hostHeader}`,
  });
});

app.get('/api/qr', async (req, res) => {
  const text = String(req.query.text || '');
  if (!text) return res.status(400).json({ error: 'Missing text parameter' });
  try {
    const dataUrl = await QRCode.toDataURL(text, {
      width: 240,
      margin: 2,
      color: { dark: '#6b0f20', light: '#ffffff' },
    });
    res.json({ dataUrl });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo generar el código QR' });
  }
});

// Friendly routes for play / host
app.get('/play', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'play.html'));
});
app.get('/join', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'play.html'));
});
app.get('/host', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

// Game Helpers
function clearGameTimers(game) {
  if (game.phaseTimer) {
    clearTimeout(game.phaseTimer);
    game.phaseTimer = null;
  }
  if (game.tickInterval) {
    clearInterval(game.tickInterval);
    game.tickInterval = null;
  }
}

function getPlayersArray(game) {
  return Array.from(game.players.values());
}

function getSortedLeaderboard(game) {
  return getPlayersArray(game)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
      return a.joinedAt - b.joinedAt;
    })
    .map((p, idx) => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      streak: p.streak,
      correctCount: p.correctCount,
      totalAnswered: p.totalAnswered,
      lastDelta: p.lastDelta,
      connected: p.connected,
      rank: idx + 1,
    }));
}

function emitLobbyUpdate(game) {
  const players = getPlayersArray(game)
    .filter((p) => p.connected)
    .map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
    }));
  io.to(game.hostSocketId).emit('host:lobbyUpdate', {
    players,
    locked: game.locked,
  });
}

function startPreQuestion(game) {
  clearGameTimers(game);
  const question = game.quiz.questions[game.currentQuestionIndex];
  if (!question) {
    finishGame(game);
    return;
  }

  game.state = 'PRE_QUESTION';
  game.currentAnswers = new Map(); // playerId -> { indices, elapsedMs, correct, points }

  // Reset per-question tracking
  for (const player of game.players.values()) {
    player.lastDelta = 0;
    player.lastCorrect = null;
  }

  const payload = {
    questionIndex: game.currentQuestionIndex,
    totalQuestions: game.quiz.questions.length,
    text: question.text,
    timeLimit: question.timeLimit,
    multiSelect: question.multiSelect,
    prepDurationMs: 3500,
  };

  io.to(game.hostSocketId).emit('host:preQuestion', payload);
  io.to(`room:${game.pin}`).emit('player:preQuestion', {
    questionIndex: game.currentQuestionIndex,
    totalQuestions: game.quiz.questions.length,
    multiSelect: question.multiSelect,
  });

  game.phaseTimer = setTimeout(() => {
    startQuestion(game);
  }, 3500);
}

function startQuestion(game) {
  clearGameTimers(game);
  const question = game.quiz.questions[game.currentQuestionIndex];
  if (!question) return;

  game.state = 'QUESTION';
  game.questionStartedAt = Date.now();
  game.questionEndsAt = game.questionStartedAt + question.timeLimit * 1000;

  const connectedCount = getPlayersArray(game).filter((p) => p.connected).length;

  io.to(game.hostSocketId).emit('host:question', {
    questionIndex: game.currentQuestionIndex,
    totalQuestions: game.quiz.questions.length,
    text: question.text,
    answers: question.answers,
    timeLimit: question.timeLimit,
    multiSelect: question.multiSelect,
    connectedPlayers: connectedCount,
  });

  io.to(`room:${game.pin}`).emit('player:question', {
    questionIndex: game.currentQuestionIndex,
    totalQuestions: game.quiz.questions.length,
    text: question.text,
    answers: question.answers,
    timeLimit: question.timeLimit,
    multiSelect: question.multiSelect,
  });

  game.tickInterval = setInterval(() => {
    const remainingMs = Math.max(0, game.questionEndsAt - Date.now());
    const remainingSec = Math.ceil(remainingMs / 1000);
    io.to(game.hostSocketId).emit('host:timer', { remainingSec, remainingMs });
    if (remainingMs <= 0) {
      endQuestion(game);
    }
  }, 200);
}

function endQuestion(game) {
  if (game.state !== 'QUESTION') return;
  clearGameTimers(game);
  game.state = 'QUESTION_RESULTS';

  const question = game.quiz.questions[game.currentQuestionIndex];
  const counts = new Array(question.answers.length).fill(0);

  // Update streaks for players who did NOT answer
  for (const player of game.players.values()) {
    if (!game.currentAnswers.has(player.id)) {
      player.streak = 0;
      player.lastDelta = 0;
      player.lastCorrect = false;
      player.lastTimedOut = true;
    }
  }

  for (const entry of game.currentAnswers.values()) {
    entry.indices.forEach((idx) => {
      if (idx >= 0 && idx < counts.length) counts[idx]++;
    });
  }

  const leaderboard = getSortedLeaderboard(game);
  const rankMap = new Map(leaderboard.map((p) => [p.id, p]));

  // Send individual result to each player
  for (const player of game.players.values()) {
    if (!player.socketId) continue;
    const entry = game.currentAnswers.get(player.id);
    const rankInfo = rankMap.get(player.id);
    const rank = rankInfo ? rankInfo.rank : leaderboard.length;
    const aheadPlayer = rank > 1 ? leaderboard[rank - 2] : null;
    const pointsBehind = aheadPlayer ? aheadPlayer.score - player.score : 0;

    io.to(player.socketId).emit('player:questionResult', {
      correct: entry ? entry.correct : false,
      timedOut: !entry,
      pointsEarned: entry ? entry.points : 0,
      totalScore: player.score,
      streak: player.streak,
      rank,
      totalPlayers: leaderboard.length,
      aheadNickname: aheadPlayer ? aheadPlayer.nickname : null,
      pointsBehind,
      correctAnswers: question.correct.map((i) => question.answers[i]),
    });
  }

  io.to(game.hostSocketId).emit('host:questionResults', {
    questionIndex: game.currentQuestionIndex,
    totalQuestions: game.quiz.questions.length,
    text: question.text,
    answers: question.answers,
    correct: question.correct,
    counts,
    totalResponses: game.currentAnswers.size,
    isLastQuestion: game.currentQuestionIndex >= game.quiz.questions.length - 1,
  });
}

function showScoreboard(game) {
  clearGameTimers(game);
  game.state = 'SCOREBOARD';
  const leaderboard = getSortedLeaderboard(game);

  io.to(game.hostSocketId).emit('host:scoreboard', {
    questionIndex: game.currentQuestionIndex,
    totalQuestions: game.quiz.questions.length,
    topPlayers: leaderboard.slice(0, 5),
    totalPlayers: leaderboard.length,
  });

  io.to(`room:${game.pin}`).emit('player:scoreboard', {
    topPlayers: leaderboard.slice(0, 5),
  });
}

function finishGame(game) {
  clearGameTimers(game);
  game.state = 'PODIUM';
  const leaderboard = getSortedLeaderboard(game);

  io.to(game.hostSocketId).emit('host:podium', {
    quizTitle: game.quiz.title,
    quizTag: game.quiz.tag,
    totalQuestions: game.quiz.questions.length,
    leaderboard,
  });

  for (const entry of leaderboard) {
    const player = game.players.get(entry.id);
    if (player && player.socketId) {
      io.to(player.socketId).emit('player:podium', {
        rank: entry.rank,
        totalPlayers: leaderboard.length,
        score: entry.score,
        correctCount: entry.correctCount,
        totalQuestions: game.quiz.questions.length,
        nickname: entry.nickname,
        avatar: entry.avatar,
      });
    }
  }
}

function isAnswerCorrect(selectedIndices, correctIndices, multiSelect) {
  if (!Array.isArray(selectedIndices) || selectedIndices.length === 0) return false;
  const uniqueSelected = [...new Set(selectedIndices)].sort((a, b) => a - b);
  const sortedCorrect = [...correctIndices].sort((a, b) => a - b);
  if (multiSelect) {
    return (
      uniqueSelected.length === sortedCorrect.length &&
      uniqueSelected.every((val, i) => val === sortedCorrect[i])
    );
  }
  return sortedCorrect.includes(uniqueSelected[0]);
}

// Socket.IO Events
io.on('connection', (socket) => {
  // HOST: Create game room
  socket.on('host:create', ({ quizId }, callback) => {
    const quiz = quizzesCache.find((q) => q.id === quizId);
    if (!quiz) {
      return callback?.({ error: 'Cuestionario no encontrado' });
    }
    const pin = generatePin();
    const game = {
      pin,
      quiz,
      hostSocketId: socket.id,
      state: 'LOBBY',
      locked: false,
      currentQuestionIndex: 0,
      players: new Map(),
      currentAnswers: new Map(),
      phaseTimer: null,
      tickInterval: null,
      createdAt: Date.now(),
    };
    games.set(pin, game);
    socket.data.role = 'host';
    socket.data.pin = pin;

    callback?.({
      pin,
      quiz: sanitizeQuizForSummary(quiz),
    });
  });

  socket.on('host:toggleLock', ({ pin }) => {
    const game = games.get(pin);
    if (!game || game.hostSocketId !== socket.id) return;
    game.locked = !game.locked;
    emitLobbyUpdate(game);
  });

  socket.on('host:kickPlayer', ({ pin, playerId }) => {
    const game = games.get(pin);
    if (!game || game.hostSocketId !== socket.id) return;
    const player = game.players.get(playerId);
    if (!player) return;
    if (player.socketId) {
      io.to(player.socketId).emit('player:kicked');
      const targetSocket = io.sockets.sockets.get(player.socketId);
      if (targetSocket) targetSocket.leave(`room:${pin}`);
    }
    game.players.delete(playerId);
    emitLobbyUpdate(game);
  });

  socket.on('host:start', ({ pin }) => {
    const game = games.get(pin);
    if (!game || game.hostSocketId !== socket.id || game.state !== 'LOBBY') return;

    game.state = 'INTRO';
    game.currentQuestionIndex = 0;

    io.to(game.hostSocketId).emit('host:intro', {
      title: game.quiz.title,
      tag: game.quiz.tag,
      questionCount: game.quiz.questions.length,
    });
    io.to(`room:${pin}`).emit('player:intro', {
      title: game.quiz.title,
      questionCount: game.quiz.questions.length,
    });

    game.phaseTimer = setTimeout(() => {
      startPreQuestion(game);
    }, 3000);
  });

  socket.on('host:skip', ({ pin }) => {
    const game = games.get(pin);
    if (!game || game.hostSocketId !== socket.id) return;
    if (game.state === 'QUESTION') {
      endQuestion(game);
    }
  });

  socket.on('host:next', ({ pin }) => {
    const game = games.get(pin);
    if (!game || game.hostSocketId !== socket.id) return;

    if (game.state === 'QUESTION_RESULTS') {
      if (game.currentQuestionIndex >= game.quiz.questions.length - 1) {
        finishGame(game);
      } else {
        showScoreboard(game);
      }
    } else if (game.state === 'SCOREBOARD') {
      game.currentQuestionIndex++;
      startPreQuestion(game);
    }
  });

  socket.on('host:playAgain', ({ pin }, callback) => {
    const game = games.get(pin);
    if (!game || game.hostSocketId !== socket.id) return;
    clearGameTimers(game);
    game.state = 'LOBBY';
    game.currentQuestionIndex = 0;
    game.currentAnswers = new Map();
    for (const player of game.players.values()) {
      player.score = 0;
      player.streak = 0;
      player.correctCount = 0;
      player.totalAnswered = 0;
      player.lastDelta = 0;
    }
    io.to(`room:${pin}`).emit('player:backToLobby', { pin });
    emitLobbyUpdate(game);
    callback?.({ ok: true });
  });

  // PLAYER: Check PIN
  socket.on('player:checkPin', ({ pin }, callback) => {
    const cleanPin = String(pin || '').replace(/\s+/g, '');
    const game = games.get(cleanPin);
    if (!game) {
      return callback?.({ ok: false, error: 'No encontramos ninguna partida con ese PIN.' });
    }
    if (game.locked) {
      return callback?.({ ok: false, error: 'La sala está bloqueada por el profesor.' });
    }
    if (game.state === 'PODIUM') {
      return callback?.({ ok: false, error: 'Esta partida ya ha finalizado.' });
    }
    callback?.({ ok: true, pin: cleanPin, quizTitle: game.quiz.title });
  });

  // PLAYER: Join room
  socket.on('player:join', ({ pin, nickname, avatar }, callback) => {
    const cleanPin = String(pin || '').replace(/\s+/g, '');
    const cleanName = String(nickname || '').trim().slice(0, 20);
    const cleanAvatar = String(avatar || '🦊');

    const game = games.get(cleanPin);
    if (!game) {
      return callback?.({ ok: false, error: 'Partida no encontrada.' });
    }
    if (game.locked) {
      return callback?.({ ok: false, error: 'La sala está bloqueada.' });
    }
    if (!cleanName) {
      return callback?.({ ok: false, error: 'Introduce un nombre para jugar.' });
    }

    // Check duplicate nickname (allow reconnect if disconnected)
    const existing = getPlayersArray(game).find(
      (p) => p.nickname.toLowerCase() === cleanName.toLowerCase()
    );

    let player;
    if (existing) {
      if (existing.connected) {
        return callback?.({ ok: false, error: 'Ese nombre ya está en uso. Elige otro.' });
      }
      // Reconnect player
      existing.socketId = socket.id;
      existing.connected = true;
      existing.avatar = cleanAvatar || existing.avatar;
      player = existing;
    } else {
      const id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      player = {
        id,
        socketId: socket.id,
        nickname: cleanName,
        avatar: cleanAvatar,
        score: 0,
        streak: 0,
        correctCount: 0,
        totalAnswered: 0,
        lastDelta: 0,
        connected: true,
        joinedAt: Date.now(),
      };
      game.players.set(id, player);
    }

    socket.join(`room:${cleanPin}`);
    socket.data.role = 'player';
    socket.data.pin = cleanPin;
    socket.data.playerId = player.id;

    emitLobbyUpdate(game);

    // If joined mid-game during active question, let them participate immediately
    let activeQuestion = null;
    if (game.state === 'QUESTION' && !game.currentAnswers.has(player.id)) {
      const q = game.quiz.questions[game.currentQuestionIndex];
      activeQuestion = {
        questionIndex: game.currentQuestionIndex,
        totalQuestions: game.quiz.questions.length,
        text: q.text,
        answers: q.answers,
        timeLimit: q.timeLimit,
        multiSelect: q.multiSelect,
      };
    }

    callback?.({
      ok: true,
      playerId: player.id,
      nickname: player.nickname,
      avatar: player.avatar,
      state: game.state,
      score: player.score,
      activeQuestion,
    });
  });

  // PLAYER: Submit answer
  socket.on('player:answer', ({ pin, answerIndices }, callback) => {
    const game = games.get(pin);
    if (!game || game.state !== 'QUESTION') {
      return callback?.({ ok: false });
    }
    const player = game.players.get(socket.data.playerId);
    if (!player || game.currentAnswers.has(player.id)) {
      return callback?.({ ok: false });
    }

    const question = game.quiz.questions[game.currentQuestionIndex];
    const indices = Array.isArray(answerIndices) ? answerIndices : [answerIndices];
    const elapsedMs = Math.max(0, Date.now() - game.questionStartedAt);
    const timeLimitMs = question.timeLimit * 1000;
    const ratio = Math.min(1, elapsedMs / timeLimitMs);

    const correct = isAnswerCorrect(indices, question.correct, question.multiSelect);
    let points = 0;

    player.totalAnswered++;
    if (correct) {
      player.streak++;
      player.correctCount++;
      const speedPoints = Math.round((1 - ratio / 2) * 1000);
      points = speedPoints;
      player.score += points;
    } else {
      player.streak = 0;
    }
    player.lastDelta = points;
    player.lastCorrect = correct;

    game.currentAnswers.set(player.id, {
      indices,
      elapsedMs,
      correct,
      points,
    });

    const connectedPlayers = getPlayersArray(game).filter((p) => p.connected);
    io.to(game.hostSocketId).emit('host:answerCount', {
      count: game.currentAnswers.size,
      total: connectedPlayers.length,
    });

    callback?.({ ok: true });

    // Auto-finish question if all connected players have answered
    const allAnswered =
      connectedPlayers.length > 0 &&
      connectedPlayers.every((p) => game.currentAnswers.has(p.id));
    if (allAnswered) {
      clearGameTimers(game);
      game.phaseTimer = setTimeout(() => endQuestion(game), 600);
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const { role, pin, playerId } = socket.data || {};
    if (!pin) return;
    const game = games.get(pin);
    if (!game) return;

    if (role === 'host' && game.hostSocketId === socket.id) {
      clearGameTimers(game);
      io.to(`room:${pin}`).emit('player:hostDisconnected');
      games.delete(pin);
    } else if (role === 'player' && playerId) {
      const player = game.players.get(playerId);
      if (player) {
        player.connected = false;
        player.socketId = null;
        if (game.state === 'LOBBY') {
          emitLobbyUpdate(game);
        } else if (game.state === 'QUESTION') {
          const connectedPlayers = getPlayersArray(game).filter((p) => p.connected);
          io.to(game.hostSocketId).emit('host:answerCount', {
            count: game.currentAnswers.size,
            total: connectedPlayers.length,
          });
          if (
            connectedPlayers.length > 0 &&
            connectedPlayers.every((p) => game.currentAnswers.has(p.id))
          ) {
            clearGameTimers(game);
            game.phaseTimer = setTimeout(() => endQuestion(game), 600);
          }
        }
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIp();
  console.log(`\n========================================`);
  console.log(`  InforGeoQuest en marcha`);
  console.log(`  Local:  http://localhost:${PORT}`);
  console.log(`  Red:    http://${ip}:${PORT}`);
  console.log(`========================================\n`);
});
