/* =========================
   /script.js
   Identifying Chromatic Notes
   ========================= */
   (() => {
    "use strict";
  
    const AUDIO_DIR = "../../audio";    
    const LS_KEY_THEME = "et_theme";
    const LS_KEY_RANGE = "et_chromatic_range";
    const LS_KEY_ACTIVE_PCS = "et_chromatic_active_pcs";
    const LS_KEY_INPUT = "et_chromatic_input";
    const LS_KEY_NAME = "et_chromatic_player_name";
  
    const UI_SND_SELECT = "select1.mp3";
    const UI_SND_BACK = "back1.mp3";
    const UI_SND_CORRECT = "correct1.mp3";
    const UI_SND_INCORRECT = "incorrect1.mp3";
    const UI_SND_PAGE = "chromaticpage.mp3";
  
    // Chromatic definitions
    const CHROMATIC_NAMES = ["C", "C#/Db", "D", "D#/Eb", "E", "F", "F#/Gb", "G", "G#/Ab", "A", "A#/Bb", "B"];
  
    // Note stems (audio uses sharps)
    const PC_TO_STEM = {
      0: "c", 1: "csharp", 2: "d", 3: "dsharp", 4: "e", 5: "f",
      6: "fsharp", 7: "g", 8: "gsharp", 9: "a", 10: "asharp", 11: "b",
    };
  
    const RANGE_OPTIONS = [
      { key: "one", label: "One Octave (C4 - B4)" },
      { key: "multi", label: "Multiple Octaves (C2 - C6)" },
    ];
    
    const INPUT_OPTIONS = [
      { key: "buttons", label: "Standard Buttons" },
      { key: "keyboard", label: "Virtual Keyboard" },
    ];
  
    const $ = (id) => document.getElementById(id);
  
    const homeBtn = $("homeBtn");
    const beginBtn = $("beginBtn");
    const replayBtn = $("replayBtn");
    const nextBtn = $("nextBtn");
    const refTonicBtn = $("refTonicBtn");
    const infoBtn = $("infoBtn");
  
    const phaseTitle = $("phaseTitle");
    const correctOut = $("correctOut");
    const incorrectOut = $("incorrectOut");
    const totalOut = $("totalOut");
    const accuracyOut = $("accuracyOut");
    const perNoteOut = $("perNoteOut"); 
  
    const answerButtons = $("answerButtons");
    const answerKeyboard = $("answerKeyboard");
    const feedbackOut = $("feedbackOut");
  
    const settingsBtn = $("settingsBtn");
    const settingsModal = $("settingsModal");
    const settingsRangeSelect = $("settingsRangeSelect");
    const settingsNotesKeyboard = $("settingsNotesKeyboard");
    const settingsInputSelect = $("settingsInputSelect");
    const settingsRestartBtn = $("settingsRestartBtn");
    const settingsCancelBtn = $("settingsCancelBtn");
  
    const introModal = $("introModal");
    const introBeginBtn = $("introBeginBtn");
    const introBeginBtnTop = $("introBeginBtnTop"); 
    const introHomeBtn = $("introHomeBtn");
    const introRangeSelect = $("introRangeSelect"); 
    const introNotesKeyboard = $("introNotesKeyboard"); 
    const introInputSelect = $("introInputSelect"); 

    const scoreModal = $("scoreModal");
    const modalScoreMeta = $("modalScoreMeta");
    const modalPlayerNameInput = $("modalPlayerNameInput");
    const modalDownloadScorecardBtn = $("modalDownloadScorecardBtn");
    const modalCorrectOut = $("modalCorrectOut");
    const modalIncorrectOut = $("modalIncorrectOut");
    const modalTotalOut = $("modalTotalOut");
    const modalAccuracyOut = $("modalAccuracyOut");
    const modalPerNoteOut = $("modalPerNoteOut");
    const scoreModalContinueBtn = $("scoreModalContinueBtn");
  
    const infoModal = $("infoModal");
    const infoClose = $("infoClose");

    const leaveModal = $("leaveModal");
    const leaveSaveBtn = $("leaveSaveBtn");
    const leaveDiscardBtn = $("leaveDiscardBtn");
    const leaveCancelBtn = $("leaveCancelBtn");
  
    const scoreMeta = $("scoreMeta");
    const downloadScorecardBtn = $("downloadScorecardBtn");
    const playerNameInput = $("playerNameInput");
  
  
    // ---------------- iframe sizing ----------------
    let lastHeight = 0;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = Math.ceil(entry.contentRect.height);
        if (h !== lastHeight) {
          parent.postMessage({ iframeHeight: h }, "*");
          lastHeight = h;
        }
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
  
    // ---------------- Theme Loading ----------------
    function applyTheme(theme) {
      if (theme === "light") {
        document.body.classList.add("light-theme");
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute("content", "#f1f5f9");
      } else {
        document.body.classList.remove("light-theme");
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute("content", "#0f172a");
      }
    }

    // ---------------- audio (WebAudio + synth fallback) ----------------
    let audioCtx = null;
    let masterGain = null;
  
    const bufferPromiseCache = new Map();
    const activeVoices = new Set();
    const activeUiAudios = new Set();
    let synthFallbackWarned = false;
  
    function ensureAudioGraph() {
      if (audioCtx) return audioCtx;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
  
      audioCtx = new Ctx();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.7; 
  
      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.value = -10;   
      compressor.knee.value = 12;         
      compressor.ratio.value = 12;        
      compressor.attack.value = 0.002;    
      compressor.release.value = 0.25;
  
      masterGain.connect(compressor);
      compressor.connect(audioCtx.destination);
      return audioCtx;
    }
  
    async function resumeAudioIfNeeded() {
      const ctx = ensureAudioGraph();
      if (!ctx) return;
      if (ctx.state === "suspended") {
        try { await ctx.resume(); } catch {}
      }
    }
  
    function trackVoice(src, gain, startTime) {
      const voice = { src, gain, startTime };
      activeVoices.add(voice);
      src.onended = () => activeVoices.delete(voice);
      return voice;
    }
  
    function stopAllNotes(fadeSec = 0.05) {
      const ctx = ensureAudioGraph();
      if (!ctx) return;
  
      const now = ctx.currentTime;
      const fade = Math.max(0.01, Number.isFinite(fadeSec) ? fadeSec : 0.05);
  
      activeVoices.forEach((v) => {
        try {
          v.gain.gain.cancelScheduledValues(now);
          v.gain.gain.setValueAtTime(v.gain.gain.value, now);
          v.gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
          v.src.stop(now + fade + 0.05);
        } catch (e) {}
      });
      activeVoices.clear();
    }
  
    function noteUrl(stem, octaveNum) { return `${AUDIO_DIR}/${stem}${octaveNum}.mp3`; }
  
    function loadBuffer(url) {
      if (bufferPromiseCache.has(url)) return bufferPromiseCache.get(url);
      const p = (async () => {
        const ctx = ensureAudioGraph();
        if (!ctx) return null;
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          const ab = await res.arrayBuffer();
          return await ctx.decodeAudioData(ab);
        } catch { return null; }
      })();
      bufferPromiseCache.set(url, p);
      return p;
    }
  
    function playBufferAt(buffer, whenSec, gain = 1) {
      const ctx = ensureAudioGraph();
      if (!ctx || !masterGain) return null;
  
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const g = ctx.createGain();
      const safeGain = Math.max(0, Number.isFinite(gain) ? gain : 1);
      const fadeIn = 0.02; 
      
      g.gain.value = 0;
      g.gain.setValueAtTime(0, 0);
      g.gain.setValueAtTime(0, whenSec);
      g.gain.linearRampToValueAtTime(safeGain, whenSec + fadeIn);
  
      src.connect(g);
      g.connect(masterGain);
      trackVoice(src, g, whenSec);
      src.start(whenSec);
      return src;
    }
  
    function playBufferWindowed(buffer, whenSec, playSec, fadeOutSec, gain = 1) {
      const ctx = ensureAudioGraph();
      if (!ctx || !masterGain) return null;
  
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const g = ctx.createGain();
      const safeGain = Math.max(0, Number.isFinite(gain) ? gain : 1);
  
      const dur = Math.max(0.02, Number.isFinite(playSec) ? playSec : 0.34);
      const fade = Math.min(Math.max(0.01, Number.isFinite(fadeOutSec) ? fadeOutSec : 0.06), dur * 0.8);
      const fadeIn = 0.02;
      const endAt = whenSec + dur;
      const fadeStart = Math.max(whenSec + 0.02, endAt - fade);
  
      g.gain.value = 0;
      g.gain.setValueAtTime(0, 0);
      g.gain.setValueAtTime(0, whenSec);
      g.gain.linearRampToValueAtTime(safeGain, whenSec + fadeIn);
      g.gain.setValueAtTime(safeGain, fadeStart);
      g.gain.linearRampToValueAtTime(0, endAt);
  
      src.connect(g);
      g.connect(masterGain);
      trackVoice(src, g, whenSec);
  
      try { src.start(whenSec, 0, dur); } catch { src.start(whenSec); src.stop(endAt); }
      return src;
    }
  
    function pitchFromPcOct(pc, oct) { return (oct * 12) + pc; }
    function pcFromPitch(p) { return ((p % 12) + 12) % 12; }
    function octFromPitch(p) { return Math.floor(p / 12); }
    function getStemForPc(pc) { return PC_TO_STEM[(pc + 12) % 12] || null; }
  
    function pitchToFrequency(pitch) {
      const A4 = pitchFromPcOct(9, 4);
      return 440 * Math.pow(2, (pitch - A4) / 12);
    }
  
    function playSynthToneWindowed(pitch, whenSec, playSec, fadeOutSec, gain = 0.65) {
      const ctx = ensureAudioGraph();
      if (!ctx || !masterGain) return null;
  
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(pitchToFrequency(pitch), whenSec);
  
      const g = ctx.createGain();
      const safeGain = Math.max(0, Number.isFinite(gain) ? gain : 0.65);
      const fadeIn = 0.01;
      const endAt = whenSec + Math.max(0.05, playSec);
  
      g.gain.setValueAtTime(0, whenSec);
      g.gain.linearRampToValueAtTime(safeGain, whenSec + fadeIn);
  
      const fade = Math.max(0.015, Number.isFinite(fadeOutSec) ? fadeOutSec : 0.06);
      const fadeStart = Math.max(whenSec + 0.02, endAt - fade);
      g.gain.setValueAtTime(safeGain, fadeStart);
      g.gain.linearRampToValueAtTime(0, endAt);
  
      osc.connect(g);
      g.connect(masterGain);
  
      trackVoice(osc, g, whenSec);
      osc.start(whenSec);
      osc.stop(endAt + 0.03);
      return osc;
    }
  
    function maybeWarnSynthFallback(missingUrl) {
      if (synthFallbackWarned) return;
      synthFallbackWarned = true;
      console.warn("Audio sample missing; using synthesized tones instead:", missingUrl);
      setFeedback(`Audio samples not found; using synthesized tones.<br/><small>Missing: <code>${missingUrl}</code></small>`);
    }
  
    async function loadPitchBuffer(pitch) {
      const pc = pcFromPitch(pitch);
      const oct = octFromPitch(pitch);
      const stem = getStemForPc(pc);
      if (!stem) return { missingUrl: "(unknown)", buffer: null, pitch };
      const url = noteUrl(stem, oct);
      const buf = await loadBuffer(url);
      if (!buf) return { missingUrl: url, buffer: null, pitch };
      return { missingUrl: null, buffer: buf, pitch };
    }
  
    async function playPitch(pitch, gain = 1) {
      await resumeAudioIfNeeded();
      const ctx = ensureAudioGraph();
      if (!ctx) return;
  
      stopAllNotesWithUi(0.06);
  
      const { missingUrl, buffer } = await loadPitchBuffer(pitch);
      const when = ctx.currentTime + 0.03; 
      if (!buffer) {
        maybeWarnSynthFallback(missingUrl);
        playSynthToneWindowed(pitch, when, 0.85, 0.08, 0.7);
        return;
      }
      playBufferAt(buffer, when, gain);
    }
  
    function stopAllUiSounds() {
      for (const a of Array.from(activeUiAudios)) {
        try { a.pause(); a.currentTime = 0; } catch {}
        activeUiAudios.delete(a);
      }
    }
  
    async function playUiSound(filename) {
      try {
        const url = `${AUDIO_DIR}/${filename}`;
        const buffer = await loadBuffer(url);
        if (!buffer) return;
        const ctx = ensureAudioGraph();
        if (!ctx) return;
        
        await resumeAudioIfNeeded();

        const when = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const g = ctx.createGain();
        g.gain.setValueAtTime(2.0, when);
  
        src.connect(g);
        g.connect(masterGain);
        trackVoice(src, g, when);
        src.start(when);
      } catch (e) { console.error("UI Sound error:", e); }
    }
  
    const SVG_NS = "http://www.w3.org/2000/svg";
    function el(tag, attrs = {}, children = []) {
      const n = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
      for (const c of children) n.appendChild(c);
      return n;
    }

    function buildInteractiveKeyboard(container, activePcs, onClick, isSelector = false) {
      container.innerHTML = "";
      const WHITE_W = 40;
      const WHITE_H = 140;
      const BLACK_W = 26;
      const BLACK_H = 90;
      const BORDER = 4;

      const whitePcs = [0, 2, 4, 5, 7, 9, 11];
      const blackPcs = [1, 3, 6, 8, 10];
      
      const outerW = whitePcs.length * WHITE_W + BORDER * 2;
      const outerH = WHITE_H + BORDER * 2;

      const s = el("svg", {
        width: "100%",
        height: "100%",
        viewBox: `0 0 ${outerW} ${outerH}`,
        style: "max-width: 100%; display: block; margin: 0 auto; overflow: visible;",
        role: "img"
      });

      if (isSelector) s.classList.add("is-selector");

      const style = el("style");
      style.textContent = `
        .int-w rect { fill: #ffffff; stroke: #cbd5e1; stroke-width: 2; transition: fill 0.1s; cursor: pointer; }
        .int-w:active rect { fill: #e2e8f0; }
        .int-b rect { fill: #0f172a; stroke: #000000; stroke-width: 2; transition: fill 0.1s; cursor: pointer; }
        .int-b:active rect { fill: #1e293b; }
        
        .int-key.is-disabled rect { fill: #94a3b8 !important; stroke: #64748b !important; }
        .int-key.int-b.is-disabled rect { fill: #334155 !important; stroke: #1e293b !important; }
        .int-key.is-disabled text { opacity: 0.3; }
        
        .is-selector .int-key.is-disabled rect { cursor: pointer; animation: none !important; }
        .int-key.is-disabled rect { cursor: not-allowed; }
        
        .int-key.chosen rect { stroke: #3b82f6; stroke-width: 4; }
        .int-key.correct rect { fill: #10b981 !important; stroke: #047857 !important; stroke-width: 3; }
        .int-key.correct text { fill: #ffffff !important; }
        
        .int-key.incorrect rect { fill: #ef4444 !important; stroke: #b91c1c !important; stroke-width: 3; }
        .int-key.incorrect text { fill: #ffffff !important; }
        
        .int-w text { font-family: var(--font-main, sans-serif); font-size: 13px; fill: #334155; pointer-events: none; font-weight: 900; }
        .int-b text { font-family: var(--font-main, sans-serif); font-size: 11px; fill: #ffffff; pointer-events: none; font-weight: 900; }
      `;
      s.appendChild(style);

      const gW = el("g");
      const gB = el("g");
      s.appendChild(gW);
      s.appendChild(gB);

      let wIdx = 0;
      const xPosByPc = {};

      for (let pc = 0; pc < 12; pc++) {
        const isBlack = blackPcs.includes(pc);
        if (!isBlack) {
          const x = BORDER + wIdx * WHITE_W;
          xPosByPc[pc] = x;
          const grp = el("g", { class: `int-key int-w`, "data-pc": pc });
          grp.appendChild(el("rect", { x, y: BORDER, width: WHITE_W, height: WHITE_H, rx: 6, ry: 6 }));
          
          const txt = el("text", { x: x + WHITE_W / 2, y: BORDER + WHITE_H - 14, "text-anchor": "middle" });
          txt.textContent = CHROMATIC_NAMES[pc];
          grp.appendChild(txt);
          
          if (!activePcs.includes(pc)) grp.classList.add("is-disabled");
          grp.addEventListener("click", () => onClick(grp, pc));
          
          gW.appendChild(grp);
          wIdx++;
        }
      }

      for (let pc = 0; pc < 12; pc++) {
        if (blackPcs.includes(pc)) {
          const leftPc = pc - 1; 
          const leftX = xPosByPc[leftPc];
          const x = leftX + WHITE_W - BLACK_W / 2;
          
          const grp = el("g", { class: `int-key int-b`, "data-pc": pc });
          grp.appendChild(el("rect", { x, y: BORDER, width: BLACK_W, height: BLACK_H, rx: 4, ry: 4 }));
          
          const parts = CHROMATIC_NAMES[pc].split("/");
          if (parts.length === 2) {
            const txtTop = el("text", { x: x + BLACK_W / 2, y: BORDER + BLACK_H - 24, "text-anchor": "middle" });
            txtTop.textContent = parts[0];
            grp.appendChild(txtTop);

            const txtBot = el("text", { x: x + BLACK_W / 2, y: BORDER + BLACK_H - 10, "text-anchor": "middle" });
            txtBot.textContent = parts[1];
            grp.appendChild(txtBot);
          } else {
            const txt = el("text", { x: x + BLACK_W / 2, y: BORDER + BLACK_H - 12, "text-anchor": "middle" });
            txt.textContent = parts[0];
            grp.appendChild(txt);
          }
          
          if (!activePcs.includes(pc)) grp.classList.add("is-disabled");
          grp.addEventListener("click", () => onClick(grp, pc));
          
          gB.appendChild(grp);
        }
      }

      container.appendChild(s);
    }
  
    // ---------------- state ----------------
    const score = { correct: 0, incorrect: 0, lastWasCorrect: null, perNote: {} };
  
    const state = {
      started: false,
      awaitingNext: false,
      target: null, // { pitch, pc, name }
      rangeMode: "one",
      activePcs: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      inputMode: "keyboard"
    };

    let introActivePcs = [];
    let settingsActivePcs = [];
  
    // ---------------- UI helpers ----------------
    function setPulseSyncDelay(el) {
      if (!(el instanceof HTMLElement)) return;
      const nowSec = (performance.now ? performance.now() : Date.now()) / 1000;
      el.style.setProperty("--pulseSyncDelay", `${-nowSec}s`);
    }
  
    function setSyncedClass(el, className, on) {
      const had = el.classList.contains(className);
      el.classList.toggle(className, !!on);
      if (on && !had) setPulseSyncDelay(el);
    }
  
    function parseCssTimeToSec(v, fallbackSec) {
      const s = String(v || "").trim();
      if (!s) return fallbackSec;
      const ms = s.match(/^(-?\d+(?:\.\d+)?)ms$/i);
      if (ms) return Number(ms[1]) / 1000;
      const sec = s.match(/^(-?\d+(?:\.\d+)?)s$/i);
      if (sec) return Number(sec[1]);
      const n = Number(s);
      return Number.isFinite(n) ? n : fallbackSec;
    }
  
    function getCssTimeSec(varName, fallbackSec) {
      try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(varName);
        const n = parseCssTimeToSec(v, fallbackSec);
        return Number.isFinite(n) ? n : fallbackSec;
      } catch { return fallbackSec; }
    }
  
    function getRefFadeOutSec() { return Math.max(0.01, getCssTimeSec("--refNoteFadeOut", 0.06)); }
    function setFeedback(html) { feedbackOut.innerHTML = html || ""; }
    function setPhase(title) { phaseTitle.textContent = title || ""; }
    function scoreTotal() { return score.correct + score.incorrect; }
  
    function scoreAccuracy() {
      const t = scoreTotal();
      if (!t) return 0;
      return (score.correct / t) * 100;
    }
  
    function renderScorePills() {
      const c = score.correct;
      const i = score.incorrect;
      const tot = c + i;
      const accStr = `${scoreAccuracy().toFixed(1)}%`;

      correctOut.textContent = String(c);
      incorrectOut.textContent = String(i);
      totalOut.textContent = String(tot);
      accuracyOut.textContent = accStr;

      if (modalCorrectOut) modalCorrectOut.textContent = String(c);
      if (modalIncorrectOut) modalIncorrectOut.textContent = String(i);
      if (modalTotalOut) modalTotalOut.textContent = String(tot);
      if (modalAccuracyOut) modalAccuracyOut.textContent = accStr;

      perNoteOut.innerHTML = "";
      if (modalPerNoteOut) modalPerNoteOut.innerHTML = "";

      const activeNames = state.activePcs.map(pc => CHROMATIC_NAMES[pc]);
      for (const name of activeNames) {
        const st = score.perNote[name] || { asked: 0, correct: 0 };
        const txt = `${name}: ${st.correct}/${st.asked}`;

        const el = document.createElement("div");
        el.className = "perNoteItem";
        el.textContent = txt;
        perNoteOut.appendChild(el);

        if (modalPerNoteOut) {
          const mel = document.createElement("div");
          mel.className = "perNoteItem";
          mel.textContent = txt;
          modalPerNoteOut.appendChild(mel);
        }
      }
    }
  
    function drawRoundRect(ctx, x, y, w, h, r) {
      const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }
  
    async function downloadScorecardPng(nameInputEl) {
      const LAYOUT = {
        gapAfterImage: 32,           
        gapAfterUrl: 36,             
        gapAfterTitle: 30,           
        gapAfterMeta: 28,            
        gapAfterName: 22,            
        gapNoNameCompensation: 12,   
        mainGridRowGap: 14,          
        gapBeforePerNoteTitle: 32,   
        gapAfterPerNoteTitle: 26,    
        perNoteGridRowGap: 14,       
      };

      const range = rangeLabel(state.rangeMode);
      const limitStr = `${state.activePcs.length} Notes`;
      const name = safeText(nameInputEl?.value);
      if (nameInputEl) saveName(name);
  
      const correct = score.correct;
      const incorrect = score.incorrect;
      const total = scoreTotal();
      const accuracy = `${scoreAccuracy().toFixed(1)}%`;
  
      const activeNames = state.activePcs.map(pc => CHROMATIC_NAMES[pc]);
      const rowsNeeded = Math.ceil(activeNames.length / 2);
      const W = 720;
      const H = 720 + (rowsNeeded * 56); 
      const dpr = Math.max(1, Math.floor((window.devicePixelRatio || 1) * 100) / 100);
  
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
  
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
  
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
  
      const pad = 34;
      const cardX = pad;
      const cardY = pad;
      const cardW = W - pad * 2;
      const cardH = H - pad * 2;
  
      ctx.fillStyle = "#f8fafc";
      drawRoundRect(ctx, cardX, cardY, cardW, cardH, 24);
      ctx.fill();
  
      ctx.strokeStyle = "rgba(0,0,0,0.1)";
      ctx.lineWidth = 1;
      drawRoundRect(ctx, cardX, cardY, cardW, cardH, 24);
      ctx.stroke();
  
      const titleSrc = "../../images/titlelight.png";      const titleImg = await loadImage(titleSrc);
  
      let yCursor = cardY + 26;
  
      if (titleImg) {
        const imgMaxW = Math.min(520, cardW - 40);
        const imgMaxH = 92;
        drawImageContain(ctx, titleImg, (W - imgMaxW) / 2, yCursor, imgMaxW, imgMaxH);
        yCursor += imgMaxH + LAYOUT.gapAfterImage;
      }

      ctx.fillStyle = "rgba(15,23,42)";
      ctx.font = "800 22px Inter, Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Relative Pitch Game - Chromatic", W / 2, yCursor);
      yCursor += LAYOUT.gapAfterUrl;
  
      ctx.fillStyle = "#0f172a";
      ctx.textAlign = "center";
      ctx.font = "700 22px Inter, Arial, Helvetica, sans-serif";
      ctx.fillText("Score Card", W / 2, yCursor);
      yCursor += LAYOUT.gapAfterTitle;
  
      ctx.font = "800 18px Inter, Arial, Helvetica, sans-serif";
      ctx.fillStyle = "rgba(15,23,42,0.70)";
      const metaLine = `Range: ${range}   •   Notes: ${limitStr}`;
      ctx.fillText(metaLine, W / 2, yCursor);
      yCursor += LAYOUT.gapAfterMeta;
  
      if (name) {
        ctx.fillText(`Name: ${name}`, W / 2, yCursor);
        yCursor += LAYOUT.gapAfterName;
      } else {
        yCursor += LAYOUT.gapNoNameCompensation; 
      }
  
      ctx.fillStyle = "#0f172a";
      ctx.textAlign = "left";
  
      const rowX = cardX + 26;
      const rowW = cardW - 52;
      const rowH = 58;
      
      const rows = [
        ["Correct", String(correct)],
        ["Incorrect", String(incorrect)],
        ["Total Questions Asked", String(total)],
        ["Percentage Correct", accuracy],
      ];
  
      for (const [k, v] of rows) {
        ctx.fillStyle = "#ffffff";
        drawRoundRect(ctx, rowX, yCursor, rowW, rowH, 14);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.08)";
        ctx.stroke();
  
        ctx.fillStyle = "rgba(15,23,42,0.70)";
        ctx.font = "900 18px Inter, Arial, Helvetica, sans-serif";
        ctx.fillText(k, rowX + 16, yCursor + 33);
  
        ctx.fillStyle = "#0f172a";
        ctx.font = "900 22px Inter, Arial, Helvetica, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(v, rowX + rowW - 16, yCursor + 37);
        ctx.textAlign = "left";
  
        yCursor += rowH + LAYOUT.mainGridRowGap;
      }

      yCursor += (LAYOUT.gapBeforePerNoteTitle - LAYOUT.mainGridRowGap); 
      
      ctx.textAlign = "center";
      ctx.font = "800 16px Inter, Arial, Helvetica, sans-serif";
      ctx.fillStyle = "rgba(15,23,42,0.6)";
      ctx.fillText("Per Note Statistics", W / 2, yCursor);
      yCursor += LAYOUT.gapAfterPerNoteTitle;

      const cols = 2;
      const itemW = (rowW - LAYOUT.perNoteGridRowGap) / 2;
      const itemH = 42;
      let currentX = rowX;

      ctx.textAlign = "left";
      for (let i = 0; i < activeNames.length; i++) {
        const name = activeNames[i];
        const st = score.perNote[name] || {asked: 0, correct: 0};
        const pct = st.asked > 0 ? Math.round((st.correct / st.asked) * 100) : 0;
        const textLeft = `${name}: ${st.correct}/${st.asked}`;
        const textRight = `${pct}%`;

        ctx.fillStyle = "#ffffff";
        drawRoundRect(ctx, currentX, yCursor, itemW, itemH, 10);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.08)";
        ctx.stroke();

        ctx.fillStyle = "rgba(15,23,42,0.8)";
        ctx.font = "800 16px Inter, Arial, Helvetica, sans-serif";
        ctx.fillText(textLeft, currentX + 16, yCursor + 26);

        ctx.fillStyle = "#0f172a";
        ctx.font = "900 16px Inter, Arial, Helvetica, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(textRight, currentX + itemW - 16, yCursor + 26);
        ctx.textAlign = "left";

        if ((i + 1) % cols === 0) {
          currentX = rowX;
          yCursor += itemH + LAYOUT.perNoteGridRowGap;
        } else {
          currentX += itemW + LAYOUT.perNoteGridRowGap;
        }
      }
  
      ctx.textAlign = "center";
      ctx.font = "800 14px Inter, Arial, Helvetica, sans-serif";
      ctx.fillStyle = "rgba(15,23,42,0.45)";
      ctx.fillText("Identifying Chromatic Notes - www.eartraininglab.com", W / 2, cardY + cardH - 24);
  
      const fileBase = name ? `${sanitizeFilenamePart(name)}_scorecard` : "scorecard";
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fileBase}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, "image/png");
    }
  
    function setAnswerButtonsEnabled(enabled) {
      if (state.inputMode === "buttons") {
        answerButtons.querySelectorAll("button").forEach((b) => (b.disabled = !enabled));
      } else {
        answerKeyboard.classList.toggle("locked", !enabled);
      }
    }
  
    function clearAnswerButtonStates() {
      const els = state.inputMode === "buttons" 
        ? answerButtons.querySelectorAll("button") 
        : answerKeyboard.querySelectorAll(".int-key");

      els.forEach((el) => {
        el.classList.remove("correct", "incorrect", "chosen");
        if (state.inputMode === "buttons") el.setAttribute("aria-pressed", "false");
      });
    }
  
    function updateControls() {
      const canReplay = state.started && !!state.target;
      replayBtn.disabled = !canReplay;
      setSyncedClass(replayBtn, "pulse", canReplay);
  
      refTonicBtn.disabled = !state.started;
  
      const canNext = state.started && state.awaitingNext;
      nextBtn.disabled = !canNext;
      setSyncedClass(nextBtn, "nextReady", canNext);
  
      beginBtn.textContent = state.started ? "End/Restart Game" : "Begin Game";
      setSyncedClass(beginBtn, "pulse", !state.started);
      beginBtn.classList.toggle("primary", true);
  
      setAnswerButtonsEnabled(state.started && !state.awaitingNext && !!state.target);
    }
  
    function getAppliedRangeValue() { return String(state.rangeMode); }
    function getAppliedInputValue() { return String(state.inputMode); }
    
    function isSettingsDirty() {
      const p1 = [...state.activePcs].sort().join(",");
      const p2 = [...settingsActivePcs].sort().join(",");
      
      return String(settingsRangeSelect.value) !== getAppliedRangeValue()
          || p1 !== p2
          || String(settingsInputSelect.value) !== getAppliedInputValue();
    }
    
    function updateSettingsDirtyUi() {
      const dirty = isSettingsDirty();
      settingsRestartBtn.disabled = !dirty;
    }
  
    function renderAnswerInputs() {
      answerButtons.innerHTML = "";
      answerKeyboard.innerHTML = "";

      if (state.inputMode === "buttons") {
        answerButtons.classList.remove("hidden");
        answerKeyboard.classList.add("hidden");

        for (let i = 0; i < 12; i++) {
            if (state.activePcs.includes(i)) {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "noteBtn";
                btn.dataset.pc = String(i);
                btn.setAttribute("aria-pressed", "false");
                btn.innerHTML = `<span class="note">${CHROMATIC_NAMES[i]}</span>`;
                btn.addEventListener("click", () => onAnswerClick(btn, i));
                answerButtons.appendChild(btn);
            }
        }
      } else {
        answerButtons.classList.add("hidden");
        answerKeyboard.classList.remove("hidden");
        buildInteractiveKeyboard(answerKeyboard, state.activePcs, onAnswerClick, false);
      }
    }

    // ---------------- progress saving ----------------
  function saveRoundData() {
    const total = scoreTotal();
    if (total < 5) return; // Floor minimum of 5 questions enforced

    const result = {
      id: Date.now().toString() + Math.floor(Math.random() * 1000),
      gameId: "chromatic",
      gameName: "Relative Pitch: Chromatic",
      timestamp: Date.now(),
      date: new Date().toISOString(),
      correct: score.correct,
      incorrect: score.incorrect,
      total: total,
      accuracy: parseFloat(scoreAccuracy().toFixed(1)),
      meta: `Range: ${rangeLabel(state.rangeMode)} • Notes: ${state.activePcs.length}`
    };

    try {
      const existing = JSON.parse(localStorage.getItem("et_game_results")) || [];
      existing.push(result);
      localStorage.setItem("et_game_results", JSON.stringify(existing));
    } catch (e) {
      console.error("Failed to save progress", e);
    }
  }
  
    // ---------------- game flow ----------------
    function randomInt(min, max) {
      const a = Math.ceil(min);
      const b = Math.floor(max);
      return Math.floor(Math.random() * (b - a + 1)) + a;
    }
  
    function pickRandomTargetPitch() {
      const idx = randomInt(0, state.activePcs.length - 1);
      const pc = state.activePcs[idx];
      let oct;
      
      if (state.rangeMode === "multi") {
        let availableOctaves = [2, 3, 4, 5];
        if (pc === 0) availableOctaves.push(6); 
        oct = availableOctaves[randomInt(0, availableOctaves.length - 1)];
      } else {
        oct = 4; 
      }
      
      return { pitch: oct * 12 + pc, pc, name: CHROMATIC_NAMES[pc] };
    }
  
    async function startRound({ autoplay = true } = {}) {
      if (!state.started) return;
  
      clearAnswerButtonStates();
      state.awaitingNext = false;
  
      const t = pickRandomTargetPitch();
      state.target = t;

      if (score.perNote[state.target.name]) {
        score.perNote[state.target.name].asked += 1;
      }
  
      setPhase("Identify the pitch");
      setFeedback("Which note was that? 🔉");
      
      updateControls();
      await new Promise(requestAnimationFrame);
  
      if (autoplay) await playPitch(state.target.pitch, 1);
    }
  
    function resetScore() {
      score.correct = 0;
      score.incorrect = 0;
      score.lastWasCorrect = null;
      score.perNote = {};
      
      const activeNames = state.activePcs.map(pc => CHROMATIC_NAMES[pc]);
      for (const name of activeNames) {
        score.perNote[name] = { asked: 0, correct: 0 };
      }

      renderScorePills();
    }
  
    async function startGame() {
      stopAllNotesWithUi(0.06);
      stopAllUiSounds();

      renderAnswerInputs();
      resetScore();
      
      state.started = true;
      state.awaitingNext = false;
      state.target = null;
  
      updateControls();
      updateScoreMeta();
      await startRound({ autoplay: true });
    }
  
    function returnToStartScreen({ openIntro = false } = {}) {
      stopAllNotesWithUi(0.06);
      stopAllUiSounds();
  
      state.started = false;
      state.awaitingNext = false;
      state.target = null;
  
      clearAnswerButtonStates();
      resetScore();
      setPhase("Ready");
  
      if (openIntro) {
        openModal(introModal);
        refreshIntroSelector();
        try { introBeginBtn.focus(); } catch {}
      }
      setFeedback("Press <strong>Begin Game</strong> to start.");
      
      updateControls();
    }
  
    async function onAnswerClick(element, clickedPc) {
      if (!state.activePcs.includes(clickedPc)) return; 
      if (!state.started || state.awaitingNext || !state.target) return;
    
      clearAnswerButtonStates();
      element.classList.add("chosen");
      if (state.inputMode === "buttons") element.setAttribute("aria-pressed", "true");
    
      const isCorrect = clickedPc === state.target.pc;
  
      const fadeOutSec = getRefFadeOutSec();
      stopAllNotesWithUi(fadeOutSec);
      stopAllUiSounds();
  
      if (isCorrect) {
        setTimeout(() => playUiSound(UI_SND_CORRECT), 20);      
      } else {
        playUiSound(UI_SND_INCORRECT);
      }
    
      score.lastWasCorrect = isCorrect;
      if (isCorrect) {
        score.correct += 1;
        if (score.perNote[state.target.name]) {
          score.perNote[state.target.name].correct += 1;
        }
      } else {
        score.incorrect += 1;
      }
    
      renderScorePills();
    
      if (isCorrect) {
        element.classList.add("correct");
        setFeedback(`✅ Correct - nice one! That note was <strong>${state.target.name}</strong>.`);
      } else {
        element.classList.add("incorrect");
        
        const correctEl = state.inputMode === "buttons" 
            ? answerButtons.querySelector(`button[data-pc="${state.target.pc}"]`)
            : answerKeyboard.querySelector(`.int-key[data-pc="${state.target.pc}"]`);
        
        if (correctEl) correctEl.classList.add("correct");
        setFeedback(`❌ Uh oh! That note was actually <strong>${state.target.name}</strong>.`);
      }
    
      state.awaitingNext = true;
      updateControls();
    }
  
    async function replayTarget() {
      if (!state.started || !state.target) return;
      await playPitch(state.target.pitch, 1);
    }
  
    function stopAllNotesWithUi(fadeSec = 0.05) {
      stopAllNotes(fadeSec);
    }
  
    async function playC4Reference() {
      await resumeAudioIfNeeded();
      const ctx = ensureAudioGraph();
      if (!ctx) return;
  
      const fadeOutSec = getRefFadeOutSec();
      const noteSec = 7;
  
      stopAllNotesWithUi(fadeOutSec);
  
      const pitch = pitchFromPcOct(0, 4); // C4
      const when = ctx.currentTime + 0.03;
  
      const { missingUrl, buffer } = await loadPitchBuffer(pitch);
      if (!buffer) {
        maybeWarnSynthFallback(missingUrl);
        playSynthToneWindowed(pitch, when, noteSec, fadeOutSec, 0.7);
        return;
      }
      playBufferWindowed(buffer, when, noteSec, fadeOutSec, 0.95);
    }
  
    // ---------------- modals ----------------
    let lastFocusEl = null;
  
    function openModal(modalEl) {
      lastFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      modalEl.classList.remove("hidden");
      postHeightNow();
    }
  
    function closeModal(modalEl) {
      modalEl.classList.add("hidden");
      postHeightNow();
      if (lastFocusEl) {
        try { lastFocusEl.focus(); } catch {}
      }
    }
  
    function isVisible(modalEl) { return !modalEl.classList.contains("hidden"); }
    function loadInitialRange() { return "one"; }
    function loadInitialInput() {
      const saved = localStorage.getItem(LS_KEY_INPUT);
      return saved ? String(saved) : "keyboard"; 
    }
    
    function loadInitialPcs() {
      const saved = localStorage.getItem(LS_KEY_ACTIVE_PCS);
      if (saved) {
        try { 
            const arr = JSON.parse(saved);
            if (Array.isArray(arr) && arr.length >= 2) return arr;
        } catch {}
      }
      const legacy = localStorage.getItem("et_chromatic_notes");
      if (legacy) {
        const count = parseInt(legacy);
        if (count >= 2 && count <= 12) {
           return Array.from({length: count}, (_, i) => i);
        }
      }
      return [0,1,2,3,4,5,6,7,8,9,10,11];
    }
  
    function loadInitialName() {
      const saved = localStorage.getItem(LS_KEY_NAME);
      const v = String(saved || "").trim();
      return v.slice(0, 32);
    }
  
    function saveName(name) { try { localStorage.setItem(LS_KEY_NAME, String(name || "").trim().slice(0, 32)); } catch {} }
    function saveRange(mode) { try { localStorage.setItem(LS_KEY_RANGE, mode); } catch {} }
    function savePcs(pcs) { try { localStorage.setItem(LS_KEY_ACTIVE_PCS, JSON.stringify(pcs)); } catch {} }
    function saveInput(mode) { try { localStorage.setItem(LS_KEY_INPUT, mode); } catch {} }
  
    function sanitizeFilenamePart(s) {
      const v = String(s || "").trim().replace(/\s+/g, "_");
      const cleaned = v.replace(/[^a-zA-Z0-9_\-]+/g, "");
      return cleaned.slice(0, 32) || "";
    }
  
    async function loadImage(src) {
      return await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    }
  
    function drawImageContain(ctx, img, x, y, w, h) {
      const iw = img.naturalWidth || img.width || 1;
      const ih = img.naturalHeight || img.height || 1;
      const r = Math.min(w / iw, h / ih);
      const dw = Math.max(1, iw * r);
      const dh = Math.max(1, ih * r);
      const dx = x + (w - dw) / 2;
      const dy = y + (h - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
      return { w: dw, h: dh, x: dx, y: dy };
    }
  
    function safeText(s) { return String(s || "").replace(/[\u0000-\u001f\u007f]/g, "").trim(); }

    function syncNames(val) {
      if (playerNameInput && playerNameInput.value !== val) playerNameInput.value = val;
      if (modalPlayerNameInput && modalPlayerNameInput.value !== val) modalPlayerNameInput.value = val;
    }
    if (playerNameInput) playerNameInput.addEventListener("input", (e) => syncNames(e.target.value));
    if (modalPlayerNameInput) modalPlayerNameInput.addEventListener("input", (e) => syncNames(e.target.value));
  
    // ---------------- events ----------------

    function forceNavigateHome() {
      stopAllNotesWithUi(0.06);
      stopAllUiSounds(); 
      sessionStorage.setItem("et_play_back_sound", "true");
      window.location.href = "../../index.html";
    }

    function navigateHome() {
      // Intercept Home button click if a game is active and score has been accumulated
      if (state.started && scoreTotal() > 0) {
        playUiSound(UI_SND_SELECT);
        openModal(leaveModal);
      } else {
        forceNavigateHome();
      }
    }
    
    if (homeBtn) homeBtn.addEventListener("click", navigateHome);
    if (introHomeBtn) introHomeBtn.addEventListener("click", navigateHome);

    // Leave Modal Listeners
    if (leaveCancelBtn) {
      leaveCancelBtn.addEventListener("click", () => {
        playUiSound(UI_SND_BACK);
        closeModal(leaveModal);
      });
    }

    if (leaveDiscardBtn) {
      leaveDiscardBtn.addEventListener("click", () => {
        playUiSound(UI_SND_SELECT);
        forceNavigateHome();
      });
    }

    if (leaveSaveBtn) {
      leaveSaveBtn.addEventListener("click", () => {
        playUiSound(UI_SND_SELECT);
        closeModal(leaveModal);
        saveRoundData(); 
        
        showScoreModal(() => {
          forceNavigateHome();
        });
      });
    }

    let scoreModalContinueCallback = null;

    function showScoreModal(onContinue) {
      scoreModalContinueCallback = onContinue;
      openModal(scoreModal);
      try { scoreModalContinueBtn.focus(); } catch {}
    }

    scoreModalContinueBtn.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      closeModal(scoreModal);
      if (scoreModalContinueCallback) scoreModalContinueCallback();
    });

    beginBtn.addEventListener("click", async () => {
      if (!state.started) {
        if (introModal && !introModal.classList.contains("hidden")) closeModal(introModal);
        await startGame();
        return;
      }
      
      saveRoundData();
  
      showScoreModal(() => {
        returnToStartScreen({ openIntro: true });
      });
    });
  
    replayBtn.addEventListener("click", async () => { await replayTarget(); });
  
    nextBtn.addEventListener("click", async () => {
      if (!state.started || !state.awaitingNext) return;
      const fadeOutSec = getRefFadeOutSec(); 
      stopAllNotesWithUi(fadeOutSec);        
      stopAllUiSounds(); 
      await startRound({ autoplay: true });
    });
  
    refTonicBtn.addEventListener("click", async () => { await playC4Reference(); });
  
    downloadScorecardBtn.addEventListener("click", async () => {
      playUiSound(UI_SND_SELECT);
      await downloadScorecardPng(playerNameInput);
    });

    modalDownloadScorecardBtn.addEventListener("click", async () => {
      playUiSound(UI_SND_SELECT);
      await downloadScorecardPng(modalPlayerNameInput);
    });
  
    // ---------------- settings selects (<select>) ----------------
  
    function populateSelect(sel, options) {
      if (!sel) return;
      sel.innerHTML = "";
      for (const opt of options) {
        const o = document.createElement("option");
        o.value = opt.key;
        o.textContent = opt.label;
        sel.appendChild(o);
      }
    }
  
    function rangeLabel(mode) {
      const m = mode === "multi" ? "multi" : "one";
      const label = RANGE_OPTIONS.find((r) => r.key === m)?.label || (m === "multi" ? "Multiple Octaves" : "One Octave");
      return label.replace(/^Range:\s*/, "");
    }
  
    function updateScoreMeta() {
      const limitStr = `${state.activePcs.length} Notes`;
      if (scoreMeta) scoreMeta.textContent = `Range: ${rangeLabel(state.rangeMode)} • Notes: ${limitStr}`;
      if (modalScoreMeta) modalScoreMeta.textContent = `Range: ${rangeLabel(state.rangeMode)} • Notes: ${limitStr}`;
    }
  
    function updateSettingsSelectUi() {
      if (settingsRangeSelect) settingsRangeSelect.value = state.rangeMode;
      if (settingsInputSelect) settingsInputSelect.value = state.inputMode;
      updateScoreMeta();
    }
  
    function applyRangeMode(mode) { state.rangeMode = mode === "multi" ? "multi" : "one"; }
    function applyInputMode(mode) { state.inputMode = mode === "keyboard" ? "keyboard" : "buttons"; }
  
    function refreshSettingsSelector() {
      buildInteractiveKeyboard(settingsNotesKeyboard, settingsActivePcs, (el, pc) => {
          const newPcs = [...settingsActivePcs];
          const idx = newPcs.indexOf(pc);
          if (idx > -1) {
              if (newPcs.length <= 2) return; 
              newPcs.splice(idx, 1);
          } else {
              newPcs.push(pc);
          }
          settingsActivePcs = newPcs;
          refreshSettingsSelector();
          updateSettingsDirtyUi();
      }, true);
    }

    function refreshIntroSelector() {
      buildInteractiveKeyboard(introNotesKeyboard, introActivePcs, (el, pc) => {
          const newPcs = [...introActivePcs];
          const idx = newPcs.indexOf(pc);
          if (idx > -1) {
              if (newPcs.length <= 2) return; 
              newPcs.splice(idx, 1);
          } else {
              newPcs.push(pc);
          }
          introActivePcs = newPcs;
          refreshIntroSelector();
      }, true);
    }

    function openSettingsModal() {
      stopAllNotesWithUi(getRefFadeOutSec());
      settingsActivePcs = [...state.activePcs];
      updateSettingsSelectUi();
      refreshSettingsSelector();
      openModal(settingsModal);
      updateSettingsDirtyUi();
      try { settingsRangeSelect.focus(); } catch {}
    }
  
    settingsRangeSelect.addEventListener("change", updateSettingsDirtyUi);
    settingsInputSelect.addEventListener("change", updateSettingsDirtyUi);
  
    settingsBtn.addEventListener("click", () => {
      stopAllUiSounds(); // Added
      playUiSound(UI_SND_SELECT);
      openSettingsModal();
    });
  
    settingsCancelBtn.addEventListener("click", () => {
      playUiSound(UI_SND_BACK);
      updateSettingsSelectUi();
      updateSettingsDirtyUi(); 
      closeModal(settingsModal);
    });
  
    settingsRestartBtn.addEventListener("click", () => {
      if (settingsRestartBtn.disabled) return;
      const newRange = String(settingsRangeSelect.value || "one");
      const newInput = String(settingsInputSelect.value || "buttons");
  
      closeModal(settingsModal);
      playUiSound(UI_SND_SELECT);

      saveRoundData();

      showScoreModal(() => {
        state.activePcs = [...settingsActivePcs];
        
        saveRange(newRange);
        savePcs(state.activePcs);
        saveInput(newInput);
    
        stopAllNotesWithUi(0.06);
        stopAllUiSounds();
    
        state.started = false;
        state.awaitingNext = false;
        state.target = null;
        
        applyRangeMode(newRange);
        applyInputMode(newInput);
        
        updateSettingsSelectUi();
        renderAnswerInputs();
        resetScore();
    
        setPhase("Ready");
        setFeedback("Press <strong>Begin Game</strong> to start.");
        updateControls();
        
        try { beginBtn.focus(); } catch {}
      });
    });
  
    // ---------------- intro modal ----------------
    function handleIntroContinue() {
      stopAllNotesWithUi(0.06);
      stopAllUiSounds(); // Added to stop intro audio immediately
      playUiSound(UI_SND_SELECT);
      
      const newRange = String(introRangeSelect.value || "one");
      const newInput = String(introInputSelect.value || "buttons");
      
      state.activePcs = [...introActivePcs];
  
      saveRange(newRange);
      savePcs(state.activePcs);
      saveInput(newInput);
  
      applyRangeMode(newRange);
      applyInputMode(newInput);
      
      updateSettingsSelectUi();
      renderAnswerInputs();
      resetScore();
  
      if (settingsRangeSelect) settingsRangeSelect.value = newRange;
      if (settingsInputSelect) settingsInputSelect.value = newInput;
  
      closeModal(introModal);
      setFeedback("Press <strong>Begin Game</strong> to start.");
      try { beginBtn.focus(); } catch {}
    }
  
    introBeginBtn.addEventListener("click", handleIntroContinue);
    introBeginBtnTop.addEventListener("click", handleIntroContinue);
  
    infoBtn.addEventListener("click", () => {
      stopAllUiSounds(); // Added
      stopAllNotesWithUi(getRefFadeOutSec());
      playUiSound(UI_SND_SELECT);
      openModal(infoModal);
      try { infoClose.focus(); } catch {}
    });
  
    infoClose.addEventListener("click", () => {
      playUiSound(UI_SND_BACK);
      closeModal(infoModal);
    });
  
    [infoModal, settingsModal, leaveModal].forEach((m) => {
      m.addEventListener("click", (e) => {
        if (e.target === m) {
          playUiSound(UI_SND_BACK);
          if (m === settingsModal) updateSettingsSelectUi();
          closeModal(m);
        }
      });
    });
  
    introModal.addEventListener("click", (e) => {
      if (e.target === introModal) {
        playUiSound(UI_SND_BACK);
      }
    });
  
    window.addEventListener("keydown", async (e) => {
      if (e.key === "Escape") {
        if (isVisible(settingsModal)) {
          playUiSound(UI_SND_BACK);
          updateSettingsSelectUi();
          closeModal(settingsModal);
          return;
        }
        if (isVisible(infoModal)) {
          playUiSound(UI_SND_BACK);
          closeModal(infoModal);
          return;
        }
        if (isVisible(leaveModal)) {
          playUiSound(UI_SND_BACK);
          closeModal(leaveModal);
          return;
        }
        return;
      }
  
      if (isVisible(settingsModal) || isVisible(infoModal) || isVisible(introModal) || isVisible(scoreModal) || isVisible(leaveModal)) return;
  
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        await replayTarget();
        return;
      }
  
      if (e.key === " " || e.code === "Space") {
        if (!nextBtn.disabled) {
          e.preventDefault();
          await startRound({ autoplay: true });
        }
      }
    });
  
    // ---------------- init ----------------
    function init() {
      // Load and apply theme from homepage settings
      const savedTheme = localStorage.getItem(LS_KEY_THEME) || "dark";
      applyTheme(savedTheme);

      // Play intro sound immediately
      playUiSound(UI_SND_PAGE);

      setPulseSyncDelay(beginBtn);
      setPulseSyncDelay(introBeginBtn);
      setPulseSyncDelay(introBeginBtnTop); 
  
      const initialName = loadInitialName();
      if (playerNameInput) playerNameInput.value = initialName;
      if (modalPlayerNameInput) modalPlayerNameInput.value = initialName;
  
      populateSelect(settingsRangeSelect, RANGE_OPTIONS);
      populateSelect(settingsInputSelect, INPUT_OPTIONS);
      
      populateSelect(introRangeSelect, RANGE_OPTIONS);
      populateSelect(introInputSelect, INPUT_OPTIONS);
  
      const initialRange = loadInitialRange();
      state.activePcs = loadInitialPcs();
      const initialInput = loadInitialInput();
      
      applyRangeMode(initialRange);
      applyInputMode(initialInput);
      
      updateSettingsSelectUi();
  
      if (introRangeSelect) introRangeSelect.value = initialRange;
      if (introInputSelect) introInputSelect.value = initialInput;
  
      renderAnswerInputs();
      renderScorePills();
      
      setPhase("Ready");
      setFeedback("Press <strong>Begin Game</strong> to start.");
      updateControls();
  
      introActivePcs = [...state.activePcs];
      refreshIntroSelector();
      
      openModal(introModal);
      try { introBeginBtn.focus(); } catch {}
    }
  
    init();
  })();