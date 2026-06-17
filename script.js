/**
 * Bible Millionaire - Core JavaScript Game Logic
 * Features:
 * - Web Audio API Synthesizer (Zero-dependency audio)
 * - Dynamic Fisher-Yates shuffling
 * - 50:50, Ask Audience, and Bible Hint lifelines
 * - Safe level recovery
 * - LocalStorage state saving
 * - Custom HTML5 Canvas confetti animation
 * - Native <dialog> handling with Safari fallbacks
 */

// --- Audio Synthesizer Engine ---
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.droneNode = null;
    this.muted = false;
    this.audioUnlocked = false;

    // Background theme music (home/results) — MP3 in project root
    this.music = new Audio('Who Wants To Be A Millionaire Intro 2011.mp3');
    this.music.loop = true;
    this.music.volume = 0.55;
    this.music.preload = 'auto';

    // In-game suspense track (loops while playing)
    this.suspense = new Audio('Who Wants to be a Millionaire Suspense - Sound Effect (HD).mp3');
    this.suspense.loop = true;
    this.suspense.volume = 0.6;
    this.suspense.preload = 'auto';
  }

  // Must be called on first user gesture to unlock AudioContext + HTML Audio
  unlock() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (this.audioUnlocked) return;
    this.audioUnlocked = true;

    // Prime HTML Audio on user gesture (required by browsers)
    [this.music, this.suspense].forEach((el) => {
      el.load();
    });

    // Start theme music immediately after first click if on home/results
    if (!this.muted && gameState.screen !== 'game') {
      this.playMusic();
    }
  }

  init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  _playHtmlAudio(audioEl, restart = true) {
    if (this.muted) return;
    if (restart) audioEl.currentTime = 0;
    const playPromise = audioEl.play();
    if (playPromise) {
      playPromise.catch((err) => {
        console.warn('Audio playback blocked:', err.message);
      });
    }
  }

  // ── Theme music helpers ───────────────────────────────────

  playMusic() {
    if (this.muted) return;
    this.stopSuspense();
    this._playHtmlAudio(this.music, true);
  }

  stopMusic() {
    this.music.pause();
    this.music.currentTime = 0;
  }

  pauseMusic() {
    this.music.pause();
  }

  // ── Suspense track helpers ────────────────────────────────

  playSuspense() {
    if (this.muted) return;
    this.pauseMusic();
    if (this.suspense.paused) {
      this._playHtmlAudio(this.suspense, false);
    }
  }

  stopSuspense() {
    this.suspense.pause();
    this.suspense.currentTime = 0;
  }

  // stopDrone stops the suspense track and cleans up any synth nodes
  stopDrone() {
    this.stopSuspense();
    if (this.droneNode) {
      try { this.droneNode.osc1.stop(); } catch (e) {}
      try { this.droneNode.osc2.stop(); } catch (e) {}
      this.droneNode = null;
    }
  }

  // ── Mute toggle — controls everything ────────────────────

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      this.pauseMusic();
      this.stopSuspense();
      if (this.droneNode) {
        try { this.droneNode.osc1.stop(); } catch (e) {}
        try { this.droneNode.osc2.stop(); } catch (e) {}
        this.droneNode = null;
      }
    } else {
      if (gameState.screen === 'game') {
        this.playSuspense();
      } else {
        this.playMusic();
      }
    }
    return this.muted;
  }

  // Short click confirmation beep — plays alongside MP3 tracks
  playBeep() {
    if (this.muted) return;
    this.unlock();
    this.init();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(660, t + 0.12);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  // Dramatic ascending tone when a new question loads (beeps + suspense MP3)
  playQuestionLoad() {
    if (this.muted) return;
    this.unlock();
    this.init();
    const t = this.ctx.currentTime;

    const playNote = (freq, start, dur, vol = 0.3) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + start);
      gain.gain.setValueAtTime(vol, t + start);
      gain.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t + start);
      osc.stop(t + start + dur);
    };

    playNote(330, 0.0, 0.15);
    playNote(440, 0.12, 0.15);
    playNote(550, 0.24, 0.3, 0.35);
  }

  // Correct answer — bright triumphant ascending chime
  playCorrectChime() {
    if (this.muted) return;
    this.init();
    this.stopSuspense();
    const t = this.ctx.currentTime;

    const playNote = (freq, start, dur, vol = 0.4) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + start);
      gain.gain.setValueAtTime(vol, t + start);
      gain.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t + start);
      osc.stop(t + start + dur);
    };

    // Bright C major arpeggio — clear and celebratory
    playNote(523.25, 0.00, 0.25, 0.40); // C5
    playNote(659.25, 0.15, 0.25, 0.42); // E5
    playNote(783.99, 0.30, 0.25, 0.44); // G5
    playNote(1046.5, 0.45, 0.60, 0.45); // C6
    // Harmony layer
    playNote(392.00, 0.45, 0.60, 0.20); // G4 under the high note
  }

  // Wrong answer — harsh descending buzzer, unmistakable
  playWrongBuzzer() {
    if (this.muted) return;
    this.init();
    this.stopSuspense();
    const t = this.ctx.currentTime;

    // Layer 1: harsh descending buzz
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(280, t);
    osc1.frequency.linearRampToValueAtTime(80, t + 0.9);
    gain1.gain.setValueAtTime(0.5, t);
    gain1.gain.linearRampToValueAtTime(0.001, t + 0.9);
    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.9);

    // Layer 2: dissonant overtone
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(185, t);
    osc2.frequency.linearRampToValueAtTime(60, t + 0.9);
    gain2.gain.setValueAtTime(0.3, t);
    gain2.gain.linearRampToValueAtTime(0.001, t + 0.9);
    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    osc2.start(t);
    osc2.stop(t + 0.9);
  }

  // Walk away — calm, bittersweet resolution
  playWalkAwayChime() {
    if (this.muted) return;
    this.init();
    this.stopSuspense();
    const t = this.ctx.currentTime;

    const playNote = (freq, start, dur, vol = 0.35) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + start);
      gain.gain.setValueAtTime(vol, t + start);
      gain.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t + start);
      osc.stop(t + start + dur);
    };

    // Gentle descending phrase — resolved but wistful
    playNote(659.25, 0.00, 0.3);  // E5
    playNote(587.33, 0.20, 0.3);  // D5
    playNote(523.25, 0.40, 0.3);  // C5
    playNote(440.00, 0.60, 0.7);  // A4 — long final note
  }

  // Grand victory fanfare — full and loud
  playVictoryFanfare() {
    if (this.muted) return;
    this.init();
    this.stopSuspense();
    const t = this.ctx.currentTime;

    const playNote = (freq, start, dur, vol = 0.45, type = 'triangle') => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t + start);
      gain.gain.setValueAtTime(vol, t + start);
      gain.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t + start);
      osc.stop(t + start + dur);
    };

    // Triumphant C major fanfare — builds from low to high
    playNote(261.63, 0.00, 0.18, 0.45); // C4
    playNote(261.63, 0.18, 0.18, 0.45); // C4
    playNote(329.63, 0.36, 0.18, 0.45); // E4
    playNote(392.00, 0.54, 0.18, 0.45); // G4
    playNote(523.25, 0.72, 0.40, 0.50); // C5
    playNote(659.25, 1.12, 0.40, 0.50); // E5
    playNote(783.99, 1.52, 0.40, 0.50); // G5
    playNote(1046.5, 1.92, 1.20, 0.55); // C6 — sustained final note
    // Bass harmony
    playNote(130.81, 0.72, 1.50, 0.30, 'sine'); // C3 bass
    playNote(196.00, 1.12, 1.10, 0.25, 'sine'); // G3 bass
  }
}

