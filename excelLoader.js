const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const BUNDLED_DIR = path.join(__dirname, 'quizzes');
const PARENT_DIR = path.resolve(__dirname, '..');
const EXCEL_DIR = fs.existsSync(BUNDLED_DIR) ? BUNDLED_DIR : PARENT_DIR;

const COVER_THEMES = [
  { bg: 'linear-gradient(135deg, #46178f 0%, #864cbf 100%)', accent: '#46178f', icon: '💻' },
  { bg: 'linear-gradient(135deg, #1368ce 0%, #45a3e5 100%)', accent: '#1368ce', icon: '🖥️' },
  { bg: 'linear-gradient(135deg, #26890c 0%, #66bf39 100%)', accent: '#26890c', icon: '⚙️' },
  { bg: 'linear-gradient(135deg, #d89e00 0%, #ffa602 100%)', accent: '#d89e00', icon: '📊' },
  { bg: 'linear-gradient(135deg, #e21b3c 0%, #ff3355 100%)', accent: '#e21b3c', icon: '🗄️' },
  { bg: 'linear-gradient(135deg, #008299 0%, #00b8d4 100%)', accent: '#008299', icon: '🌐' },
];

const ACCENT_FIXES = {
  Introduccion: 'Introducción',
  Informatica: 'Informática',
  Proposito: 'Propósito',
  Basicos: 'Básicos',
  Gestion: 'Gestión',
  Computacion: 'Computación',
  Programacion: 'Programación',
  Logica: 'Lógica',
  Redes: 'Redes',
  Bases: 'Bases',
  Sistemas: 'Sistemas',
  Operativos: 'Operativos',
  Componentes: 'Componentes',
  Ordenador: 'Ordenador',
  Software: 'Software',
  General: 'General',
  Datos: 'Datos',
  Computadoras: 'Computadoras',
};

function formatQuizMeta(filename, index) {
  const base = filename.replace(/\.xlsx$/i, '');
  const id = base
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  let cleaned = base.replace(/^kahoot[_\-\s]+/i, '');
  let tag = `Cuestionario ${index + 1}`;
  const topicMatch = cleaned.match(/^T(\d+)[_\-\s]+(.*)$/i);
  if (topicMatch) {
    tag = `Tema ${topicMatch[1]}`;
    cleaned = topicMatch[2];
  }

  const words = cleaned
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w, i) => {
      const fixed = ACCENT_FIXES[w] || w;
      if (i > 0 && ['de', 'del', 'la', 'el', 'los', 'las', 'a', 'en', 'y'].includes(fixed.toLowerCase())) {
        return fixed.toLowerCase();
      }
      return fixed;
    });

  const title = words.join(' ') || base;
  const theme = COVER_THEMES[index % COVER_THEMES.length];

  return { id, filename, tag, title, theme };
}

function parseCorrectAnswers(rawValue, numAnswers) {
  if (rawValue === undefined || rawValue === null) return [];
  const str = String(rawValue).trim();
  if (!str) return [];
  return str
    .split(/[,;\s]+/)
    .map((part) => parseInt(part, 10) - 1)
    .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < numAnswers);
}

function parseExcelFile(filePath, filename, index) {
  const workbook = XLSX.readFile(filePath, { cellText: true, cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return null;

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Locate header row (row containing "Question" in col B / index 1)
  let startRow = 8; // default 0-indexed row 8 => Excel row 9
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const colB = String(rows[i]?.[1] || '').toLowerCase();
    if (colB.includes('question') || colB.includes('pregunta')) {
      startRow = i + 1;
      break;
    }
  }

  const questions = [];
  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const questionText = String(row[1] ?? '').trim();
    if (!questionText) continue;

    const rawAnswers = [row[2], row[3], row[4], row[5]]
      .map((val) => String(val ?? '').trim());

    // Keep non-empty answers while preserving order
    const answers = [];
    const indexMap = {};
    rawAnswers.forEach((ans, origIdx) => {
      if (ans.length > 0) {
        indexMap[origIdx] = answers.length;
        answers.push(ans);
      }
    });

    if (answers.length < 2) continue;

    const parsedCorrectOrig = parseCorrectAnswers(row[7], 4);
    const correct = parsedCorrectOrig
      .map((origIdx) => indexMap[origIdx])
      .filter((mapped) => mapped !== undefined);

    if (correct.length === 0) continue;

    const parsedTime = parseInt(String(row[6] ?? ''), 10);
    const timeLimit = Number.isInteger(parsedTime) && parsedTime >= 5 && parsedTime <= 240 ? parsedTime : 20;

    questions.push({
      index: questions.length,
      text: questionText,
      answers,
      timeLimit,
      correct,
      multiSelect: correct.length > 1,
    });
  }

  if (questions.length === 0) return null;

  const meta = formatQuizMeta(filename, index);
  const totalTime = questions.reduce((sum, q) => sum + q.timeLimit, 0);

  return {
    ...meta,
    questionCount: questions.length,
    totalTime,
    questions,
  };
}

function loadAllQuizzes() {
  const files = fs
    .readdirSync(EXCEL_DIR)
    .filter((f) => /\.xlsx$/i.test(f) && !f.startsWith('~$') && f.toLowerCase() !== 'template.xlsx')
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));

  const quizzes = [];
  files.forEach((filename) => {
    try {
      const fullPath = path.join(EXCEL_DIR, filename);
      const quiz = parseExcelFile(fullPath, filename, quizzes.length);
      if (quiz) {
        quizzes.push(quiz);
      }
    } catch (err) {
      console.error(`Error leyendo ${filename}:`, err.message);
    }
  });

  return quizzes;
}

module.exports = { loadAllQuizzes, EXCEL_DIR };
