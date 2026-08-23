(() => {
  const player = document.getElementById('player');
  const shell = player?.closest('.player-shell');
  if (!player || !shell) return;

  const STORAGE_KEY = 'youtube-watch-limit-v1';
  const MAX_WATCH_MS = 40 * 60 * 1000;
  const BLOCK_DURATION_MS = 2 * 60 * 60 * 1000;

  let state = loadState();
  let lastTickAt = 0;
  let tickTimer = null;

  const spinner = document.createElement('div');
  spinner.className = 'watch-limit-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  shell.appendChild(spinner);

  function defaultState() {
    return { watchedMs: 0, blockedUntil: 0 };
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const loaded = {
        watchedMs: Number.isFinite(parsed.watchedMs) ? Math.max(0, parsed.watchedMs) : 0,
        blockedUntil: Number.isFinite(parsed.blockedUntil) ? Math.max(0, parsed.blockedUntil) : 0
      };

      if (loaded.blockedUntil && Date.now() >= loaded.blockedUntil) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState()));
        return defaultState();
      }

      return loaded;
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function isBlocked() {
    if (state.blockedUntil && Date.now() >= state.blockedUntil) {
      resetAllowance();
    }
    return state.blockedUntil > Date.now();
  }

  function notifyChange() {
    window.dispatchEvent(new CustomEvent('youtube-watch-limit-changed', {
      detail: {
        blocked: isBlocked(),
        watchedMs: state.watchedMs,
        blockedUntil: state.blockedUntil
      }
    }));
  }

  function applyBlockedUi() {
    const blocked = isBlocked();
    shell.classList.toggle('watch-limit-blocked', blocked);

    if (blocked && !player.paused) {
      player.pause();
    }

    notifyChange();
  }

  function beginBlock() {
    state.watchedMs = MAX_WATCH_MS;
    state.blockedUntil = Date.now() + BLOCK_DURATION_MS;
    saveState();
    stopTicking();
    player.pause();
    applyBlockedUi();
  }

  function resetAllowance() {
    state = defaultState();
    saveState();
    stopTicking();
    shell.classList.remove('watch-limit-blocked');
    notifyChange();
  }

  function accountElapsed() {
    if (!lastTickAt || player.paused || isBlocked()) {
      lastTickAt = Date.now();
      return;
    }

    const now = Date.now();
    const elapsed = Math.max(0, Math.min(2000, now - lastTickAt));
    lastTickAt = now;

    if (elapsed <= 0) return;

    state.watchedMs += elapsed;
    if (state.watchedMs >= MAX_WATCH_MS) {
      beginBlock();
      return;
    }

    saveState();
  }

  function startTicking() {
    if (isBlocked()) {
      applyBlockedUi();
      return;
    }

    lastTickAt = Date.now();
    if (tickTimer) return;
    tickTimer = setInterval(accountElapsed, 1000);
  }

  function stopTicking() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    lastTickAt = 0;
  }

  function blockPlaybackAttempt(event) {
    if (!isBlocked()) return false;
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    player.pause();
    applyBlockedUi();
    return true;
  }

  player.addEventListener('play', event => {
    if (blockPlaybackAttempt(event)) return;
    startTicking();
  }, true);

  player.addEventListener('pause', () => {
    accountElapsed();
    stopTicking();
  });

  player.addEventListener('ended', () => {
    accountElapsed();
    stopTicking();
  });

  document.addEventListener('click', event => {
    if (!isBlocked()) return;
    if (event.target instanceof Element && event.target.closest('.player-shell')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      applyBlockedUi();
    }
  }, true);

  document.addEventListener('dblclick', event => {
    if (!isBlocked()) return;
    if (event.target instanceof Element && event.target.closest('.player-shell')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      applyBlockedUi();
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (!isBlocked()) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

    const key = event.key.toLowerCase();
    if (event.code === 'Space' || key === 'k' || key === 'f' || key === 'm' || event.key.startsWith('Arrow')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      applyBlockedUi();
    }
  }, true);

  window.addEventListener('beforeunload', () => {
    accountElapsed();
    saveState();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      accountElapsed();
      stopTicking();
    } else if (!player.paused && !isBlocked()) {
      startTicking();
    }
  });

  setInterval(() => {
    if (state.blockedUntil && Date.now() >= state.blockedUntil) {
      resetAllowance();
    } else if (state.blockedUntil) {
      applyBlockedUi();
    }
  }, 5000);

  window.YouTubeWatchLimit = {
    isBlocked,
    getRemainingWatchMs: () => Math.max(0, MAX_WATCH_MS - state.watchedMs),
    getBlockedUntil: () => state.blockedUntil
  };

  applyBlockedUi();
})();