const sounds = new SoundEngine();

// --- Game Constants & Levels ---
const PRIZE_LADDER = [
  100, 200, 300, 500, 1000,
  1500, 2000, 2500, 3000, 3500,
  4000, 5000, 5500, 6000, 7000
];

const SAFE_LEVELS = [5, 10, 15]; // Level numbers: 5 (1,000), 10 (3,500), 15 (7,000)

// --- Game State Object ---
let gameState = {
  screen: 'home', // 'home', 'game', 'results'
  allQuestions: [],
  currentGameQuestions: [],
  currentQuestionIndex: 0,
  selectedAnswerOption: null,
  lifelinesUsed: {
    '50-50': false,
    'audience': false,
    'hint': false
  },
  stats: {
    played: 0,
    won: 0,
    highScore: 0
  }
};

// --- DOM Cache Elements ---
const screens = {
  home: document.getElementById('home-screen'),
  game: document.getElementById('game-screen'),
  results: document.getElementById('results-screen')
};

const dom = {
  questionText: document.getElementById('question-text'),
  answers: {
    A: document.getElementById('answer-A'),
    B: document.getElementById('answer-B'),
    C: document.getElementById('answer-C'),
    D: document.getElementById('answer-D')
  },
  answerTexts: {
    A: document.getElementById('answer-text-A'),
    B: document.getElementById('answer-text-B'),
    C: document.getElementById('answer-text-C'),
    D: document.getElementById('answer-text-D')
  },
  lifelines: {
    '50-50': document.getElementById('lifeline-50-50'),
    'audience': document.getElementById('lifeline-audience'),
    'hint': document.getElementById('lifeline-hint')
  },
  walkAwayBtn: document.getElementById('walk-away-btn'),
  answersContainer: document.getElementById('answers-container'),
  showOptionsBtn: document.getElementById('show-options-btn'),
  pointsLadder: document.getElementById('points-ladder'),
  soundToggle: document.getElementById('sound-toggle-btn'),
  soundText: document.getElementById('sound-text'),
  soundIcon: document.getElementById('sound-icon'),
  ladderToggle: document.getElementById('ladder-toggle-btn'),
  ladderSidebar: document.getElementById('ladder-sidebar'),
  
  // Results Elements
  resultsTitle: document.getElementById('results-title'),
  resultsScore: document.getElementById('results-score-value'),
  resultsMsg: document.getElementById('results-message'),
  resultsBadge: document.getElementById('victory-badge'),
  
  // LocalStorage Stats DOM
  statPlayed: document.getElementById('stat-played'),
  statWon: document.getElementById('stat-won'),
  statHigh: document.getElementById('stat-high'),
  resPlayed: document.getElementById('results-stat-played'),
  resHigh: document.getElementById('results-stat-high'),
  
  // Dialogs
  dialogConfirm: document.getElementById('final-answer-modal'),
  dialogAudience: document.getElementById('audience-modal'),
  dialogHint: document.getElementById('hint-modal'),
  dialogWalkAway: document.getElementById('walk-away-modal'),
  dialogInstructions: document.getElementById('instructions-modal'),
  dialogStats: document.getElementById('stats-modal')
};

