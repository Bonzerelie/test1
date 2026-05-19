(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // --- Storage Keys ---
  const KEY_HAS_SEEN_WELCOME = "et_session_has_seen_welcome";
  const KEY_USER_NAME = "et_user_name";
  const KEY_THEME = "et_theme";

  // --- DOM Elements ---
  const welcomeHeading = $("welcomeHeading");
  const userNameInput = $("userNameInput");
  const themeToggleBtn = $("themeToggleBtn");
  const metaThemeColor = $("metaThemeColor");

  // Modals & Triggers
  const welcomeModal = $("welcomeModal");
  const settingsModal = $("settingsModal");
  const aboutModal = $("aboutModal");
  const filterModal = $("filterModal");
  const sortModal = $("sortModal");
  
  const welcomeEnterBtn = $("welcomeEnterBtn");
  const settingsBtn = $("settingsBtn");
  const closeSettingsBtn = $("closeSettingsBtn");
  const aboutBtn = $("aboutBtn");
  const closeAboutBtn = $("closeAboutBtn");
  const clearDataBtn = $("clearDataBtn");
  
  const filterBtn = $("filterBtn");
  const sortBtn = $("sortBtn");
  const closeFilterBtn = $("closeFilterBtn");
  const closeSortBtn = $("closeSortBtn");

  // Game Elements Data (Stored in memory on load)
  const gamesGrid = $("gamesGrid");
  let allGameTiles = [];

  // --- Audio Helper ---
  function playHomeSound(filename) {
    const snd = new Audio("audio/" + filename);
    snd.play().catch(e => console.log("Audio autoplay blocked by browser (will work in native app).", e));
  }

  // --- Initialization logic ---
  function initApp() {
    // 1. Check if we just navigated back from a game
    if (sessionStorage.getItem("et_play_back_sound") === "true") {
      sessionStorage.removeItem("et_play_back_sound"); // clear the baton
      playHomeSound("back1.mp3");
    }

    // 2. Store the raw HTML nodes for games before we start manipulating them
    if(gamesGrid) {
      allGameTiles = Array.from(gamesGrid.querySelectorAll('.game-tile'));
    }

    // 3. Apply Theme
    const savedTheme = localStorage.getItem(KEY_THEME) || "dark";
    applyTheme(savedTheme);

    // 4. Apply Name & Greeting
    const savedName = localStorage.getItem(KEY_USER_NAME);
    if (savedName) {
      userNameInput.value = savedName;
      updateGreeting(savedName);
    }

    // 5. Welcome Modal Logic
    if (!sessionStorage.getItem(KEY_HAS_SEEN_WELCOME)) {
      welcomeModal.classList.remove("hidden");
    }

    // 6. Run initial sort/filter layout for Games
    applyFiltersAndSort();
  }

  // --- Filter & Sort Logic ---
  // --- Helper to convert numerical rating to category string ---
  function getDifficultyCategory(ratingStr) {
    const rating = parseInt(ratingStr, 10) || 1;
    if (rating <= 3) return 'beginner';
    if (rating <= 6) return 'intermediate';
    if (rating <= 9) return 'advanced';
    return 'extra-advanced';
  }

  // --- Filter & Sort Logic ---
  function applyFiltersAndSort() {
    if(!gamesGrid || allGameTiles.length === 0) return;

    // Read current filter states
    const diffFilters = Array.from(document.querySelectorAll('.filter-diff:checked')).map(cb => cb.value);
    const typeFilters = Array.from(document.querySelectorAll('.filter-type:checked')).map(cb => cb.value);
    const sortVal = document.querySelector('input[name="sort-games"]:checked').value;

    // Filter array based on the mapped numerical category
    let filteredGames = allGameTiles.filter(game => {
      const category = getDifficultyCategory(game.dataset.difficulty);
      const t = game.dataset.type;
      return diffFilters.includes(category) && typeFilters.includes(t);
    });

    // Clear grid
    gamesGrid.innerHTML = '';

    if (filteredGames.length === 0) {
      gamesGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No games match the selected filters.</p>';
      return;
    }

    // Sort and Group into UI
    if (sortVal === 'diff-asc') {
      renderGroupedGames(filteredGames, 'difficulty', 
        ['beginner', 'intermediate', 'advanced', 'extra-advanced'], 
        ['Beginner', 'Intermediate', 'Advanced', 'Extra Advanced'], 
        'asc');
    } else if (sortVal === 'diff-desc') {
      renderGroupedGames(filteredGames, 'difficulty', 
        ['extra-advanced', 'advanced', 'intermediate', 'beginner'], 
        ['Extra Advanced', 'Advanced', 'Intermediate', 'Beginner'], 
        'desc');
    } else if (sortVal === 'rhythm-first') {
      renderGroupedGames(filteredGames, 'type', 
        ['rhythm', 'pitch'], 
        ['Rhythm Games', 'Pitch Games'], 
        'asc');
    } else if (sortVal === 'pitch-first') {
      renderGroupedGames(filteredGames, 'type', 
        ['pitch', 'rhythm'], 
        ['Pitch Games', 'Rhythm Games'], 
        'asc');
    }
  }

  function renderGroupedGames(games, dataKey, orderArray, titleArray, sortDirection) {
    orderArray.forEach((val, index) => {
      // Group the games based on mapped difficulty or direct type
      const groupGames = games.filter(g => {
        if (dataKey === 'difficulty') {
          return getDifficultyCategory(g.dataset.difficulty) === val;
        }
        return g.dataset[dataKey] === val;
      });

      // Sort games numerically *within* their groups for a cleaner presentation
      groupGames.sort((a, b) => {
        const ratingA = parseInt(a.dataset.difficulty, 10) || 1;
        const ratingB = parseInt(b.dataset.difficulty, 10) || 1;
        return sortDirection === 'asc' ? ratingA - ratingB : ratingB - ratingA;
      });

      if (groupGames.length > 0) {
        // Append Category Title
        const header = document.createElement('h3');
        header.className = 'category-title';
        header.textContent = titleArray[index];
        gamesGrid.appendChild(header);
        
        // Append matching tiles
        groupGames.forEach(g => gamesGrid.appendChild(g));
      }
    });
  }

  // Trigger update immediately when any checkbox or radio is changed
  document.querySelectorAll('.filter-diff, .filter-type, input[name="sort-games"]').forEach(input => {
    input.addEventListener('change', applyFiltersAndSort);
  });

  // --- Name & Greeting Logic ---
  function updateGreeting(name) {
    if (name && name.trim().length > 0) {
      welcomeHeading.textContent = `Welcome, ${name.trim()}!`;
    } else {
      welcomeHeading.textContent = "Welcome to the Ear Training Lab!";
    }
  }

  userNameInput.addEventListener("input", (e) => {
    const newName = e.target.value;
    localStorage.setItem(KEY_USER_NAME, newName);
    updateGreeting(newName);
  });

  // --- Theme Logic ---
  function applyTheme(theme) {
    if (theme === "light") {
      document.body.classList.add("light-theme");
      themeToggleBtn.textContent = "🌙 Switch to Dark Mode";
      if(metaThemeColor) metaThemeColor.setAttribute("content", "#f1f5f9");
    } else {
      document.body.classList.remove("light-theme");
      themeToggleBtn.textContent = "☀️ Switch to Light Mode";
      if(metaThemeColor) metaThemeColor.setAttribute("content", "#0f172a");
    }
  }

  themeToggleBtn.addEventListener("click", () => {
    const isLight = document.body.classList.contains("light-theme");
    const newTheme = isLight ? "dark" : "light";
    localStorage.setItem(KEY_THEME, newTheme);
    applyTheme(newTheme);
  });

  // --- Clear Data Logic ---
  clearDataBtn.addEventListener("click", () => {
    const confirmClear = window.confirm("Are you sure you want to completely clear your name, settings, and all game progress? This cannot be undone.");
    if (confirmClear) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload(); 
    }
  });

  // --- Modal Navigation Controls ---
  welcomeEnterBtn.addEventListener("click", () => {
    welcomeModal.classList.add("hidden");
    sessionStorage.setItem(KEY_HAS_SEEN_WELCOME, "true");
  });

  // Wired up Sounds for Modals
  settingsBtn.addEventListener("click", () => {
    playHomeSound("select1.mp3");
    settingsModal.classList.remove("hidden");
  });
  closeSettingsBtn.addEventListener("click", () => {
    playHomeSound("back1.mp3");
    settingsModal.classList.add("hidden");
  });

  aboutBtn.addEventListener("click", () => {
    playHomeSound("select1.mp3");
    aboutModal.classList.remove("hidden");
  });
  closeAboutBtn.addEventListener("click", () => {
    playHomeSound("back1.mp3");
    aboutModal.classList.add("hidden");
  });

  filterBtn.addEventListener("click", () => {
    playHomeSound("select1.mp3");
    filterModal.classList.remove("hidden");
  });
  closeFilterBtn.addEventListener("click", () => {
    playHomeSound("back1.mp3");
    filterModal.classList.add("hidden");
  });

  sortBtn.addEventListener("click", () => {
    playHomeSound("select1.mp3");
    sortModal.classList.remove("hidden");
  });
  closeSortBtn.addEventListener("click", () => {
    playHomeSound("back1.mp3");
    sortModal.classList.add("hidden");
  });

  // --- Main Tab Navigation Logic ---
  const navButtons = document.querySelectorAll(".tab-btn");
  const contentSections = document.querySelectorAll(".content-section");

  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      navButtons.forEach(b => b.classList.remove("active"));
      contentSections.forEach(sec => sec.classList.add("hidden"));
      btn.classList.add("active");
      const targetId = btn.getAttribute("data-target");
      const targetSection = $(targetId);
      if (targetSection) {
        targetSection.classList.remove("hidden");
      }
    });
  });

  // Boot the app configuration
  initApp();

})();