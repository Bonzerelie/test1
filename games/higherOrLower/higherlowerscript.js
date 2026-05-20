/* =========================================================
   /games/higherOrLower/script.js
   Higher Or Lower — Note Comparison Game
   Part of The Ear Training Lab app.

   Two notes are played back-to-back; the player decides
   whether the second note is Higher, Lower, or the Same.

   Progress is saved to localStorage "et_game_results"
   in the same format as all other Ear Training Lab games.
   ========================================================= */

(() => {
  "use strict";

  // ── Constants ──────────────────────────────────────────
  const AUDIO_DIR       = "../../audio";
  const LS_KEY_THEME    = "et_theme";
  const LS_KEY_RANGE    = "et_hol_range";
  const LS_KEY_NAME     = "et_hol_player_name";
  const LS_KEY_RESULTS  = "et_game_results";

  const UI_SND_SELECT    = "select1.mp3";
  const UI_SND_BACK      = "back1.mp3";
  const UI_SND_CORRECT   = "correct1.mp3";
  const UI_SND_INCORRECT = "incorrect1.mp3";

  const NOTE_PLAY_SEC = 1.2;
  const FADE_OUT_SEC  = 0.1;
  const GAP_SEC       = 0.01;

  // Pitch-class → audio stem name
  const PC_TO_STEM = {
    0: "c",  1: "csharp", 2: "d",      3: "dsharp", 4: "e",      5: "f",
    6: "fsharp", 7: "g",  8: "gsharp", 9: "a",     10: "asharp", 11: "b",
  };

  const PC_NAMES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const PC_NAMES_FLAT  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];

  // Difficulty ranges: key → {label, startOctave, octaves}
  const RANGES = {
    "easy-1oct":   { label: "1 Octave (Easier)", startOctave: 4, octaves: 1 },
    "expert-4oct": { label: "4 Octaves (Harder)", startOctave: 2, octaves: 4 },
  };

  const $ = (id) => document.getElementById(id);

  // ── DOM references ──────────────────────────────────────
  const homeBtn       = $("homeBtn");
  const beginBtn      = $("beginBtn");
  const replayBtn     = $("replayBtn");
  const nextBtn       = $("nextBtn");
  const settingsBtn   = $("settingsBtn");
  const infoBtn       = $("infoBtn");

  const higherBtn     = $("higherBtn");
  const sameBtn       = $("sameBtn");
  const lowerBtn      = $("lowerBtn");
  const answerBtns    = [lowerBtn, sameBtn, higherBtn];

  const phaseTitle    = $("phaseTitle");
  const feedbackOut   = $("feedbackOut");
  const correctOut    = $("correctOut");
  const incorrectOut  = $("incorrectOut");
  const totalOut      = $("totalOut");
  const accuracyOut   = $("accuracyOut");
  const streakOut     = $("streakOut");
  const bestStreakOut = $("bestStreakOut");
  const scoreMeta     = $("scoreMeta");

  const playerNameInput       = $("playerNameInput");
  const downloadScorecardBtn  = $("downloadScorecardBtn");
  const miniMount             = $("miniMount");
  const miniLegend            = $("miniLegend");

  // Intro modal
  const introModal      = $("introModal");
  const introBeginBtn   = $("introBeginBtn");
  const introHomeBtn    = $("introHomeBtn");
  const introRangeSelect = $("introRangeSelect");

  // Settings modal
  const settingsModal       = $("settingsModal");
  const settingsRangeSelect = $("settingsRangeSelect");
  const settingsRestartBtn  = $("settingsRestartBtn");
  const settingsCancelBtn   = $("settingsCancelBtn");

  // Score modal
  const scoreModal              = $("scoreModal");
  const scoreModalContinueBtn   = $("scoreModalContinueBtn");
  const modalPlayerNameInput    = $("modalPlayerNameInput");
  const modalDownloadScorecardBtn = $("modalDownloadScorecardBtn");
  const modalCorrectOut         = $("modalCorrectOut");
  const modalIncorrectOut       = $("modalIncorrectOut");
  const modalTotalOut           = $("modalTotalOut");
  const modalAccuracyOut        = $("modalAccuracyOut");
  const modalBestStreakOut      = $("modalBestStreakOut");
  const modalScoreMeta          = $("modalScoreMeta");

  // Info modal
  const infoModal = $("infoModal");
  const infoClose = $("infoClose");

  // Leave modal
  const leaveModal      = $("leaveModal");
  const leaveSaveBtn    = $("leaveSaveBtn");
  const leaveDiscardBtn = $("leaveDiscardBtn");
  const leaveCancelBtn  = $("leaveCancelBtn");


  // ── Theme ──────────────────────────────────────────────
  function applyTheme(theme) {
    const isDark = theme !== "light";
    document.body.classList.toggle("light-theme", !isDark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isDark ? "#0f172a" : "#f1f5f9");
  }


  // ── iframe sizing (for parent-frame embedding) ──────────
  let lastHeight = 0;
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const h = Math.ceil(entry.contentRect.height);
      if (h !== lastHeight) { parent.postMessage({ iframeHeight: h }, "*"); lastHeight = h; }
    }
  });
  ro.observe(document.documentElement);

  function postHeightNow() {
    try {
      const h = Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      );
      parent.postMessage({ iframeHeight: h }, "*");
    } catch {}
  }

  window.addEventListener("load", () => {
    postHeightNow();
    setTimeout(postHeightNow, 250);
    setTimeout(postHeightNow, 1000);
  });


  // ── Audio engine ────────────────────────────────────────
  let audioCtx   = null;
  let masterGain = null;
  const bufferCache  = new Map();
  const activeVoices = new Set();
  let synthFallbackWarned = false;

  function ensureAudioGraph() {
    if (audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;

    audioCtx   = new Ctx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.9;

    const comp = audioCtx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value      = 12;
    comp.ratio.value     = 12;
    comp.attack.value    = 0.002;
    comp.release.value   = 0.25;
    masterGain.connect(comp);
    comp.connect(audioCtx.destination);

    return audioCtx;
  }

  async function resumeAudio() {
    const ctx = ensureAudioGraph();
    if (!ctx) return;
    if (ctx.state === "suspended") { try { await ctx.resume(); } catch {} }
  }

  function stopAllNotes(fadeSec = 0.06) {
    const ctx = ensureAudioGraph();
    if (!ctx) return;
    const now  = ctx.currentTime;
    const fade = Math.max(0.01, fadeSec);
    activeVoices.forEach(v => {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(v.gain.gain.value, now);
        v.gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
        v.src.stop(now + fade + 0.05);
      } catch {}
    });
    activeVoices.clear();
  }

  function trackVoice(src, gain) {
    const v = { src, gain };
    activeVoices.add(v);
    src.onended = () => activeVoices.delete(v);
  }

  function loadBuffer(url) {
    if (bufferCache.has(url)) return bufferCache.get(url);
    const p = (async () => {
      const ctx = ensureAudioGraph();
      if (!ctx) return null;
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const ab  = await res.arrayBuffer();
        return await ctx.decodeAudioData(ab);
      } catch { return null; }
    })();
    bufferCache.set(url, p);
    return p;
  }

  function playBufferWindowed(buffer, when, playSec, fadeOutSec, gain = 1) {
    const ctx = ensureAudioGraph();
    if (!ctx || !masterGain) return;

    const src    = ctx.createBufferSource();
    src.buffer   = buffer;
    const g      = ctx.createGain();
    const endAt  = when + Math.max(0.05, playSec);
    const fStart = Math.max(when + 0.02, endAt - Math.max(0.06, fadeOutSec));

    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(Math.max(0, gain), when + 0.01);
    g.gain.setValueAtTime(Math.max(0, gain), fStart);
    g.gain.linearRampToValueAtTime(0, endAt);

    src.connect(g);
    g.connect(masterGain);
    trackVoice(src, g);
    src.start(when);
    src.stop(endAt + 0.03);
  }

  // Pitch helpers
  function pitchFromPcOct(pc, oct) { return (oct * 12) + pc; }
  function pcFromPitch(p)          { return ((p % 12) + 12) % 12; }
  function octFromPitch(p)         { return Math.floor(p / 12); }
  function getStem(pc)             { return PC_TO_STEM[(pc + 12) % 12] || null; }

  function pitchToFreq(pitch) {
    return 440 * Math.pow(2, (pitch - pitchFromPcOct(9, 4)) / 12);
  }

  function playSynthTone(pitch, when, playSec, fadeOutSec, gain = 0.65) {
    const ctx = ensureAudioGraph();
    if (!ctx || !masterGain) return;
    const osc    = ctx.createOscillator();
    osc.type     = "sine";
    osc.frequency.setValueAtTime(pitchToFreq(pitch), when);
    const g      = ctx.createGain();
    const endAt  = when + Math.max(0.05, playSec);
    const fStart = Math.max(when + 0.02, endAt - Math.max(0.015, fadeOutSec));
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.01);
    g.gain.setValueAtTime(gain, fStart);
    g.gain.linearRampToValueAtTime(0, endAt);
    osc.connect(g); g.connect(masterGain);
    trackVoice(osc, g);
    osc.start(when); osc.stop(endAt + 0.03);
  }

  async function playPitch(pitch, when, playSec, fadeOutSec, gain = 1) {
    const pc   = pcFromPitch(pitch);
    const oct  = octFromPitch(pitch);
    const stem = getStem(pc);
    if (!stem) return;

    await resumeAudio();

    const url = `${AUDIO_DIR}/${stem}${oct}.mp3`;
    const buf = await loadBuffer(url);

    if (!buf) {
      if (!synthFallbackWarned) {
        synthFallbackWarned = true;
        console.warn("Audio sample missing; using synth fallback:", url);
      }
      playSynthTone(pitch, when, playSec, fadeOutSec, gain * 0.7);
      return;
    }
    playBufferWindowed(buf, when, playSec, fadeOutSec, gain);
  }

  async function playUiSound(filename) {
    try {
      const buf = await loadBuffer(`${AUDIO_DIR}/${filename}`);
      if (!buf) return;
      const ctx = ensureAudioGraph();
      if (!ctx) return;
      const when = ctx.currentTime;
      const src  = ctx.createBufferSource();
      src.buffer = buf;
      const g    = ctx.createGain();
      g.gain.setValueAtTime(2.0, when);
      src.connect(g); g.connect(masterGain);
      trackVoice(src, g);
      src.start(when);
    } catch {}
  }

  function pitchLabel(pitch) {
    const pc  = pcFromPitch(pitch);
    const oct = octFromPitch(pitch);
    const isAcc = [1, 3, 6, 8, 10].includes(pc);
    return isAcc
      ? `${PC_NAMES_SHARP[pc]}${oct} / ${PC_NAMES_FLAT[pc]}${oct}`
      : `${PC_NAMES_SHARP[pc]}${oct}`;
  }


  // ── Game state ──────────────────────────────────────────
  let currentModeKey = "easy-1oct";
  let pitchMin       = 0;
  let pitchMax       = 0;
  let note1          = null;
  let note2          = null;
  let started        = false;
  let awaitingNext   = false;
  let canAnswer      = false;
  let lastPlayToken  = 0;

  const score = { correct: 0, incorrect: 0, streak: 0, bestStreak: 0 };

  function totalAsked() { return score.correct + score.incorrect; }

  function accuracy() {
    const t = totalAsked();
    return t <= 0 ? 0 : Math.round((score.correct / t) * 1000) / 10;
  }

  function currentMode() { return RANGES[currentModeKey] || RANGES["easy-1oct"]; }
  function modeLabel()   { return currentMode().label; }

  function computePitchBounds() {
    const m = currentMode();
    pitchMin = pitchFromPcOct(0, m.startOctave);
    pitchMax = pitchFromPcOct(0, m.startOctave + m.octaves);
  }

  function expectedAnswer(a, b) {
    if (b === a) return "same";
    return b > a ? "higher" : "lower";
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (Math.floor(max) - Math.ceil(min) + 1)) + Math.ceil(min);
  }

  // Weighted interval: mostly 1-2 semitones, occasional unison or 3-semitone jump
  function pickIntervalSemitones() {
    const r = Math.random();
    if (r < 0.14) return 0;
    if (r < 0.62) return 1;
    if (r < 0.90) return 2;
    return 3;
  }

  function pickPair() {
    computePitchBounds();
    const a = randomInt(pitchMin, pitchMax);
    let tries = 0;
    while (tries++ < 30) {
      const dist = pickIntervalSemitones();
      const dir  = Math.random() < 0.5 ? -1 : 1;
      const b    = dist === 0 ? a : a + (dir * dist);
      if (b < pitchMin || b > pitchMax) continue;
      return { a, b };
    }
    // Fallback — ensure at least a semitone difference
    const b = Math.max(pitchMin, Math.min(pitchMax, a + (Math.random() < 0.5 ? -1 : 1)));
    return { a, b };
  }


  // ── Score rendering ─────────────────────────────────────
  function renderScore() {
    const t   = totalAsked();
    const acc = accuracy();
    if (correctOut)    correctOut.textContent    = score.correct;
    if (incorrectOut)  incorrectOut.textContent  = score.incorrect;
    if (totalOut)      totalOut.textContent      = t;
    if (accuracyOut)   accuracyOut.textContent   = `${acc}%`;
    if (streakOut)     streakOut.textContent     = score.streak;
    if (bestStreakOut) bestStreakOut.textContent  = score.bestStreak;
    const metaText = `Range: ${modeLabel()}`;
    if (scoreMeta)      scoreMeta.textContent      = metaText;
    if (modalScoreMeta) modalScoreMeta.textContent = metaText;
  }

  function setFeedback(html, phase = null) {
    if (feedbackOut) feedbackOut.innerHTML = html || "";
    if (phase !== null && phaseTitle) phaseTitle.textContent = phase;
  }

  function setPhase(text) {
    if (phaseTitle) phaseTitle.textContent = text;
  }


  // ── Controls update ─────────────────────────────────────
  function updateControls() {
    if (replayBtn) replayBtn.disabled = !started || note1 == null || note2 == null;

    const ansDisabled = !started || awaitingNext || !canAnswer;
    answerBtns.forEach(b => { if (b) b.disabled = ansDisabled; });

    const nextReady = started && awaitingNext;
    if (nextBtn) {
      nextBtn.disabled = !nextReady;
      nextBtn.classList.toggle("nextReady", nextReady);
    }
  }

  function updateBeginButton() {
    if (!beginBtn) return;
    if (started) {
      beginBtn.textContent = "End / Restart";
      beginBtn.classList.remove("pulse", "primary");
      beginBtn.classList.add("secondary-btn");
    } else {
      beginBtn.textContent = "Begin Game";
      beginBtn.classList.remove("secondary-btn");
      beginBtn.classList.add("pulse", "primary");
    }
  }


  // ── Answer button visual states ─────────────────────────
  function clearAnswerBtnStates() {
    answerBtns.forEach(b => {
      if (b) b.classList.remove("answer-correct", "answer-incorrect", "answer-reveal");
    });
  }

  function applyAnswerResult(chosenKey, correctKey) {
    const map = { higher: higherBtn, same: sameBtn, lower: lowerBtn };
    const chosen  = map[chosenKey];
    const correct = map[correctKey];
    if (chosenKey === correctKey) {
      if (chosen) chosen.classList.add("answer-correct");
    } else {
      if (chosen)  chosen.classList.add("answer-incorrect");
      if (correct) correct.classList.add("answer-reveal");
    }
  }


  // ── Mini keyboard SVG ────────────────────────────────────
  const SVG_NS = "http://www.w3.org/2000/svg";

  function svgEl(tag, attrs = {}, children = []) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    for (const c of children) n.appendChild(c);
    return n;
  }

  function isBlackPc(pc) { return [1, 3, 6, 8, 10].includes(pc); }

  function whiteIndex(pc) {
    return ({ 0:0, 2:1, 4:2, 5:3, 7:4, 9:5, 11:6 })[pc] ?? null;
  }

  // Read live CSS variable values so the keyboard respects the current theme
  function getThemeColors() {
    const s = getComputedStyle(document.body);
    return {
      first:  s.getPropertyValue("--accent").trim()    || "#4086f6",
      second: s.getPropertyValue("--info-teal").trim() || "#0cbc67",
    };
  }

  function computeKbWindow(p1, p2) {
    const minP  = Math.min(p1, p2);
    let startC  = pitchFromPcOct(0, octFromPitch(minP));
    let endC    = startC + 24;
    if (Math.max(p1, p2) > endC) { startC += 12; endC = startC + 24; }
    startC = Math.max(pitchMin, startC);
    endC   = Math.min(pitchMax, endC);
    if (endC - startC < 12) {
      if (startC === pitchMin) endC   = Math.min(pitchMax, startC + 24);
      else                      startC = Math.max(pitchMin, endC - 24);
    }
    return { lo: startC, hi: endC };
  }

  function buildMiniKeyboard(p1, p2) {
    if (!miniMount) return;
    miniMount.innerHTML = "";

    // Placeholder shown before the player answers
    if (p1 == null || p2 == null) {
      if (miniLegend) miniLegend.classList.add("hidden");
      const ph = document.createElement("p");
      ph.className = "kbPlaceholder";
      ph.textContent = "The notes played will display here once you select an answer!";
      miniMount.appendChild(ph);
      return;
    }

    // Reveal the legend now that notes are known
    if (miniLegend) miniLegend.classList.remove("hidden");

    const { first: FC, second: SC } = getThemeColors();

    const { lo, hi } = computeKbWindow(p1, p2);
    const pitches = [];
    for (let p = lo; p <= hi; p++) pitches.push(p);

    const WHITE_W = 26, WHITE_H = 84, BLACK_W = 16, BLACK_H = 54;

    const whites = pitches.filter(p => whiteIndex(pcFromPitch(p)) != null);
    if (!whites.length) return;

    const svgW = whites.length * WHITE_W;
    const svgH = WHITE_H;

    const svg = svgEl("svg", {
      width: svgW, height: svgH,
      viewBox: `0 0 ${svgW} ${svgH}`,
      preserveAspectRatio: "xMidYMid meet",
      role: "img",
      "aria-label": "Mini keyboard showing the two notes played",
    });
    svg.style.maxWidth = `${svgW}px`;

    const style = svgEl("style");
    style.textContent = `
      .kb-w rect { fill: #fff; stroke: #333; stroke-width: 0.8; }
      .kb-b rect { fill: #111; stroke: #000; stroke-width: 0.8; }
      .kb-lbl { font-family: Inter, Arial, sans-serif; font-size: 10px; fill: rgba(0,0,0,0.5); font-weight: 800; user-select: none; }
      .kb-hl1 rect { fill: ${FC} !important; }
      .kb-hl1 .kb-lbl { fill: rgba(255,255,255,0.9) !important; }
      .kb-hl2 rect { fill: ${SC} !important; }
      .kb-hl2 .kb-lbl { fill: rgba(255,255,255,0.9) !important; }
    `;
    svg.appendChild(style);

    const gW = svgEl("g");
    const gB = svgEl("g");
    svg.appendChild(gW);
    svg.appendChild(gB);

    const wiByPitch = new Map();
    whites.forEach((p, i) => wiByPitch.set(p, i));

    // White keys — rounded bottom corners
    whites.forEach((p, i) => {
      const x   = i * WHITE_W;
      const pc  = pcFromPitch(p);
      const oct = octFromPitch(p);
      const grp = svgEl("g", { class: "kb-w" });
      grp.appendChild(svgEl("rect", { x, y: 0, width: WHITE_W, height: WHITE_H, rx: 4, ry: 4 }));
      const txt = svgEl("text", { x: x + WHITE_W / 2, y: WHITE_H - 10, "text-anchor": "middle", class: "kb-lbl" });
      txt.textContent = pc === 0 ? `${PC_NAMES_SHARP[pc]}${oct}` : "";
      grp.appendChild(txt);
      if (p === p1) grp.classList.add("kb-hl1");
      if (p === p2) grp.classList.add("kb-hl2");
      gW.appendChild(grp);
    });

    // Black keys — rounded corners
    const leftPcByBlack = { 1:0, 3:2, 6:5, 8:7, 10:9 };
    for (let p = lo; p <= hi; p++) {
      const pc = pcFromPitch(p);
      if (!isBlackPc(pc)) continue;
      const leftPc  = leftPcByBlack[pc];
      if (leftPc == null) continue;
      const oct     = octFromPitch(p);
      const leftW   = pitchFromPcOct(leftPc, oct);
      const wi      = wiByPitch.get(leftW);
      if (wi == null) continue;
      const x       = wi * WHITE_W + WHITE_W - BLACK_W / 2;
      const grp     = svgEl("g", { class: "kb-b" });
      grp.appendChild(svgEl("rect", { x, y: 0, width: BLACK_W, height: BLACK_H, rx: 3, ry: 3 }));
      if (p === p1) grp.classList.add("kb-hl1");
      if (p === p2) grp.classList.add("kb-hl2");
      gB.appendChild(grp);
    }

    miniMount.appendChild(svg);
  }


  // ── Progress saving ──────────────────────────────────────
  function saveProgress() {
    const t = totalAsked();
    if (t < 5) return; // Minimum 5 questions enforced

    const result = {
      id:        Date.now().toString() + Math.floor(Math.random() * 1000),
      gameId:    "higherOrLower",
      gameName:  "Higher Or Lower",
      timestamp: Date.now(),
      date:      new Date().toISOString(),
      correct:   score.correct,
      incorrect: score.incorrect,
      total:     t,
      accuracy:  parseFloat(accuracy().toFixed(1)),
      meta:      `Range: ${modeLabel()}`,
    };

    try {
      const existing = JSON.parse(localStorage.getItem(LS_KEY_RESULTS)) || [];
      existing.push(result);
      localStorage.setItem(LS_KEY_RESULTS, JSON.stringify(existing));
    } catch (e) {
      console.error("Failed to save progress:", e);
    }
  }


  // ── Player name persistence ──────────────────────────────
  function loadInitialName() {
    return String(localStorage.getItem(LS_KEY_NAME) || "").trim().slice(0, 32);
  }

  function saveName(name) {
    try { localStorage.setItem(LS_KEY_NAME, String(name || "").trim().slice(0, 32)); } catch {}
  }

  function syncNames(val) {
    if (playerNameInput      && playerNameInput.value      !== val) playerNameInput.value      = val;
    if (modalPlayerNameInput && modalPlayerNameInput.value !== val) modalPlayerNameInput.value = val;
  }


  // ── Modal helpers ────────────────────────────────────────
  function openModal(el)    { if (el) { el.classList.remove("hidden"); postHeightNow(); } }
  function closeModal(el)   { if (el) { el.classList.add("hidden");    postHeightNow(); } }
  function isVisible(el)    { return !!el && !el.classList.contains("hidden"); }

  function updateScoreModal() {
    const t   = totalAsked();
    const acc = accuracy();
    if (modalCorrectOut)    modalCorrectOut.textContent    = score.correct;
    if (modalIncorrectOut)  modalIncorrectOut.textContent  = score.incorrect;
    if (modalTotalOut)      modalTotalOut.textContent      = t;
    if (modalAccuracyOut)   modalAccuracyOut.textContent   = `${acc}%`;
    if (modalBestStreakOut) modalBestStreakOut.textContent  = score.bestStreak;
    if (modalScoreMeta)     modalScoreMeta.textContent     = `Range: ${modeLabel()}`;
  }

  let scoreModalCb = null;
  function showScoreModal(onContinue) {
    scoreModalCb = onContinue;
    updateScoreModal();
    openModal(scoreModal);
    try { scoreModalContinueBtn.focus(); } catch {}
  }


  // ── Navigation ───────────────────────────────────────────
  function navigateHome() {
    sessionStorage.setItem("et_play_back_sound", "true");
    window.location.href = "../../index.html";
  }

  function tryNavigateHome() {
    if (!started || totalAsked() === 0) { navigateHome(); return; }
    openModal(leaveModal);
  }


  // ── Core game flow ───────────────────────────────────────
  async function playPair({ allowAnswerAfter = true } = {}) {
    if (!started || note1 == null || note2 == null) return;

    const token = ++lastPlayToken;
    canAnswer   = false;
    updateControls();
    stopAllNotes(0.08);

    const ctx = ensureAudioGraph();
    if (!ctx) return;

    const t0 = ctx.currentTime + 0.04;
    await playPitch(note1, t0, NOTE_PLAY_SEC, FADE_OUT_SEC, 1.0);
    if (token !== lastPlayToken) return;

    const t1 = t0 + NOTE_PLAY_SEC + GAP_SEC;
    await playPitch(note2, t1, NOTE_PLAY_SEC, FADE_OUT_SEC, 1.0);
    if (token !== lastPlayToken) return;

    if (allowAnswerAfter) {
      const unlockMs = NOTE_PLAY_SEC * 1000 + 50;
      setTimeout(() => {
        if (token !== lastPlayToken) return;
        canAnswer = true;
        updateControls();
      }, unlockMs);
    }
  }

  async function startNewRound({ autoplay = true } = {}) {
    if (!started) return;
    awaitingNext = false;
    canAnswer    = false;
    clearAnswerBtnStates();
    updateControls();

    const pair = pickPair();
    note1 = pair.a;
    note2 = pair.b;

    buildMiniKeyboard(null, null);

    if (autoplay) {
      setFeedback("Listen carefully…", "Listening…");
      await new Promise(requestAnimationFrame);
      setFeedback(
        "Is the second note <strong>Higher</strong>, <strong>Lower</strong>, or the <strong>Same</strong>?",
        "Your Turn"
      );
      await playPair({ allowAnswerAfter: true });
    } else {
      setFeedback("Press <strong>Replay</strong> to hear the notes.", "Ready");
    }
  }

  async function replay() {
    if (!started || note1 == null || note2 == null) return;
    clearAnswerBtnStates();
    buildMiniKeyboard(null, null);
    awaitingNext = false;
    setFeedback("Replaying…", "Listening…");
    await playPair({ allowAnswerAfter: true });
  }

  function answer(choice) {
    if (!started || !canAnswer || note1 == null || note2 == null) return;

    const correct    = expectedAnswer(note1, note2);
    const isCorrect  = choice === correct;

    canAnswer    = false;
    awaitingNext = true;

    if (isCorrect) {
      setTimeout(() => playUiSound(UI_SND_CORRECT), 20);
      score.correct++;
      score.streak++;
      if (score.streak > score.bestStreak) score.bestStreak = score.streak;
    } else {
      playUiSound(UI_SND_INCORRECT);
      score.incorrect++;
      score.streak = 0;
    }

    renderScore();
    applyAnswerResult(choice, correct);
    buildMiniKeyboard(note1, note2);

    const l1 = pitchLabel(note1);
    const l2 = pitchLabel(note2);

    if (isCorrect) {
      setFeedback(
        `✅ Correct! — <strong>${l1}</strong> → <strong>${l2}</strong> (${correct}).`,
        "Correct!"
      );
    } else {
      setFeedback(
        `❌ Incorrect. You chose <strong>${choice}</strong> — answer was <strong>${correct}</strong>.<br>` +
        `<strong>${l1}</strong> → <strong>${l2}</strong>`,
        "Incorrect"
      );
    }

    updateControls();
  }

  async function goNext() {
    if (!started || !awaitingNext) return;
    clearAnswerBtnStates();
    await startNewRound({ autoplay: true });
  }

  function resetScore() {
    score.correct   = 0;
    score.incorrect = 0;
    score.streak    = 0;
    score.bestStreak = 0;
  }

  async function beginGame() {
    await resumeAudio();
    started   = true;
    note1     = null;
    note2     = null;
    resetScore();
    renderScore();
    updateBeginButton();
    clearAnswerBtnStates();
    await startNewRound({ autoplay: true });
  }

  function resetToLoadingScreen() {
    stopAllNotes(0.08);
    started      = false;
    awaitingNext = false;
    canAnswer    = false;
    note1        = null;
    note2        = null;
    resetScore();
    renderScore();
    updateBeginButton();
    clearAnswerBtnStates();
    buildMiniKeyboard(null, null);
    setFeedback("Press <strong>Begin Game</strong> to start.", "Ready");
    updateControls();
  }


  // ── Settings helpers ─────────────────────────────────────
  function applyRange(key) {
    currentModeKey = RANGES[key] ? key : "easy-1oct";
    computePitchBounds();
    try { localStorage.setItem(LS_KEY_RANGE, currentModeKey); } catch {}
  }


  // ── Scorecard PNG download ───────────────────────────────
  function safeText(s) { return String(s || "").replace(/[\u0000-\u001f\u007f]/g, "").trim(); }

  function sanitizeFilename(s) {
    return String(s || "").trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]+/g, "").slice(0, 32);
  }

  async function downloadScorecardPng(nameInputEl) {
    const name = safeText(nameInputEl?.value);
    if (nameInputEl) saveName(name);

    const isDark = !document.body.classList.contains("light-theme");
    const W      = 720;
    const ROWS   = 6;
    const ROW_H  = 52;
    const ROW_G  = 10;
    const H      = 300 + ROWS * (ROW_H + ROW_G) + 60;
    const dpr    = Math.max(1, window.devicePixelRatio || 1);

    const canvas = document.createElement("canvas");
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = isDark ? "#0f172a" : "#f1f5f9";
    ctx.fillRect(0, 0, W, H);

    // Card
    const PAD  = 28;
    const CX   = PAD, CY = PAD, CW = W - PAD * 2, CH = H - PAD * 2;
    const CR   = 18;

    function rr(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y,     x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x,     y + h, r);
      ctx.arcTo(x,     y + h, x,     y,     r);
      ctx.arcTo(x,     y,     x + w, y,     r);
      ctx.closePath();
    }

    ctx.fillStyle = isDark ? "#1e293b" : "#ffffff";
    rr(CX, CY, CW, CH, CR); ctx.fill();
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.09)";
    ctx.lineWidth   = 1.5;
    rr(CX, CY, CW, CH, CR); ctx.stroke();

    const textMain  = isDark ? "#ffffff" : "#0f172a";
    const textMuted = isDark ? "#cbd5e1" : "#475569";
    let yc          = CY + 30;

    // Title
    ctx.fillStyle = textMain;
    ctx.font      = "900 28px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Higher Or Lower", W / 2, yc);
    yc += 34;

    ctx.fillStyle = textMuted;
    ctx.font      = "700 15px Inter, Arial, sans-serif";
    ctx.fillText("The Ear Training Lab", W / 2, yc);
    yc += 24;

    ctx.font = "700 13px Inter, Arial, sans-serif";
    ctx.fillText(`Range: ${modeLabel()}`, W / 2, yc);
    yc += 20;

    if (name) {
      ctx.fillStyle = textMain;
      ctx.font      = "800 14px Inter, Arial, sans-serif";
      ctx.fillText(`Player: ${name}`, W / 2, yc);
    }
    yc += 28;

    // Divider
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.07)";
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(CX + 20, yc); ctx.lineTo(CX + CW - 20, yc); ctx.stroke();
    yc += 16;

    const rows = [
      ["Correct",     String(score.correct)],
      ["Incorrect",   String(score.incorrect)],
      ["Questions",   String(totalAsked())],
      ["Accuracy",    `${accuracy()}%`],
      ["Streak",      String(score.streak)],
      ["Best Streak", String(score.bestStreak)],
    ];

    const RX = CX + 18;
    const RW = CW - 36;

    for (const [k, v] of rows) {
      ctx.fillStyle = isDark ? "#0f172a" : "#f1f5f9";
      rr(RX, yc, RW, ROW_H, 11); ctx.fill();
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
      ctx.lineWidth   = 1;
      rr(RX, yc, RW, ROW_H, 11); ctx.stroke();

      ctx.fillStyle = textMuted;
      ctx.font      = "800 13px Inter, Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(k, RX + 14, yc + ROW_H / 2 + 5);

      ctx.fillStyle = textMain;
      ctx.font      = "900 18px Inter, Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(v, RX + RW - 14, yc + ROW_H / 2 + 6);

      yc += ROW_H + ROW_G;
    }

    // Footer
    ctx.textAlign = "center";
    ctx.font      = "700 11px Inter, Arial, sans-serif";
    ctx.fillStyle = textMuted;
    ctx.globalAlpha = 0.6;
    ctx.fillText("eartraininglab.com — Higher Or Lower", W / 2, CY + CH - 14);
    ctx.globalAlpha = 1;

    const base = name ? `${sanitizeFilename(name)}_hol_scorecard` : "hol_scorecard";
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a   = document.createElement("a");
      a.href     = url;
      a.download = `${base}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }


  // ── Event binding ────────────────────────────────────────
  function bind() {

    // ── Home button
    homeBtn.addEventListener("click", () => {
      playUiSound(UI_SND_BACK);
      tryNavigateHome();
    });

    // ── Intro modal
    introBeginBtn.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      const range = introRangeSelect?.value || "easy-1oct";
      applyRange(range);
      if (settingsRangeSelect) settingsRangeSelect.value = range;
      closeModal(introModal);
      setFeedback("Press <strong>Begin Game</strong> to start.", "Ready");
      try { beginBtn.focus(); } catch {}
    });

    introHomeBtn.addEventListener("click", () => {
      playUiSound(UI_SND_BACK);
      navigateHome();
    });

    introModal.addEventListener("click", e => {
      if (e.target === introModal) { playUiSound(UI_SND_BACK); closeModal(introModal); }
    });

    // ── Begin / End button
    beginBtn.addEventListener("click", async () => {
      if (!started) {
        await beginGame();
        return;
      }
      // Currently in a game — save and prompt
      saveProgress();
      showScoreModal(() => {
        resetToLoadingScreen();
        openModal(introModal);
        try { introBeginBtn.focus(); } catch {}
      });
    });

    // ── Replay
    replayBtn.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      replay();
    });

    // ── Answer buttons
    higherBtn.addEventListener("click", () => answer("higher"));
    sameBtn.addEventListener("click",   () => answer("same"));
    lowerBtn.addEventListener("click",  () => answer("lower"));

    // ── Next
    nextBtn.addEventListener("click", goNext);

    // ── Settings modal
    settingsBtn.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      stopAllNotes(0.06);
      if (settingsRangeSelect) settingsRangeSelect.value = currentModeKey;
      openModal(settingsModal);
    });

    settingsCancelBtn.addEventListener("click", () => {
      playUiSound(UI_SND_BACK);
      closeModal(settingsModal);
    });

    settingsRestartBtn.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      const newRange = settingsRangeSelect?.value || "easy-1oct";
      closeModal(settingsModal);
      if (started) {
        saveProgress();
        showScoreModal(() => {
          applyRange(newRange);
          if (introRangeSelect) introRangeSelect.value = newRange;
          resetToLoadingScreen();
        });
      } else {
        applyRange(newRange);
        if (introRangeSelect) introRangeSelect.value = newRange;
        renderScore();
      }
    });

    settingsModal.addEventListener("click", e => {
      if (e.target === settingsModal) { playUiSound(UI_SND_BACK); closeModal(settingsModal); }
    });

    // ── Info modal
    infoBtn.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      stopAllNotes(0.06);
      openModal(infoModal);
      try { infoClose.focus(); } catch {}
    });

    infoClose.addEventListener("click", () => {
      playUiSound(UI_SND_BACK);
      closeModal(infoModal);
    });

    infoModal.addEventListener("click", e => {
      if (e.target === infoModal) { playUiSound(UI_SND_BACK); closeModal(infoModal); }
    });

    // ── Score modal
    scoreModalContinueBtn.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      closeModal(scoreModal);
      if (scoreModalCb) scoreModalCb();
    });

    // ── Scorecard downloads
    downloadScorecardBtn.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      downloadScorecardPng(playerNameInput);
    });

    modalDownloadScorecardBtn.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      downloadScorecardPng(modalPlayerNameInput);
    });

    // ── Name sync across inputs
    playerNameInput?.addEventListener("input",      e => syncNames(e.target.value));
    modalPlayerNameInput?.addEventListener("input", e => syncNames(e.target.value));

    // ── Leave modal
    leaveSaveBtn.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      saveProgress();
      closeModal(leaveModal);
      navigateHome();
    });

    leaveDiscardBtn.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      closeModal(leaveModal);
      navigateHome();
    });

    leaveCancelBtn.addEventListener("click", () => {
      playUiSound(UI_SND_BACK);
      closeModal(leaveModal);
    });

    // ── Keyboard shortcuts
    document.addEventListener("keydown", async e => {
      // Escape closes topmost open modal
      if (e.key === "Escape") {
        if (isVisible(leaveModal))    { playUiSound(UI_SND_BACK); closeModal(leaveModal);    return; }
        if (isVisible(settingsModal)) { playUiSound(UI_SND_BACK); closeModal(settingsModal); return; }
        if (isVisible(infoModal))     { playUiSound(UI_SND_BACK); closeModal(infoModal);     return; }
        return;
      }

      // Block game shortcuts when any modal is open
      const anyModal = isVisible(introModal) || isVisible(settingsModal) ||
                       isVisible(scoreModal) || isVisible(infoModal)     ||
                       isVisible(leaveModal);
      if (anyModal || !started) return;

      if (e.code === "KeyR")         { await replay();              return; }
      if (e.code === "ArrowUp")      { answer("higher");            return; }
      if (e.code === "ArrowDown")    { answer("lower");             return; }
      if (e.code === "ArrowRight")   { answer("same");              return; }
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        if (awaitingNext) await goNext();
      }
    });
  }


  // ── Init ────────────────────────────────────────────────
  function init() {
    // Apply saved theme
    const savedTheme = localStorage.getItem(LS_KEY_THEME) || "dark";
    applyTheme(savedTheme);

    // Restore saved range
    const savedRange = localStorage.getItem(LS_KEY_RANGE) || "easy-1oct";
    applyRange(savedRange);
    if (introRangeSelect)    introRangeSelect.value    = currentModeKey;
    if (settingsRangeSelect) settingsRangeSelect.value = currentModeKey;

    // Restore saved player name
    const name = loadInitialName();
    syncNames(name);

    // Initial render
    renderScore();
    updateBeginButton();
    buildMiniKeyboard(null, null);
    setFeedback("Press <strong>Begin Game</strong> to start.", "Ready");
    updateControls();

    bind();

    // Show intro modal on load
    openModal(introModal);
    try { introBeginBtn.focus(); } catch {}
  }

  init();

})();