// --- Fisher-Yates Shuffle Algorithm ---
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// --- Local Storage Management ---
function loadStats() {
  gameState.stats.played = parseInt(localStorage.getItem('bm_played') || '0', 10);
  gameState.stats.won = parseInt(localStorage.getItem('bm_won') || '0', 10);
  gameState.stats.highScore = parseInt(localStorage.getItem('bm_high_score') || '0', 10);
  
  updateStatsUI();
}

function saveStats(score, won = false) {
  gameState.stats.played += 1;
  if (won) {
    gameState.stats.won += 1;
  }
  if (score > gameState.stats.highScore) {
    gameState.stats.highScore = score;
  }

  localStorage.setItem('bm_played', gameState.stats.played);
  localStorage.setItem('bm_won', gameState.stats.won);
  localStorage.setItem('bm_high_score', gameState.stats.highScore);

  updateStatsUI();
}

function resetStats() {
  localStorage.setItem('bm_played', '0');
  localStorage.setItem('bm_won', '0');
  localStorage.setItem('bm_high_score', '0');
  
  gameState.stats.played = 0;
  gameState.stats.won = 0;
  gameState.stats.highScore = 0;
  
  updateStatsUI();
  dom.dialogStats.close();
}

function updateStatsUI() {
  dom.statPlayed.textContent = gameState.stats.played;
  dom.statWon.textContent = gameState.stats.won;
  dom.statHigh.textContent = formatScore(gameState.stats.highScore);

  dom.resPlayed.textContent = gameState.stats.played;
  dom.resHigh.textContent = formatScore(gameState.stats.highScore);

  // Modal stats
  document.getElementById('modal-stat-played').textContent = gameState.stats.played;
  document.getElementById('modal-stat-won').textContent = gameState.stats.won;
  document.getElementById('modal-stat-high').textContent = formatScore(gameState.stats.highScore);

  const rate = gameState.stats.played > 0 
    ? Math.round((gameState.stats.won / gameState.stats.played) * 100) 
    : 0;
  document.getElementById('win-rate-text').textContent = `Win Rate: ${rate}%`;
}

function formatScore(score) {
  return '₦' + score.toLocaleString();
}

