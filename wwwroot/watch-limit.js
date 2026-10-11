(() => {
  const player = document.getElementById('player');
  const shell = player?.closest('.player-shell');
  if (!player || !shell) return;

  const STORAGE_KEY = 'youtube-watch-limit-v1';
  const DEFAULT_LIMIT_MINUTES = 60;
  const MIN_LIMIT_MINUTES = 5;
  const MAX_LIMIT_MINUTES = 60;
  const BLOCK_DURATION_MS = 2 * 60 * 60 * 1000;

  const limitForm = document.getElementById('watchLimitForm');
  const limitInput = document.getElementById('watchLimitMinutes');
  const watchedDisplay = document.getElementById('watchTimeElapsed');
  const remainingDisplay = document.getElementById('watchTimeRemaining');

  let state = loadState();
  let lastTickAt = 0;
  let tickTimer = null;

  const spinner = document.createElement('div');
  spinner.className = 'watch-limit-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  shell.appendChild(spinner);

  function defaultState() {
    return { watchedMs: 0, blockedUntil: 0, allowanceExpiresAt: 0, limitMinutes: DEFAULT_LIMIT_MINUTES };
  }

  function normalizeLimitMinutes(value) {
    const minutes = Number(value);
    if (!Number.isFinite(minutes)) return DEFAULT_LIMIT_MINUTES;
    return Math.min(MAX_LIMIT_MINUTES, Math.max(MIN_LIMIT_MINUTES, Math.round(minutes)));
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const loaded = {
        watchedMs: Number.isFinite(parsed.watchedMs) ? Math.max(0, parsed.watchedMs) : 0,
        blockedUntil: Number.isFinite(parsed.blockedUntil) ? Math.max(0, parsed.blockedUntil) : 0,
        allowanceExpiresAt: Number.isFinite(parsed.allowanceExpiresAt) ? Math.max(0, parsed.allowanceExpiresAt) : 0,
        limitMinutes: normalizeLimitMinutes(parsed.limitMinutes)
      };

      if (!loaded.allowanceExpiresAt && loaded.blockedUntil) {
        loaded.allowanceExpiresAt = loaded.blockedUntil;
      } else if (!loaded.allowanceExpiresAt && loaded.watchedMs > 0) {
        loaded.watchedMs = 0;
      }

      const now = Date.now();
      if ((loaded.blockedUntil && now >= loaded.blockedUntil) ||
          (loaded.allowanceExpiresAt && now >= loaded.allowanceExpiresAt)) {
        const resetState = { ...loaded, watchedMs: 0, blockedUntil: 0, allowanceExpiresAt: 0 };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(resetState));
        return resetState;
      }

      return loaded;
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getLimitMs() {
    return state.limitMinutes * 60 * 1000;
  }

  function formatDuration(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function updateWatchTimeDisplay() {
    if (watchedDisplay) watchedDisplay.textContent = formatDuration(state.watchedMs);
    if (remainingDisplay) remainingDisplay.textContent = `${formatDuration(Math.max(0, getLimitMs() - state.watchedMs))} left`;
  }

  function isBlocked() {
    const now = Date.now();
    if ((state.blockedUntil && now >= state.blockedUntil) ||
        (state.allowanceExpiresAt && now >= state.allowanceExpiresAt)) {
      state.blockedUntil = 0;
      state.watchedMs = 0;
      state.allowanceExpiresAt = 0;
      saveState();
      stopTicking();
      updateWatchTimeDisplay();
    }
    return state.blockedUntil > now;
  }

  function notifyChange() {
    updateWatchTimeDisplay();
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
    state.watchedMs = getLimitMs();
    state.blockedUntil = Date.now() + BLOCK_DURATION_MS;
    state.allowanceExpiresAt = state.blockedUntil;
    saveState();
    stopTicking();
    player.pause();
    applyBlockedUi();
  }

  function resetAllowance(nextLimitMinutes = state.limitMinutes) {
    const normalizedLimit = normalizeLimitMinutes(nextLimitMinutes);
    state = { ...state, watchedMs: 0, blockedUntil: 0, allowanceExpiresAt: 0, limitMinutes: normalizedLimit };
    if (limitInput) limitInput.value = String(normalizedLimit);
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
    if (state.watchedMs >= getLimitMs()) {
      beginBlock();
      return;
    }

    saveState();
    updateWatchTimeDisplay();
  }

  function startTicking() {
    if (isBlocked()) {
      applyBlockedUi();
      return;
    }

    if (!state.allowanceExpiresAt) {
      state.allowanceExpiresAt = Date.now() + BLOCK_DURATION_MS;
      saveState();
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

  limitForm?.addEventListener('submit', event => {
    event.preventDefault();
    const limitMinutes = normalizeLimitMinutes(limitInput?.value);
    state = { watchedMs: 0, blockedUntil: 0, allowanceExpiresAt: 0, limitMinutes };
    if (limitInput) limitInput.value = String(limitMinutes);
    saveState();
    stopTicking();
    shell.classList.remove('watch-limit-blocked');
    notifyChange();
  });

  setInterval(() => {
    if ((state.blockedUntil && Date.now() >= state.blockedUntil) ||
        (state.allowanceExpiresAt && Date.now() >= state.allowanceExpiresAt)) {
      resetAllowance();
    } else if (state.blockedUntil) {
      applyBlockedUi();
    }
  }, 5000);

  window.YouTubeWatchLimit = {
    isBlocked,
    getRemainingWatchMs: () => Math.max(0, getLimitMs() - state.watchedMs),
    getBlockedUntil: () => state.blockedUntil,
    getLimitMinutes: () => state.limitMinutes,
    reset: resetAllowance
  };

  if (limitInput) limitInput.value = String(state.limitMinutes);
  updateWatchTimeDisplay();
  applyBlockedUi();
})();
