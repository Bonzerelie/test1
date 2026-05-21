/* =========================================================
   /games/pitchmatch/pitchmatchscript.js
   Pitch Match — Landscape Edition
   Part of The Ear Training Lab app.

   A note from C3–C5 is played; the player finds it on a
   full two-octave piano keyboard (always visible, no octave
   navigation needed) and submits their answer.

   The game renders in forced landscape via a CSS 90° CW
   rotation — no range or octave options required.

   Progress is saved to localStorage "et_game_results"
   in the same format as all other Ear Training Lab games.
   ========================================================= */

(() => {
  "use strict";

  // ── Constants ──────────────────────────────────────────
  const AUDIO_DIR      = "../../audio";
  const LS_KEY_THEME   = "et_theme";
  const LS_KEY_NAME    = "et_pm_player_name";
  const LS_KEY_RESULTS = "et_game_results";

  const UI_SND_SELECT    = "select1.mp3";
  const UI_SND_BACK      = "back1.mp3";
  const UI_SND_CORRECT   = "correct1.mp3";
  const UI_SND_INCORRECT = "incorrect1.mp3";

  // Pitch-class → audio stem name
  const PC_TO_STEM = {
    0:"c", 1:"csharp", 2:"d", 3:"dsharp", 4:"e", 5:"f",
    6:"fsharp", 7:"g", 8:"gsharp", 9:"a", 10:"asharp", 11:"b",
  };

  const PC_NAMES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const PC_NAMES_FLAT  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];

  const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
  const BLACK_PCS = [1, 3, 6, 8, 10];

  // Fixed pitch pool: C3 (36) through C5 (60) inclusive — 25 chromatic notes.
  // C3=36, C#3=37 ... B4=59, C5=60
  const PITCH_POOL = Object.freeze(Array.from({ length: 25 }, (_, i) => 36 + i));

  const $ = id => document.getElementById(id);
  const SVG_NS = "http://www.w3.org/2000/svg";

  function svgEl(tag, attrs = {}) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  }


  // ── DOM references ──────────────────────────────────────
  const homeBtn     = $("homeBtn");
  const beginBtn    = $("beginBtn");
  const replayBtn   = $("replayBtn");
  const nextBtn     = $("nextBtn");
  const submitBtn   = $("submitBtn");
  const infoBtn     = $("infoBtn");

  const keyboardMount = $("keyboardMount");

  const phaseTitle    = $("phaseTitle");
  const feedbackOut   = $("feedbackOut");
  const correctOut    = $("correctOut");
  const incorrectOut  = $("incorrectOut");
  const totalOut      = $("totalOut");
  const accuracyOut   = $("accuracyOut");
  const streakOut     = $("streakOut");
  const bestStreakOut = $("bestStreakOut");
  const scoreMeta     = $("scoreMeta");

  const playerNameInput      = $("playerNameInput");
  const downloadScorecardBtn = $("downloadScorecardBtn");

  // Intro modal
  const introModal    = $("introModal");
  const introBeginBtn = $("introBeginBtn");
  const introHomeBtn  = $("introHomeBtn");

  // Score modal
  const scoreModal                = $("scoreModal");
  const scoreModalContinueBtn     = $("scoreModalContinueBtn");
  const modalPlayerNameInput      = $("modalPlayerNameInput");
  const modalDownloadScorecardBtn = $("modalDownloadScorecardBtn");
  const modalCorrectOut           = $("modalCorrectOut");
  const modalIncorrectOut         = $("modalIncorrectOut");
  const modalTotalOut             = $("modalTotalOut");
  const modalAccuracyOut          = $("modalAccuracyOut");
  const modalBestStreakOut        = $("modalBestStreakOut");
  const modalScoreMeta            = $("modalScoreMeta");

  // Info modal
  const infoModal = $("infoModal");
  const infoClose = $("infoClose");

  // Leave modal
  const leaveModal      = $("leaveModal");
  const leaveSaveBtn    = $("leaveSaveBtn");
  const leaveDiscardBtn = $("leaveDiscardBtn");
  const leaveCancelBtn  = $("leaveCancelBtn");


  // ── Game state ──────────────────────────────────────────
  let started         = false;
  let awaitingNext    = false;
  let targetPitch     = null;
  let lastTargetPitch = null;
  let selectedPitch   = null;  // absolute pitch integer, or null
  let kbLocked        = false; // true after answer until next question

  const score = { correct: 0, incorrect: 0, streak: 0, bestStreak: 0 };


  // ── Pitch helpers ───────────────────────────────────────
  function pitchFromPcOct(pc, oct) { return oct * 12 + pc; }
  function pcFromPitch(p)           { return ((p % 12) + 12) % 12; }
  function octFromPitch(p)          { return Math.floor(p / 12); }

  function pitchLabel(pitch) {
    const pc  = pcFromPitch(pitch);
    const oct = octFromPitch(pitch);
    if ([1, 3, 6, 8, 10].includes(pc)) {
      return `${PC_NAMES_SHARP[pc]}${oct} / ${PC_NAMES_FLAT[pc]}${oct}`;
    }
    return `${PC_NAMES_SHARP[pc]}${oct}`;
  }

  function rangeLabel() { return "C3–C5"; }


  // ── Theme ───────────────────────────────────────────────
  function applyTheme(theme) {
    document.body.classList.toggle("light-theme", theme === "light");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#f1f5f9" : "#0f172a");
  }


  // ── Audio engine ─────────────────────────────────────────
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

  function pitchToFrequency(pitch) {
    const A4 = pitchFromPcOct(9, 4);
    return 440 * Math.pow(2, (pitch - A4) / 12);
  }

  function playSynthTone(pitch, whenSec, playSec, fadeOutSec, gain = 0.6) {
    const ctx = ensureAudioGraph();
    if (!ctx || !masterGain) return;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(pitchToFrequency(pitch), whenSec);
    const g = ctx.createGain();
    const endAt = whenSec + Math.max(0.05, playSec);
    const fade  = Math.max(0.015, fadeOutSec);
    g.gain.setValueAtTime(0, whenSec);
    g.gain.linearRampToValueAtTime(gain, whenSec + 0.01);
    g.gain.setValueAtTime(gain, Math.max(whenSec + 0.02, endAt - fade));
    g.gain.linearRampToValueAtTime(0, endAt);
    osc.connect(g);
    g.connect(masterGain);
    trackVoice(osc, g);
    osc.start(whenSec);
    osc.stop(endAt + 0.03);
  }

  async function playPitch(pitch, gain = 1) {
    const pc   = pcFromPitch(pitch);
    const oct  = octFromPitch(pitch);
    const stem = PC_TO_STEM[pc];
    if (!stem) return;

    await resumeAudio();
    stopAllNotes(0.04);

    const url = `${AUDIO_DIR}/${stem}${oct}.mp3`;
    const buf = await loadBuffer(url);

    const ctx = ensureAudioGraph();
    if (!ctx) return;

    if (!buf) {
      if (!synthFallbackWarned) {
        synthFallbackWarned = true;
        console.warn("Audio sample missing; using synth:", url);
      }
      playSynthTone(pitch, ctx.currentTime, 1.2, 0.08, gain * 0.65);
      return;
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const safeGain = Math.max(0, gain);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(safeGain, ctx.currentTime + 0.004);
    src.connect(g);
    g.connect(masterGain);
    trackVoice(src, g);
    src.start(ctx.currentTime);
  }

  async function playUiSound(filename) {
    try {
      const url = `${AUDIO_DIR}/${filename}`;
      const buf = await loadBuffer(url);
      if (!buf) return;
      const ctx = ensureAudioGraph();
      if (!ctx) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.setValueAtTime(1.5, ctx.currentTime);
      src.connect(g);
      g.connect(masterGain);
      trackVoice(src, g);
      src.start(ctx.currentTime);
    } catch {}
  }


  // ── Score helpers ────────────────────────────────────────
  function totalAsked() { return score.correct + score.incorrect; }
  function accuracy()   {
    const t = totalAsked();
    return t ? (score.correct / t * 100) : 0;
  }

  function renderScore() {
    const meta = `Range: ${rangeLabel()}`;
    if (correctOut)    correctOut.textContent    = score.correct;
    if (incorrectOut)  incorrectOut.textContent  = score.incorrect;
    if (totalOut)      totalOut.textContent      = totalAsked();
    if (accuracyOut)   accuracyOut.textContent   = `${accuracy().toFixed(1)}%`;
    if (streakOut)     streakOut.textContent     = score.streak;
    if (bestStreakOut) bestStreakOut.textContent  = score.bestStreak;
    if (scoreMeta)     scoreMeta.textContent     = meta;

    if (modalCorrectOut)    modalCorrectOut.textContent    = score.correct;
    if (modalIncorrectOut)  modalIncorrectOut.textContent  = score.incorrect;
    if (modalTotalOut)      modalTotalOut.textContent      = totalAsked();
    if (modalAccuracyOut)   modalAccuracyOut.textContent   = `${accuracy().toFixed(1)}%`;
    if (modalBestStreakOut) modalBestStreakOut.textContent  = score.bestStreak;
    if (modalScoreMeta)     modalScoreMeta.textContent     = meta;
  }


  // ── UI helpers ───────────────────────────────────────────
  function setSyncedClass(el, cls, on) {
    if (el) el.classList.toggle(cls, !!on);
  }

  function isModalVisible(el) {
    return el && !el.classList.contains("hidden");
  }

  function anyModalOpen() {
    return [introModal, scoreModal, infoModal, leaveModal].some(m => isModalVisible(m));
  }

  function updateControls() {
    const modal = anyModalOpen();

    // Replay: available while a question is live
    replayBtn.disabled = !started || targetPitch == null || awaitingNext || modal;
    setSyncedClass(replayBtn, "pulse", !replayBtn.disabled);

    // Next
    const canNext = started && awaitingNext && !modal;
    nextBtn.disabled = !canNext;
    setSyncedClass(nextBtn, "nextReady", canNext);

    // Submit
    const canSubmit = started && !awaitingNext && selectedPitch !== null && targetPitch != null && !modal;
    submitBtn.disabled = !canSubmit;
    setSyncedClass(submitBtn, "pulse", canSubmit);

    // Begin
    beginBtn.textContent = started ? "End / Restart" : "Begin Game";
    setSyncedClass(beginBtn, "pulse",   !started);
    setSyncedClass(beginBtn, "primary", true);
  }

  // Open / close modals
  let lastFocus = null;
  function openModal(el) {
    if (!el) return;
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el.classList.remove("hidden");
    updateControls();
  }
  function closeModal(el) {
    if (!el) return;
    el.classList.add("hidden");
    updateControls();
    if (lastFocus) { try { lastFocus.focus({ preventScroll: true }); } catch {} }
  }


  // ── Keyboard building ────────────────────────────────────
  // Renders the full C3–C5 range as a static piano keyboard:
  //   Octave 3: 7 white + 5 black keys
  //   Octave 4: 7 white + 5 black keys
  //   C5:       1 final white key
  // Total: 15 white, 10 black keys, 25 notes.
  function buildKeyboard() {
    if (!keyboardMount) return;
    keyboardMount.innerHTML = "";

    const WHITE_W = 56;
    const WHITE_H = 212;
    const BLACK_W = 34;
    const BLACK_H = 138;

    // viewBox: 15 white keys wide × WHITE_H tall
    // Aspect ratio ≈ 1.333:1 — fills the right panel on typical mobile screens.
    const totalWhites = 15;
    const outerW = totalWhites * WHITE_W;
    const outerH = WHITE_H;

    const s = svgEl("svg", {
      width:  "100%",
      height: "100%",
      viewBox: `0 0 ${outerW} ${outerH}`,
      preserveAspectRatio: "xMidYMid meet",
      role: "img",
      "aria-label": "Piano keyboard — C3 to C5",
    });
    s.style.display  = "block";
    s.style.overflow = "visible";

    // ── Inline key styles ────────────────────────────────
    const styleEl = svgEl("style");
    styleEl.textContent = `
      .pm-w rect { fill: #ffffff; stroke: #cbd5e1; stroke-width: 2; transition: fill 0.12s; cursor: pointer; }
      .pm-w text { font-family: var(--font-main, sans-serif); font-size: 15px; fill: #334155;
                   pointer-events: none; font-weight: 900; }
      .pm-b rect { fill: #0f172a; stroke: #000000; stroke-width: 2; transition: fill 0.12s; cursor: pointer; }
      .pm-b text { font-family: var(--font-main, sans-serif); font-size: 11px; fill: #cbd5e1;
                   pointer-events: none; font-weight: 700; }

      .pm-key.chosen.pm-w rect { fill: #dbeafe !important; stroke: #3b82f6 !important; stroke-width: 4; }
      .pm-key.chosen.pm-b rect { fill: #3b82f6 !important; stroke: #1d4ed8 !important; stroke-width: 3; }
      .pm-key.chosen text       { fill: #1e40af !important; }
      .pm-key.chosen.pm-b text  { fill: #ffffff !important; }

      .pm-key.correct.pm-w rect { fill: #10b981 !important; stroke: #047857 !important; stroke-width: 3; }
      .pm-key.correct.pm-b rect { fill: #10b981 !important; stroke: #047857 !important; stroke-width: 3; }
      .pm-key.correct text       { fill: #ffffff !important; }

      .pm-key.incorrect.pm-w rect { fill: #ef4444 !important; stroke: #b91c1c !important; stroke-width: 3; }
      .pm-key.incorrect.pm-b rect { fill: #ef4444 !important; stroke: #b91c1c !important; stroke-width: 3; }
      .pm-key.incorrect text       { fill: #ffffff !important; }
    `;
    s.appendChild(styleEl);

    // White-key layer rendered first so black keys sit on top
    const gW = svgEl("g");
    const gB = svgEl("g");
    s.appendChild(gW);
    s.appendChild(gB);

    // For each octave: maps pitch-class to the x position of that white key
    const blackLeftPc = { 1: 0, 3: 2, 6: 5, 8: 7, 10: 9 };

    function addWhiteKey(pc, oct, x) {
      const grp = document.createElementNS(SVG_NS, "g");
      grp.setAttribute("class", "pm-key pm-w");
      grp.setAttribute("data-pc",  String(pc));
      grp.setAttribute("data-oct", String(oct));

      grp.appendChild(svgEl("rect", {
        x, y: 0, width: WHITE_W, height: WHITE_H, rx: 5, ry: 5,
      }));

      // Label: C notes show octave number (C3, C4, C5); others show letter only
      const label = pc === 0 ? `C${oct}` : PC_NAMES_SHARP[pc];
      const txt = svgEl("text", {
        x: x + WHITE_W / 2,
        y: WHITE_H - 14,
        "text-anchor": "middle",
      });
      txt.textContent = label;
      grp.appendChild(txt);

      grp.addEventListener("click", () => handleKeyClick(pc, oct));
      gW.appendChild(grp);
    }

    function addBlackKey(pc, oct, leftNeighbourX) {
      const x = leftNeighbourX + WHITE_W - BLACK_W / 2;

      const grp = document.createElementNS(SVG_NS, "g");
      grp.setAttribute("class", "pm-key pm-b");
      grp.setAttribute("data-pc",  String(pc));
      grp.setAttribute("data-oct", String(oct));

      grp.appendChild(svgEl("rect", {
        x, y: 0, width: BLACK_W, height: BLACK_H, rx: 4, ry: 4,
      }));

      // Sharp name label near the bottom of the black key
      const txt = svgEl("text", {
        x: x + BLACK_W / 2,
        y: BLACK_H - 12,
        "text-anchor": "middle",
      });
      txt.textContent = PC_NAMES_SHARP[pc];
      grp.appendChild(txt);

      grp.addEventListener("click", () => handleKeyClick(pc, oct));
      gB.appendChild(grp);
    }

    // ── Render octaves 3 and 4 (7 white + 5 black each) ──
    [3, 4].forEach((oct, octIdx) => {
      const octStartX = octIdx * 7 * WHITE_W;
      const xByPc = {};

      WHITE_PCS.forEach((pc, wIdx) => {
        const x = octStartX + wIdx * WHITE_W;
        xByPc[pc] = x;
        addWhiteKey(pc, oct, x);
      });

      BLACK_PCS.forEach(pc => {
        addBlackKey(pc, oct, xByPc[blackLeftPc[pc]]);
      });
    });

    // ── C5: 15th and final white key ──
    addWhiteKey(0, 5, 14 * WHITE_W);

    keyboardMount.appendChild(s);
  }

  function applyChosenHighlight() {
    if (!keyboardMount || selectedPitch === null) return;
    const pc  = pcFromPitch(selectedPitch);
    const oct = octFromPitch(selectedPitch);
    const grp = keyboardMount.querySelector(`[data-pc="${pc}"][data-oct="${oct}"]`);
    if (grp) grp.classList.add("chosen");
  }

  function clearKeyHighlights() {
    if (!keyboardMount) return;
    keyboardMount.querySelectorAll(".pm-key").forEach(k =>
      k.classList.remove("chosen", "correct", "incorrect")
    );
  }

  function handleKeyClick(pc, oct) {
    if (!started || awaitingNext || kbLocked) return;

    const clickedPitch = pitchFromPcOct(pc, oct);

    // Toggle off if same key clicked again
    if (selectedPitch === clickedPitch) {
      selectedPitch = null;
      clearKeyHighlights();
    } else {
      selectedPitch = clickedPitch;
      clearKeyHighlights();
      applyChosenHighlight();
      playPitch(clickedPitch, 0.75);
    }
    updateControls();
  }


  // ── Game flow ─────────────────────────────────────────────
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pickRandomPitch() {
    const pool = PITCH_POOL;
    if (!pool.length) return null;
    if (pool.length === 1) return pool[0];
    // Avoid repeating the same pitch twice in a row
    for (let i = 0; i < 8; i++) {
      const p = pool[randomInt(0, pool.length - 1)];
      if (p !== lastTargetPitch) return p;
    }
    return pool[randomInt(0, pool.length - 1)];
  }

  async function startNewQuestion({ autoplay = true } = {}) {
    if (!started) return;

    clearKeyHighlights();
    selectedPitch = null;
    awaitingNext  = false;
    kbLocked      = false;
    updateControls();

    targetPitch     = pickRandomPitch();
    lastTargetPitch = targetPitch;

    if (phaseTitle)  phaseTitle.textContent = "Which note is this?";
    if (feedbackOut) feedbackOut.innerHTML =
      "Listen carefully, then find the note on the keyboard and press <strong>Submit Answer</strong>.";

    renderScore();
    updateControls();

    if (autoplay && targetPitch != null) {
      await new Promise(requestAnimationFrame);
      await playPitch(targetPitch, 1);
    }
    updateControls();
  }

  async function submitAnswer() {
    if (!started || awaitingNext || selectedPitch === null || targetPitch == null) return;

    stopAllNotes(0.04);

    const submittedPitch = selectedPitch;
    const submittedPc    = pcFromPitch(submittedPitch);
    const submittedOct   = octFromPitch(submittedPitch);
    const isCorrect      = submittedPitch === targetPitch;

    if (isCorrect) {
      setTimeout(() => playUiSound(UI_SND_CORRECT), 20);
      score.correct++;
      score.streak++;
      if (score.streak > score.bestStreak) score.bestStreak = score.streak;
      renderScore();

      if (phaseTitle)  phaseTitle.textContent = "Correct! ✅";
      if (feedbackOut) feedbackOut.innerHTML =
        `That was <strong>${pitchLabel(targetPitch)}</strong>. Well done!`;

      // Highlight correct key green (always visible — full range shown)
      const grp = keyboardMount.querySelector(
        `[data-pc="${submittedPc}"][data-oct="${submittedOct}"]`
      );
      if (grp) { grp.classList.remove("chosen"); grp.classList.add("correct"); }

    } else {
      playUiSound(UI_SND_INCORRECT);
      score.incorrect++;
      score.streak = 0;
      renderScore();

      const targetPc  = pcFromPitch(targetPitch);
      const targetOct = octFromPitch(targetPitch);

      if (phaseTitle)  phaseTitle.textContent = "Incorrect ❌";
      if (feedbackOut) feedbackOut.innerHTML =
        `The note was <strong>${pitchLabel(targetPitch)}</strong>.`;

      // Mark wrong key red
      const wrongGrp = keyboardMount.querySelector(
        `[data-pc="${submittedPc}"][data-oct="${submittedOct}"]`
      );
      if (wrongGrp) { wrongGrp.classList.remove("chosen"); wrongGrp.classList.add("incorrect"); }

      // Show correct key green (always visible since the full range is displayed)
      const correctGrp = keyboardMount.querySelector(
        `[data-pc="${targetPc}"][data-oct="${targetOct}"]`
      );
      if (correctGrp) {
        correctGrp.classList.remove("chosen", "incorrect");
        correctGrp.classList.add("correct");
      }
    }

    selectedPitch = null;
    awaitingNext  = true;
    kbLocked      = true;
    updateControls();
  }

  async function goNext() {
    if (!started || !awaitingNext) return;
    stopAllNotes(0.04);
    clearKeyHighlights();
    await startNewQuestion({ autoplay: true });
  }

  async function replayTarget() {
    if (!started || targetPitch == null || awaitingNext) return;
    await playPitch(targetPitch, 1);
  }

  async function startGame() {
    await resumeAudio();
    stopAllNotes();

    started       = true;
    awaitingNext  = false;
    kbLocked      = false;
    selectedPitch = null;
    score.correct    = 0;
    score.incorrect  = 0;
    score.streak     = 0;
    score.bestStreak = 0;

    clearKeyHighlights();
    renderScore();
    updateControls();
    await startNewQuestion({ autoplay: true });
  }

  function endGame({ saveAndLeave = false } = {}) {
    stopAllNotes();

    if (saveAndLeave) {
      saveProgress();
      navigateHome();
      return;
    }

    saveProgress();
    showScoreModal(() => {
      started       = false;
      awaitingNext  = false;
      kbLocked      = false;
      selectedPitch = null;
      clearKeyHighlights();
      targetPitch = null;
      if (phaseTitle)  phaseTitle.textContent = "Ready";
      if (feedbackOut) feedbackOut.innerHTML  = `Press <strong>Begin Game</strong> to start.`;
      renderScore();
      updateControls();
      openModal(introModal);
      try { introBeginBtn.focus({ preventScroll: true }); } catch {}
    });
  }

  function navigateHome() {
    try { sessionStorage.setItem("et_play_back_sound", "true"); } catch {}
    window.location.href = "../../index.html";
  }


  // ── Progress saving ───────────────────────────────────────
  function saveProgress() {
    const total = totalAsked();
    if (total < 5) return;

    const result = {
      id:        Date.now().toString() + Math.floor(Math.random() * 1000),
      gameId:    "pitchMatch",
      gameName:  "Pitch Match",
      timestamp: Date.now(),
      date:      new Date().toISOString(),
      correct:   score.correct,
      incorrect: score.incorrect,
      total:     total,
      accuracy:  parseFloat(accuracy().toFixed(1)),
      meta:      `Range: ${rangeLabel()}`,
    };

    try {
      const existing = JSON.parse(localStorage.getItem(LS_KEY_RESULTS) || "[]");
      existing.push(result);
      localStorage.setItem(LS_KEY_RESULTS, JSON.stringify(existing));
    } catch (e) {
      console.error("Failed to save progress:", e);
    }
  }


  // ── Score modal ───────────────────────────────────────────
  let scoreModalCallback = null;
  function showScoreModal(onContinue) {
    scoreModalCallback = onContinue;
    renderScore();
    openModal(scoreModal);
    try { scoreModalContinueBtn.focus({ preventScroll: true }); } catch {}
  }


  // ── Name persistence ──────────────────────────────────────
  function loadName() {
    try { return (localStorage.getItem(LS_KEY_NAME) || "").trim().slice(0, 32); } catch { return ""; }
  }
  function saveName(name) {
    try { localStorage.setItem(LS_KEY_NAME, String(name || "").trim().slice(0, 32)); } catch {}
  }
  function syncNameInputs(val) {
    if (playerNameInput      && playerNameInput.value      !== val) playerNameInput.value      = val;
    if (modalPlayerNameInput && modalPlayerNameInput.value !== val) modalPlayerNameInput.value = val;
  }


  // ── Score card PNG download ────────────────────────────────
  function safeText(s) { return String(s || "").replace(/[\u0000-\u001f\u007f]/g, "").trim(); }
  function sanitizeFilename(s) {
    return String(s||"").trim().replace(/\s+/g,"_").replace(/[^a-zA-Z0-9_\-]/g,"").slice(0,32) || "";
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x+rr, y); ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr); ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr); ctx.closePath();
  }

  async function downloadScorecardPng(nameInputEl) {
    const name = safeText(nameInputEl?.value);
    if (nameInputEl) saveName(name);

    const W = 720;
    const rows = [
      ["Correct",     String(score.correct)],
      ["Incorrect",   String(score.incorrect)],
      ["Total",       String(totalAsked())],
      ["Accuracy",    `${accuracy().toFixed(1)}%`],
      ["Best Streak", String(score.bestStreak)],
    ];
    const rowH  = 58;
    const gap   = 14;
    const padV  = 34;
    const headH = 280;
    const H = padV * 2 + headH + rows.length * (rowH + gap) + 60;
    const dpr = Math.max(1, Math.floor((window.devicePixelRatio || 1) * 100) / 100);

    const canvas = document.createElement("canvas");
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    const cx = padV, cy = padV, cw = W - padV*2, ch = H - padV*2;
    ctx.fillStyle = "#f8fafc";
    drawRoundRect(ctx, cx, cy, cw, ch, 20); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.10)"; ctx.lineWidth = 1;
    drawRoundRect(ctx, cx, cy, cw, ch, 20); ctx.stroke();

    let y = cy + 28;

    ctx.fillStyle = "#0f172a";
    ctx.font = "900 28px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Pitch Match", W/2, y); y += 40;

    ctx.font = "700 20px Inter, Arial, sans-serif";
    ctx.fillStyle = "rgba(15,23,42,0.65)";
    ctx.fillText("Score Card", W/2, y); y += 36;

    ctx.font = "800 16px Inter, Arial, sans-serif";
    ctx.fillStyle = "rgba(15,23,42,0.60)";
    ctx.fillText(`Range: ${rangeLabel()}`, W/2, y); y += 30;

    if (name) { ctx.fillText(`Player: ${name}`, W/2, y); y += 30; }
    y += 20;

    const rx = cx + 26, rw = cw - 52;
    ctx.textAlign = "left";
    for (const [k, v] of rows) {
      ctx.fillStyle = "#ffffff";
      drawRoundRect(ctx, rx, y, rw, rowH, 12); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.12)"; ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "rgba(15,23,42,0.70)";
      ctx.font = "800 17px Inter, Arial, sans-serif";
      ctx.fillText(k, rx + 16, y + 35);

      ctx.fillStyle = "#0f172a";
      ctx.font = "900 20px Inter, Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(v, rx + rw - 16, y + 38);
      ctx.textAlign = "left";

      y += rowH + gap;
    }

    ctx.textAlign = "center";
    ctx.font = "700 13px Inter, Arial, sans-serif";
    ctx.fillStyle = "rgba(15,23,42,0.40)";
    ctx.fillText("Pitch Match – www.eartraininglab.com", W/2, cy + ch - 20);

    const fileBase = name ? `${sanitizeFilename(name)}_pm_scorecard` : "pm_scorecard";
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a   = document.createElement("a");
      a.href = url; a.download = `${fileBase}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }


  // ── Event bindings ────────────────────────────────────────
  function bind() {

    // Home
    homeBtn.addEventListener("click", () => {
      playUiSound(UI_SND_BACK);
      if (!started || totalAsked() === 0) { navigateHome(); return; }
      openModal(leaveModal);
    });

    leaveSaveBtn.addEventListener("click", () => {
      closeModal(leaveModal);
      endGame({ saveAndLeave: true });
    });
    leaveDiscardBtn.addEventListener("click", () => {
      closeModal(leaveModal);
      navigateHome();
    });
    leaveCancelBtn.addEventListener("click", () => {
      playUiSound(UI_SND_BACK);
      closeModal(leaveModal);
    });

    // Begin / End
    beginBtn.addEventListener("click", async () => {
      if (!started) {
        await startGame();
      } else {
        playUiSound(UI_SND_SELECT);
        endGame();
      }
    });

    // Replay
    replayBtn.addEventListener("click", () => replayTarget());

    // Submit
    submitBtn.addEventListener("click", () => submitAnswer());

    // Next
    nextBtn.addEventListener("click", () => goNext());

    // Intro modal
    introBeginBtn.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      closeModal(introModal);
      if (!started) {
        if (phaseTitle)  phaseTitle.textContent = "Ready";
        if (feedbackOut) feedbackOut.innerHTML  = `Press <strong>Begin Game</strong> to start.`;
        updateControls();
        try { beginBtn.focus({ preventScroll: true }); } catch {}
      }
    });
    introHomeBtn.addEventListener("click", () => {
      playUiSound(UI_SND_BACK);
      navigateHome();
    });
    introModal.addEventListener("click", e => {
      if (e.target === introModal) { playUiSound(UI_SND_BACK); closeModal(introModal); }
    });

    // Score modal
    scoreModalContinueBtn.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      closeModal(scoreModal);
      if (scoreModalCallback) { scoreModalCallback(); scoreModalCallback = null; }
    });
    scoreModal.addEventListener("click", e => {
      if (e.target === scoreModal) {
        playUiSound(UI_SND_BACK);
        closeModal(scoreModal);
        if (scoreModalCallback) { scoreModalCallback(); scoreModalCallback = null; }
      }
    });

    // Info modal
    infoBtn.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      stopAllNotes();
      openModal(infoModal);
    });
    infoClose.addEventListener("click", () => {
      playUiSound(UI_SND_BACK);
      closeModal(infoModal);
    });
    infoModal.addEventListener("click", e => {
      if (e.target === infoModal) { playUiSound(UI_SND_BACK); closeModal(infoModal); }
    });

    // Score card downloads
    downloadScorecardBtn.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      downloadScorecardPng(playerNameInput);
    });
    modalDownloadScorecardBtn.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      downloadScorecardPng(modalPlayerNameInput);
    });

    // Name syncing
    if (playerNameInput)
      playerNameInput.addEventListener("input", e => {
        saveName(e.target.value); syncNameInputs(e.target.value);
      });
    if (modalPlayerNameInput)
      modalPlayerNameInput.addEventListener("input", e => {
        saveName(e.target.value); syncNameInputs(e.target.value);
      });

    // Keyboard shortcuts
    document.addEventListener("keydown", async e => {
      if (e.key === "Escape") {
        if (isModalVisible(infoModal))  { playUiSound(UI_SND_BACK); closeModal(infoModal);  return; }
        if (isModalVisible(leaveModal)) { playUiSound(UI_SND_BACK); closeModal(leaveModal); return; }
        return;
      }
      if (anyModalOpen()) return;
      if (!started) return;

      if (e.code === "KeyR") { e.preventDefault(); await replayTarget(); return; }

      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        if (awaitingNext && !nextBtn.disabled)        { await goNext(); }
        else if (!awaitingNext && !submitBtn.disabled) { await submitAnswer(); }
      }
    });
  }


  // ── Initialisation ────────────────────────────────────────
  function init() {
    // Apply saved theme
    try { applyTheme(localStorage.getItem(LS_KEY_THEME) || "dark"); } catch { applyTheme("dark"); }

    // Restore saved player name
    syncNameInputs(loadName());

    // Build the static C3–C5 keyboard
    buildKeyboard();

    renderScore();
    updateControls();

    if (phaseTitle)  phaseTitle.textContent = "Ready";
    if (feedbackOut) feedbackOut.innerHTML  = `Press <strong>Begin Game</strong> to start.`;

    bind();

    // Show intro modal on load
    openModal(introModal);
    try { introBeginBtn.focus({ preventScroll: true }); } catch {}

    // ── Landscape touch-scroll handler ────────────────────────
    // The .app is rotated 90° CW so its overflow-y axis appears
    // horizontal on the physical screen. Map horizontal finger
    // swipes (screen x) → app.scrollTop so the user can scroll
    // the landscape layout naturally (swipe left = scroll down).
    const appEl = document.querySelector(".app");
    let touchDrag = null;

    appEl.addEventListener("touchstart", e => {
      // Ignore touches that begin on the keyboard or any modal
      if (e.target.closest("#keyboardMount") || e.target.closest(".modal")) return;
      touchDrag = { startX: e.touches[0].clientX, startTop: appEl.scrollTop };
    }, { passive: true });

    appEl.addEventListener("touchmove", e => {
      if (!touchDrag || anyModalOpen()) return;
      const dx = e.touches[0].clientX - touchDrag.startX;
      // Left swipe (dx < 0) → scroll down; right swipe → scroll up
      appEl.scrollTop = touchDrag.startTop - dx;
    }, { passive: true });

    appEl.addEventListener("touchend",    () => { touchDrag = null; }, { passive: true });
    appEl.addEventListener("touchcancel", () => { touchDrag = null; }, { passive: true });
  }

  init();
})();