// --- Screen Switching Logic ---
function showScreen(screenName) {
  gameState.screen = screenName;
  Object.keys(screens).forEach(key => {
    if (key === screenName) {
      screens[key].classList.remove('hidden');
    } else {
      screens[key].classList.add('hidden');
    }
  });

  if (screenName === 'game') {
    // Stop theme music — suspense starts when the first question renders
    sounds.stopMusic();
  } else {
    // Home or results — stop in-game audio, restart theme from top
    sounds.stopSuspense();
    sounds.stopDrone();
    sounds.playMusic(); // always restart from top so it never plays silence mid-loop
  }
}

// --- Confetti Canvas Effect ---
const confetti = {
  canvas: document.getElementById('confetti-canvas'),
  ctx: document.getElementById('confetti-canvas').getContext('2d'),
  active: false,
  colors: ['#ffd700', '#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#a855f7'],
  particles: [],
  
  init() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    
    window.addEventListener('resize', () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    });
  },

  start() {
    this.active = true;
    this.particles = [];
    for (let i = 0; i < 150; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height - this.canvas.height,
        r: Math.random() * 6 + 4,
        d: Math.random() * this.canvas.height,
        color: this.colors[Math.floor(Math.random() * this.colors.length)],
        tilt: Math.random() * 10 - 5,
        tiltAngleIncremental: Math.random() * 0.07 + 0.02,
        tiltAngle: 0
      });
    }
    this.animate();
  },

  stop() {
    this.active = false;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  },

  animate() {
    if (!confetti.active) return;
    confetti.ctx.clearRect(0, 0, confetti.canvas.width, confetti.canvas.height);
    
    let finished = true;
    confetti.particles.forEach(p => {
      p.tiltAngle += p.tiltAngleIncremental;
      p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
      p.x += Math.sin(p.tiltAngle);
      p.tilt = Math.sin(p.tiltAngle - p.r/2) * 5;

      if (p.y <= confetti.canvas.height) {
        finished = false;
      }

      confetti.ctx.beginPath();
      confetti.ctx.lineWidth = p.r;
      confetti.ctx.strokeStyle = p.color;
      confetti.ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
      confetti.ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
      confetti.ctx.stroke();
    });

    if (finished) {
      confetti.stop();
    } else {
      requestAnimationFrame(confetti.animate);
    }
  }
};

// --- Question Picker & Shuffling ---
function prepareGameQuestions() {
  // Segregate by difficulty
  const easyQ = gameState.allQuestions.filter(q => q.difficulty === 'easy');
  const medQ = gameState.allQuestions.filter(q => q.difficulty === 'medium');
  const hardQ = gameState.allQuestions.filter(q => q.difficulty === 'hard');

  // Shuffle each difficulty pool
  shuffle(easyQ);
  shuffle(medQ);
  shuffle(hardQ);

  // Pick 3 easy, 3 medium, 9 hard for the 15 questions
  const easyPick = easyQ.slice(0, 3);
  const medPick = medQ.slice(0, 3);
  const hardPick = hardQ.slice(0, 9);

  /**
   * Pattern per group of 5: 3 hard, 1 easy, 1 medium
   * Group 1 (levels 1-5):  hard, easy, hard, medium, hard
   * Group 2 (levels 6-10): hard, easy, hard, medium, hard
   * Group 3 (levels 11-15):hard, easy, hard, medium, hard
   * Difficulty ramps naturally because all three hard pools come
   * from the shuffled hard set — early levels get less scary hard
   * questions by chance, while late levels draw from the deeper end.
   */
  gameState.currentGameQuestions = [
    // Group 1 — Levels 1–5
    hardPick[0], easyPick[0], hardPick[1], medPick[0], hardPick[2],
    // Group 2 — Levels 6–10
    hardPick[3], easyPick[1], hardPick[4], medPick[1], hardPick[5],
    // Group 3 — Levels 11–15
    hardPick[6], easyPick[2], hardPick[7], medPick[2], hardPick[8]
  ];

  gameState.currentQuestionIndex = 0;

  // Reset Lifelines
  gameState.lifelinesUsed['50-50'] = false;
  gameState.lifelinesUsed['audience'] = false;
  gameState.lifelinesUsed['hint'] = false;

  Object.keys(dom.lifelines).forEach(key => {
    dom.lifelines[key].disabled = false;
    dom.lifelines[key].classList.remove('used');
  });

  updateLadderUI();
}

