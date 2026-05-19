(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // --- Constants & Elements ---
  const LS_KEY_RESULTS = "et_game_results";
  const LS_KEY_THEME = "et_theme";

  // Views & Containers
  const overviewSection = $("overviewSection");
  const detailSection = $("detailSection");
  const overviewContainer = $("overviewContainer");
  const detailContainer = $("detailContainer");
  const emptyState = $("emptyState");

  // Global Overview Stats
  const statGamesPlayed = $("statGamesPlayed");
  const statGlobalAccuracy = $("statGlobalAccuracy");

  // Detail Stats
  const detailGameTitle = $("detailGameTitle");
  const detailAttempts = $("detailAttempts");
  const detailBest = $("detailBest");
  const detailAvg = $("detailAvg");
  const progressChart = $("progressChart");

  // Buttons
  const homeBtn = $("homeBtn");
  const resetDataBtn = $("resetDataBtn");
  const backToOverviewBtn = $("backToOverviewBtn");

  // Modals & Sort Controls
  const sortOverviewBtn = $("sortOverviewBtn");
  const sortDetailBtn = $("sortDetailBtn");
  const sortOverviewModal = $("sortOverviewModal");
  const sortDetailModal = $("sortDetailModal");
  const resetModal = $("resetModal");
  
  const closeSortOverviewBtn = $("closeSortOverviewBtn");
  const closeSortDetailBtn = $("closeSortDetailBtn");
  const cancelResetBtn = $("cancelResetBtn");
  const confirmResetBtn = $("confirmResetBtn");

  // State Data
  let allResults = [];
  let groupedResults = {};
  let currentDetailGameId = null; 

  // --- Theme Loading ---
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

  // --- Navigation & Audio ---
  function playUiSound(filename) {
    const snd = new Audio("../audio/" + filename);
    snd.play().catch(e => console.log("Audio block", e));
  }

  homeBtn.addEventListener("click", () => {
    sessionStorage.setItem("et_play_back_sound", "true");
    window.location.href = "../index.html";
  });

  backToOverviewBtn.addEventListener("click", () => {
    playUiSound("back1.mp3");
    currentDetailGameId = null;
    detailSection.classList.add("hidden");
    overviewSection.classList.remove("hidden");
    renderOverview();
  });

  // --- Data Loading & Processing ---
  function loadData() {
    try {
      const data = localStorage.getItem(LS_KEY_RESULTS);
      allResults = data ? JSON.parse(data) : [];
    } catch (e) {
      allResults = [];
    }
    
    // Group results by Game ID to support dynamic scaling of future games
    groupedResults = {};
    allResults.forEach(r => {
      const gId = r.gameId || "unknown";
      if (!groupedResults[gId]) {
        groupedResults[gId] = {
          gameId: gId,
          gameName: r.gameName || "Unknown Game",
          attempts: []
        };
      }
      groupedResults[gId].attempts.push(r);
    });

    if (allResults.length === 0) {
      overviewSection.classList.add("hidden");
      detailSection.classList.add("hidden");
      emptyState.classList.remove("hidden");
    } else {
      emptyState.classList.add("hidden");
      renderOverview();
    }
  }

  function formatDate(isoString) {
    const d = new Date(isoString);
    if (isNaN(d)) return "Unknown Date";
    const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const timePart = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${datePart}<br/>${timePart}`;
  }

  // --- View 1: Render Overview (Grouped Summaries) ---
  function renderOverview() {
    statGamesPlayed.textContent = allResults.length;
    let totalC = 0, totalA = 0;
    allResults.forEach(r => { totalC += r.correct; totalA += r.total; });
    statGlobalAccuracy.textContent = totalA > 0 ? `${((totalC/totalA)*100).toFixed(1)}%` : "0%";

    const sortMethod = document.querySelector('input[name="sort-overview"]:checked').value;
    
    // Convert grouped object to array and calculate aggregates
    let summaries = Object.values(groupedResults).map(game => {
      const attempts = game.attempts;
      const recentTimestamp = Math.max(...attempts.map(a => a.timestamp));
      let gCorrect = 0, gTotal = 0, bestAcc = 0;
      
      attempts.forEach(a => {
        gCorrect += a.correct;
        gTotal += a.total;
        if (a.accuracy > bestAcc) bestAcc = a.accuracy;
      });
      
      const avgAcc = gTotal > 0 ? (gCorrect / gTotal) * 100 : 0;
      
      return {
        ...game,
        totalAttempts: attempts.length,
        avgAcc,
        bestAcc,
        recentTimestamp
      };
    });

    // Sort the Summary Cards
    summaries.sort((a, b) => {
      if (sortMethod === "recent") return b.recentTimestamp - a.recentTimestamp;
      if (sortMethod === "played") return b.totalAttempts - a.totalAttempts;
      if (sortMethod === "acc") return b.avgAcc - a.avgAcc;
      return 0;
    });

    overviewContainer.innerHTML = "";
    summaries.forEach(s => {
      const card = document.createElement("div");
      card.className = "summary-card";
      card.addEventListener("click", () => {
        playUiSound("select1.mp3");
        openDetailView(s.gameId);
      });

      card.innerHTML = `
        <div class="result-header">
          <h3 class="result-title">${s.gameName}</h3>
        </div>
        <div class="result-scores">
          <div class="score-tally">
            <span style="font-size: 20px;">${s.totalAttempts}</span>
            <span style="color: var(--text-muted); font-size: 12px; display: block; text-transform: uppercase;">Attempts</span>
          </div>
          <div class="score-accuracy">
            <span style="font-size: 14px; color: var(--text-main);">Avg: </span>${s.avgAcc.toFixed(1)}%
          </div>
        </div>
        <div class="view-details-btn">View Full History & Chart ➔</div>
      `;
      overviewContainer.appendChild(card);
    });
  }

  // --- View 2: Render Details (Specific Game) ---
  function openDetailView(gameId) {
    currentDetailGameId = gameId;
    overviewSection.classList.add("hidden");
    detailSection.classList.remove("hidden");
    renderDetailData();
  }

  function renderDetailData() {
    if (!currentDetailGameId || !groupedResults[currentDetailGameId]) return;
    
    const game = groupedResults[currentDetailGameId];
    let attempts = [...game.attempts];
    
    detailGameTitle.textContent = game.gameName;
    detailAttempts.textContent = attempts.length;

    let gCorrect = 0, gTotal = 0, bestAcc = 0;
    attempts.forEach(a => {
      gCorrect += a.correct;
      gTotal += a.total;
      if (a.accuracy > bestAcc) bestAcc = a.accuracy;
    });
    
    detailBest.textContent = `${bestAcc.toFixed(1)}%`;
    detailAvg.textContent = gTotal > 0 ? `${((gCorrect/gTotal)*100).toFixed(1)}%` : "0%";

    // Draw the Line Chart
    drawCanvasChart(attempts);

    // Apply Sorting for the List view
    const sortMethod = document.querySelector('input[name="sort-detail"]:checked').value;
    attempts.sort((a, b) => {
      if (sortMethod === "date-desc") return b.timestamp - a.timestamp;
      if (sortMethod === "date-asc") return a.timestamp - b.timestamp;
      if (sortMethod === "acc-desc") return b.accuracy - a.accuracy;
      if (sortMethod === "acc-asc") return a.accuracy - b.accuracy;
      return 0;
    });

    detailContainer.innerHTML = "";
    attempts.forEach(res => {
      const card = document.createElement("div");
      card.className = "result-card";
      const metaTag = res.meta ? `<div class="result-meta">${res.meta}</div>` : "";

      card.innerHTML = `
        <div class="result-header">
          <h3 class="result-title" style="font-size: 15px;">Attempt</h3>
          <div class="result-date">${formatDate(res.date)}</div>
        </div>
        ${metaTag}
        <div class="result-scores">
          <div class="score-tally">
            <span class="correct">${res.correct}</span> / <span class="incorrect">${res.incorrect}</span>
            <span style="color: var(--text-muted); font-size: 11px; display: block; text-transform: uppercase;">Correct / Incorrect</span>
          </div>
          <div class="score-accuracy">${res.accuracy.toFixed(1)}%</div>
        </div>
      `;
      detailContainer.appendChild(card);
    });
  }

  // --- HTML5 Canvas Chart Drawing Logic ---
  function drawCanvasChart(dataAttempts) {
    if (!progressChart) return;
    const ctx = progressChart.getContext('2d');
    
    // Always sort oldest to newest for chronological graphing
    const chartData = [...dataAttempts].sort((a,b) => a.timestamp - b.timestamp);

    // Get exact CSS dimensions to keep lines crisp on high-res displays
    const dpr = window.devicePixelRatio || 1;
    const rect = progressChart.parentElement.getBoundingClientRect();
    
    // Subtract padding of the container to prevent overflow
    const W = rect.width - 32; 
    const H = 200;

    progressChart.width = W * dpr;
    progressChart.height = H * dpr;
    ctx.scale(dpr, dpr);
    progressChart.style.width = W + 'px';
    progressChart.style.height = H + 'px';

    ctx.clearRect(0, 0, W, H);

    // Style values based on your theme
    const styleObj = getComputedStyle(document.body);
    const lineColor = styleObj.getPropertyValue('--accent').trim() || '#4086f6';
    const axisColor = styleObj.getPropertyValue('--bg-elevated').trim() || '#334155';
    const pointFill = styleObj.getPropertyValue('--bg-surface').trim() || '#1e293b';

    if (chartData.length < 2) {
      ctx.fillStyle = styleObj.getPropertyValue('--text-muted').trim() || '#cbd5e1';
      ctx.font = '600 14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Play at least 2 rounds to see your chart line!', W/2, H/2);
      return;
    }

    const padX = 30;
    const padY = 20;
    const drawW = W - padX * 2;
    const drawH = H - padY * 2;

    // Draw Axes Frame
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padX, padY);
    ctx.lineTo(padX, H - padY); 
    ctx.lineTo(W - padX + 10, H - padY); 
    ctx.stroke();

    // Map data to canvas coordinates, passing through the 'total' parameter
    const points = chartData.map((d, i) => {
      const x = padX + (i / (chartData.length - 1)) * drawW;
      const y = (H - padY) - ((d.accuracy / 100) * drawH);
      return {x, y, total: d.total || 0};
    });

    // Draw Line
    ctx.beginPath();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    // Draw Data Dots (Dynamically Sized)
    points.forEach(p => {
      ctx.beginPath();
      ctx.fillStyle = pointFill;
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      
      // Calculate radius based on the total questions asked (Base 4px + up to 6px extra)
      const extraRadius = Math.min(6, (Math.max(0, p.total - 5) / 30) * 6);
      const r = 4 + extraRadius;
      
      ctx.arc(p.x, p.y, r, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
    });
  }

  // --- Modal Logic ---
  function openModal(modalEl) { modalEl.classList.remove("hidden"); }
  function closeModal(modalEl) { modalEl.classList.add("hidden"); }

  sortOverviewBtn.addEventListener("click", () => { playUiSound("select1.mp3"); openModal(sortOverviewModal); });
  closeSortOverviewBtn.addEventListener("click", () => { 
    playUiSound("back1.mp3"); 
    closeModal(sortOverviewModal); 
    renderOverview();
  });

  sortDetailBtn.addEventListener("click", () => { playUiSound("select1.mp3"); openModal(sortDetailModal); });
  closeSortDetailBtn.addEventListener("click", () => { 
    playUiSound("back1.mp3"); 
    closeModal(sortDetailModal); 
    renderDetailData();
  });

  // --- Reset Data Logic ---
  resetDataBtn.addEventListener("click", () => {
    playUiSound("select1.mp3");
    openModal(resetModal);
  });

  cancelResetBtn.addEventListener("click", () => {
    playUiSound("back1.mp3");
    closeModal(resetModal);
  });

  confirmResetBtn.addEventListener("click", () => {
    playUiSound("select1.mp3");
    localStorage.removeItem(LS_KEY_RESULTS);
    closeModal(resetModal);
    loadData(); // Re-trigger load which will hit the empty state logic
  });

  // --- Re-draw chart seamlessly if screen resizes ---
  window.addEventListener('resize', () => {
    if (!detailSection.classList.contains("hidden")) {
      renderDetailData();
    }
  });

  // --- Boot App ---
  function init() {
    const savedTheme = localStorage.getItem(LS_KEY_THEME) || "dark";
    applyTheme(savedTheme);
    loadData();
  }

  init();

})();