// --- Ladder Highlight Update ---
function updateLadderUI() {
  const ladderItems = dom.pointsLadder.querySelectorAll('.ladder-item');
  ladderItems.forEach(item => {
    const lvl = parseInt(item.getAttribute('data-level'), 10);
    const itemQuestionIndex = lvl - 1; // 0-indexed matches levels 1-15

    item.classList.remove('active', 'passed');

    if (itemQuestionIndex === gameState.currentQuestionIndex) {
      item.classList.add('active');
    } else if (itemQuestionIndex < gameState.currentQuestionIndex) {
      item.classList.add('passed');
    }
  });
}

// --- Show / Hide Answer Options ---
function hideAnswerOptions() {
  dom.answersContainer.classList.add('options-hidden');
}

function revealAnswerOptions() {
  sounds.playBeep();
  dom.answersContainer.classList.remove('options-hidden');
}

// --- Render Question Details ---
function renderCurrentQuestion() {
  hideAnswerOptions();
  sounds.playQuestionLoad();
  sounds.playSuspense();

  const currentQ = gameState.currentGameQuestions[gameState.currentQuestionIndex];
  
  dom.questionText.textContent = `${gameState.currentQuestionIndex + 1}. ${currentQ.question}`;
  
  const shuffledOptions = shuffle([...currentQ.options]);

  const optionLetters = ['A', 'B', 'C', 'D'];
  optionLetters.forEach((letter, i) => {
    const btn = dom.answers[letter];
    const textNode = dom.answerTexts[letter];
    
    btn.className = 'answer-btn';
    btn.style.visibility = 'visible';
    btn.disabled = false;
    
    textNode.textContent = shuffledOptions[i];
  });

  // Enable/disable Walk Away based on whether we are at Q1 or above
  if (gameState.currentQuestionIndex === 0) {
    dom.walkAwayBtn.disabled = true;
    dom.walkAwayBtn.style.opacity = '0.3';
  } else {
    dom.walkAwayBtn.disabled = false;
    dom.walkAwayBtn.style.opacity = '1';
  }

  updateLadderUI();
}

// --- Start Game Initializer ---
function startNewGame() {
  sounds.unlock(); // unlock AudioContext + HTML Audio on first user gesture
  confetti.stop();
  prepareGameQuestions();
  showScreen('game');
  renderCurrentQuestion();
}

// --- Select Answer Handler ---
function selectAnswer(letter) {
  sounds.playBeep();
  gameState.selectedAnswerOption = letter;

  // Clear previous selected states
  Object.keys(dom.answers).forEach(k => {
    dom.answers[k].classList.remove('selected');
  });

  dom.answers[letter].classList.add('selected');

  // Trigger final answer dialog modal
  dom.dialogConfirm.showModal();
}

// --- Final Answer Confirmation & Evaluation ---
function handleConfirmAnswer() {
  dom.dialogConfirm.close();
  
  const currentQ = gameState.currentGameQuestions[gameState.currentQuestionIndex];
  const selectedText = dom.answerTexts[gameState.selectedAnswerOption].textContent;
  const correctOptionLetter = getCorrectOptionLetter(currentQ.answer || currentQ.correctAnswer);
  
  // Disable all options during validation phase
  Object.keys(dom.answers).forEach(k => {
    dom.answers[k].disabled = true;
  });
  
  // Disable lifelines and walk away during evaluation
  Object.keys(dom.lifelines).forEach(k => {
    dom.lifelines[k].disabled = true;
  });
  dom.walkAwayBtn.disabled = true;

  if (selectedText === (currentQ.answer || currentQ.correctAnswer)) {
    // Correct! Flash green
    sounds.playCorrectChime();
    dom.answers[gameState.selectedAnswerOption].classList.add('correct');

    setTimeout(() => {
      // Proceed to next level or win
      if (gameState.currentQuestionIndex === 14) {
        // Complete Victory!
        handleGameVictory();
      } else {
        gameState.currentQuestionIndex++;
        
        // Re-enable lifelines that were not used
        Object.keys(dom.lifelines).forEach(k => {
          if (!gameState.lifelinesUsed[k]) {
            dom.lifelines[k].disabled = false;
          }
        });

        renderCurrentQuestion();
      }
    }, 2500);
  } else {
    // Incorrect! Highlight choice in red, and correct choice in green
    sounds.playWrongBuzzer();
    dom.answers[gameState.selectedAnswerOption].classList.add('incorrect');
    if (correctOptionLetter) {
      dom.answers[correctOptionLetter].classList.add('correct');
    }

    setTimeout(() => {
      handleGameOver(false);
    }, 2800);
  }
}

// Get correct letter mapping
function getCorrectOptionLetter(correctText) {
  const letters = ['A', 'B', 'C', 'D'];
  for (let letter of letters) {
    if (dom.answerTexts[letter].textContent === correctText) {
      return letter;
    }
  }
  return null;
}

// --- Safe Level Score Calculator ---
function calculateLosingScore() {
  // Current index determines how far they went.
  // E.g., if index = 6 (Question 7), they failed on Q7. 
  // The highest question index successfully answered is index 5 (Question 6).
  const highestAnsweredIndex = gameState.currentQuestionIndex - 1;
  const highestAnsweredLevelNum = highestAnsweredIndex + 1;

  let safeLevelNum = 0;
  for (let safe of SAFE_LEVELS) {
    if (highestAnsweredLevelNum >= safe) {
      safeLevelNum = safe;
    }
  }

  if (safeLevelNum === 0) return 0;
  return PRIZE_LADDER[safeLevelNum - 1];
}

// --- Game Over Sequence ---
function handleGameOver(walkedAway = false) {
  let score = 0;
  
  if (walkedAway) {
    // Kept accumulated points up to the PREVIOUS question
    score = PRIZE_LADDER[gameState.currentQuestionIndex - 1];
    sounds.playWalkAwayChime();
    dom.resultsTitle.textContent = "WALKED AWAY";
    dom.resultsTitle.className = "results-title";
    dom.resultsMsg.textContent = `You decided to walk away. Excellent game! You secured your safe points of ${formatScore(score)}.`;
    dom.resultsBadge.classList.add('hidden');
  } else {
    score = calculateLosingScore();
    dom.resultsTitle.textContent = "GAME OVER";
    dom.resultsTitle.className = "results-title";
    dom.resultsMsg.textContent = `Incorrect! You fell back to your last milestone safe level, leaving with ${formatScore(score)}. Let's try again!`;
    dom.resultsBadge.classList.add('hidden');
  }

  saveStats(score, false);
  dom.resultsScore.textContent = '₦' + score.toLocaleString();
  dom.resultsScore.className = "results-score-value";
  showScreen('results');
}

// --- Victory Sequence ---
function handleGameVictory() {
  const score = 7000;
  sounds.playVictoryFanfare();
  
  dom.resultsTitle.textContent = "CONGRATULATIONS!";
  dom.resultsTitle.className = "results-title victory";
  dom.resultsScore.textContent = "₦7,000";
  dom.resultsScore.className = "results-score-value million";
  dom.resultsMsg.innerHTML = "<strong>YOU ARE A BIBLE MILLIONAIRE!</strong><br>You successfully navigated all 15 scriptural challenges and won the grand prize!";
  
  dom.resultsBadge.classList.remove('hidden');

  saveStats(score, true);
  showScreen('results');
  confetti.start();
}

// --- Lifeline: 50:50 ---
function useFiftyFifty() {
  if (gameState.lifelinesUsed['50-50']) return;
  sounds.playBeep();
  gameState.lifelinesUsed['50-50'] = true;
  
  dom.lifelines['50-50'].classList.add('used');
  dom.lifelines['50-50'].disabled = true;

  const currentQ = gameState.currentGameQuestions[gameState.currentQuestionIndex];
  const letters = ['A', 'B', 'C', 'D'];
  
  // Find all incorrect letters that are visible
  const incorrectLetters = [];
  letters.forEach(letter => {
    if (dom.answerTexts[letter].textContent !== (currentQ.answer || currentQ.correctAnswer) && dom.answers[letter].style.visibility !== 'hidden') {
      incorrectLetters.push(letter);
    }
  });

  // Randomly select two incorrect options to remove
  shuffle(incorrectLetters);
  const toRemove = incorrectLetters.slice(0, 2);
  
  toRemove.forEach(letter => {
    dom.answers[letter].style.visibility = 'hidden';
    dom.answers[letter].disabled = true;
  });
}

// --- Lifeline: Ask the Congregation (real person in the room) ---
let audienceMemberName = '';

function resetAudienceModal() {
  document.getElementById('audience-step-name').classList.remove('hidden');
  document.getElementById('audience-step-waiting').classList.add('hidden');
  document.getElementById('audience-step-pick').classList.add('hidden');
  document.getElementById('audience-step-result').classList.add('hidden');
  document.getElementById('audience-name-input').value = '';
  audienceMemberName = '';
}

function showAudienceWaitingStep() {
  const nameInput = document.getElementById('audience-name-input').value.trim();
  if (!nameInput) {
    document.getElementById('audience-name-input').focus();
    document.getElementById('audience-name-input').classList.add('input-error');
    setTimeout(() => document.getElementById('audience-name-input').classList.remove('input-error'), 600);
    return;
  }

  audienceMemberName = nameInput;
  document.getElementById('audience-step-name').classList.add('hidden');
  document.getElementById('audience-step-waiting').classList.remove('hidden');
  document.getElementById('audience-waiting-name').textContent = audienceMemberName;

  // Show current visible options so the host can read them to the congregation
  const preview = document.getElementById('audience-options-preview');
  preview.innerHTML = '';
  ['A', 'B', 'C', 'D'].forEach((letter) => {
    if (dom.answers[letter].style.visibility === 'hidden') return;
    const row = document.createElement('div');
    row.className = 'audience-option-row';
    row.innerHTML = `<span class="audience-option-letter">${letter}</span><span class="audience-option-text">${dom.answerTexts[letter].textContent}</span>`;
    preview.appendChild(row);
  });
}

function showAudiencePickStep() {
  document.getElementById('audience-step-waiting').classList.add('hidden');
  document.getElementById('audience-step-pick').classList.remove('hidden');
  document.getElementById('audience-pick-name').textContent = audienceMemberName;

  const pickGrid = document.getElementById('audience-pick-buttons');
  pickGrid.innerHTML = '';

  ['A', 'B', 'C', 'D'].forEach((letter) => {
    if (dom.answers[letter].style.visibility === 'hidden') return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'audience-pick-btn';
    btn.innerHTML = `<span class="pick-letter">${letter}</span><span class="pick-text">${dom.answerTexts[letter].textContent}</span>`;
    btn.addEventListener('click', () => showAudienceResult(letter));
    pickGrid.appendChild(btn);
  });
}

function showAudienceResult(letter) {
  const answerText = dom.answerTexts[letter].textContent;

  document.getElementById('audience-step-pick').classList.add('hidden');
  document.getElementById('audience-step-result').classList.remove('hidden');
  document.getElementById('audience-person-name').textContent = audienceMemberName;
  document.getElementById('audience-suggested-answer').textContent = `${letter}: ${answerText}`;
  sounds.playBeep();
}

function useAskAudience() {
  if (gameState.lifelinesUsed['audience']) return;
  sounds.playBeep();
  gameState.lifelinesUsed['audience'] = true;
  dom.lifelines['audience'].classList.add('used');
  dom.lifelines['audience'].disabled = true;

  resetAudienceModal();
  dom.dialogAudience.showModal();
  setTimeout(() => document.getElementById('audience-name-input').focus(), 100);
}

// --- Lifeline: Bible Hint ---
function useBibleHint() {
  if (gameState.lifelinesUsed['hint']) return;
  sounds.playBeep();
  gameState.lifelinesUsed['hint'] = true;
  
  dom.lifelines['hint'].classList.add('used');
  dom.lifelines['hint'].disabled = true;

  const currentQ = gameState.currentGameQuestions[gameState.currentQuestionIndex];
  document.getElementById('hint-text').textContent = currentQ.hint || "No hint available.";
  
  dom.dialogHint.showModal();
}

// --- Walk Away Trigger ---
function handleWalkAwayClick() {
  sounds.playBeep();
  const secureValue = PRIZE_LADDER[gameState.currentQuestionIndex - 1];
  document.getElementById('walk-away-value').textContent = '₦' + secureValue.toLocaleString();
  dom.dialogWalkAway.showModal();
}

function handleConfirmWalkAway() {
  dom.dialogWalkAway.close();
  handleGameOver(true);
}

// --- Event Listeners Binding ---
function setupEventListeners() {
  // Sound toggle — also unlocks audio on first click
  dom.soundToggle.addEventListener('click', () => {
    sounds.unlock();
    const isMuted = sounds.toggleMute();
    if (isMuted) {
      dom.soundText.textContent = "Sound OFF";
      dom.soundIcon.innerHTML = `
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
      `;
    } else {
      dom.soundText.textContent = "Sound ON";
      dom.soundIcon.innerHTML = `
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
      `;
    }
  });

  dom.statsSidebarBtn = document.getElementById('stats-trigger-btn');
  dom.statsSidebarBtn.addEventListener('click', () => {
    sounds.playBeep();
    dom.dialogStats.showModal();
  });

  document.getElementById('reset-stats-btn').addEventListener('click', () => {
    if (confirm("Are you sure you want to reset all games played and high score progress?")) {
      resetStats();
    }
  });

  dom.ladderToggle.addEventListener('click', () => {
    sounds.playBeep();
    dom.ladderSidebar.classList.toggle('open');
  });

  // Show answer options (Millionaire-style reveal)
  dom.showOptionsBtn.addEventListener('click', revealAnswerOptions);

  // Home actions — unlock audio on first interaction
  document.getElementById('start-game-btn').addEventListener('click', () => {
    startNewGame();
  });
  document.getElementById('instructions-btn').addEventListener('click', () => {
    sounds.unlock();
    sounds.playBeep();
    dom.dialogInstructions.showModal();
  });

  // Selection answers
  Object.keys(dom.answers).forEach(letter => {
    dom.answers[letter].addEventListener('click', (e) => {
      if (dom.answersContainer.classList.contains('options-hidden')) return;
      if (dom.answers[letter].disabled) return;
      selectAnswer(letter);
    });
  });

  // Modals confirmation triggers
  document.getElementById('confirm-final-btn').addEventListener('click', handleConfirmAnswer);
  document.getElementById('cancel-final-btn').addEventListener('click', () => {
    sounds.playBeep();
    dom.dialogConfirm.close();
    // Reset selected answer option styling if canceled
    if (gameState.selectedAnswerOption) {
      dom.answers[gameState.selectedAnswerOption].classList.remove('selected');
      gameState.selectedAnswerOption = null;
    }
  });

  // Lifelines
  dom.lifelines['50-50'].addEventListener('click', useFiftyFifty);
  dom.lifelines['audience'].addEventListener('click', useAskAudience);
  dom.lifelines['hint'].addEventListener('click', useBibleHint);

  // Congregation lifeline modal
  document.getElementById('audience-ask-btn').addEventListener('click', showAudienceWaitingStep);
  document.getElementById('audience-answered-btn').addEventListener('click', () => {
    sounds.playBeep();
    showAudiencePickStep();
  });
  document.getElementById('audience-back-btn').addEventListener('click', resetAudienceModal);
  document.getElementById('audience-back-waiting-btn').addEventListener('click', () => {
    document.getElementById('audience-step-pick').classList.add('hidden');
    document.getElementById('audience-step-waiting').classList.remove('hidden');
  });
  document.getElementById('audience-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') showAudienceWaitingStep();
  });

  // Walk Away
  dom.walkAwayBtn.addEventListener('click', handleWalkAwayClick);
  document.getElementById('confirm-walkaway-btn').addEventListener('click', handleConfirmWalkAway);

  // Post game navigation
  document.getElementById('play-again-btn').addEventListener('click', () => {
    sounds.unlock();
    startNewGame();
  });
  document.getElementById('home-btn').addEventListener('click', () => {
    sounds.unlock();
    sounds.playBeep();
    showScreen('home');
  });

  // Dialog Backdrop Dismiss Fallback (Safari / Older browsers lack native closedby="any" support)
  const allDialogs = document.querySelectorAll('dialog');
  allDialogs.forEach(dialog => {
    // Add close button/Esc functionality fallback
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      
      // Calculate coordinates relative to screen box
      const rect = dialog.getBoundingClientRect();
      const isInsideContent = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );

      if (!isInsideContent) {
        // If clicking Backdrop confirmation, restore selection
        if (dialog.id === 'final-answer-modal' && gameState.selectedAnswerOption) {
          dom.answers[gameState.selectedAnswerOption].classList.remove('selected');
          gameState.selectedAnswerOption = null;
        }
        dialog.close();
      }
    });
  });
}

// --- App Launcher ---
window.addEventListener('DOMContentLoaded', async () => {
  confetti.init();
  setupEventListeners();
  loadStats();

  // Global audio unlock on first user interaction anywhere
  const unlockOnInteraction = () => {
    sounds.unlock();
  };
  document.body.addEventListener('click', unlockOnInteraction, { once: true });
  document.body.addEventListener('keydown', unlockOnInteraction, { once: true });

  try {
    const res = await fetch('questions.json');
    if (!res.ok) throw new Error("Failed to load questions database.");
    gameState.allQuestions = await res.json();
  } catch (error) {
    console.error("Error fetching questions database:", error);
    alert("Could not load the Bible questions list. Please verify that 'questions.json' is present in your root directory.");
  }
});
