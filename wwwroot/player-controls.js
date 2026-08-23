(() => {
  const player = document.getElementById('player');
  const shell = player?.closest('.player-shell');
  if (!player || !shell) return;

  player.controls = false;
  player.removeAttribute('controls');
  shell.classList.add('paused');

  const controls = document.createElement('div');
  controls.className = 'yt-controls';
  controls.innerHTML = `
    <div class="yt-progress-wrap" aria-label="Seek">
      <div class="yt-progress-track">
        <div class="yt-progress-buffered"></div>
        <div class="yt-progress-played"></div>
        <div class="yt-progress-knob"></div>
      </div>
    </div>
    <div class="yt-controls-row">
      <button class="yt-control-button yt-play" type="button" aria-label="Play">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </button>
      <div class="yt-volume-group">
        <button class="yt-control-button yt-mute" type="button" aria-label="Mute">
          <svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9H3zm11.5 3a3.5 3.5 0 0 0-1.5-2.87v5.74A3.5 3.5 0 0 0 14.5 12zm0-6v2.06A5.5 5.5 0 0 1 17.5 12a5.5 5.5 0 0 1-3 4.94V19a7.5 7.5 0 0 0 0-13z"/></svg>
        </button>
        <input class="yt-volume" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume" />
      </div>
      <span class="yt-time">0:00 / 0:00</span>
      <div class="yt-controls-spacer"></div>
      <button class="yt-control-button yt-fullscreen" type="button" aria-label="Full screen">
        <svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zm-3-12v2h3v3h2V5h-5z"/></svg>
      </button>
    </div>`;

  const centerPlay = document.createElement('button');
  centerPlay.className = 'yt-center-play';
  centerPlay.type = 'button';
  centerPlay.setAttribute('aria-label', 'Play');
  centerPlay.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';

  shell.append(centerPlay, controls);

  const playButton = controls.querySelector('.yt-play');
  const muteButton = controls.querySelector('.yt-mute');
  const volume = controls.querySelector('.yt-volume');
  const time = controls.querySelector('.yt-time');
  const fullscreen = controls.querySelector('.yt-fullscreen');
  const progressWrap = controls.querySelector('.yt-progress-wrap');
  const played = controls.querySelector('.yt-progress-played');
  const buffered = controls.querySelector('.yt-progress-buffered');
  const knob = controls.querySelector('.yt-progress-knob');

  let hideTimer = null;
  let scrubbing = false;

  const playIcon = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  const pauseIcon = '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>';
  const volumeIcon = '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9H3zm11.5 3a3.5 3.5 0 0 0-1.5-2.87v5.74A3.5 3.5 0 0 0 14.5 12zm0-6v2.06A5.5 5.5 0 0 1 17.5 12a5.5 5.5 0 0 1-3 4.94V19a7.5 7.5 0 0 0 0-13z"/></svg>';
  const mutedIcon = '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9H3zm13.59 3 2.12-2.12-1.42-1.42L15.17 10.6l-2.12-2.13-1.42 1.42L13.76 12l-2.13 2.12 1.42 1.42 2.12-2.12 2.12 2.12 1.42-1.42L16.59 12z"/></svg>';

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      : `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  function updatePlayState() {
    const paused = player.paused;
    shell.classList.toggle('paused', paused);
    playButton.innerHTML = paused ? playIcon : pauseIcon;
    playButton.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    centerPlay.setAttribute('aria-label', paused ? 'Play' : 'Pause');
  }

  function updateVolumeState() {
    const muted = player.muted || player.volume === 0;
    muteButton.innerHTML = muted ? mutedIcon : volumeIcon;
    volume.value = muted ? 0 : player.volume;
  }

  function updateProgress() {
    const duration = player.duration;
    const current = player.currentTime;
    const pct = Number.isFinite(duration) && duration > 0 ? (current / duration) * 100 : 0;
    played.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    knob.style.left = `${Math.max(0, Math.min(100, pct))}%`;
    time.textContent = `${formatTime(current)} / ${formatTime(duration)}`;

    if (player.buffered.length && Number.isFinite(duration) && duration > 0) {
      try {
        const end = player.buffered.end(player.buffered.length - 1);
        buffered.style.width = `${Math.min(100, (end / duration) * 100)}%`;
      } catch {
        buffered.style.width = '0%';
      }
    }
  }

  function togglePlay() {
    if (player.paused) player.play().catch(() => {});
    else player.pause();
  }

  function showControls() {
    shell.classList.remove('controls-hidden');
    clearTimeout(hideTimer);
    if (!player.paused && !scrubbing) {
      hideTimer = setTimeout(() => shell.classList.add('controls-hidden'), 2200);
    }
  }

  function seekFromPointer(event) {
    if (!Number.isFinite(player.duration) || player.duration <= 0) return;
    const rect = progressWrap.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    player.currentTime = ratio * player.duration;
    updateProgress();
  }

  playButton.addEventListener('click', event => {
    event.stopPropagation();
    togglePlay();
  });
  centerPlay.addEventListener('click', event => {
    event.stopPropagation();
    togglePlay();
  });

  muteButton.addEventListener('click', event => {
    event.stopPropagation();
    player.muted = !player.muted;
    updateVolumeState();
  });

  volume.addEventListener('input', event => {
    event.stopPropagation();
    player.volume = Number(volume.value);
    player.muted = player.volume === 0;
    updateVolumeState();
  });
  volume.addEventListener('click', event => event.stopPropagation());

  fullscreen.addEventListener('click', event => {
    event.stopPropagation();
    if (document.fullscreenElement) document.exitFullscreen?.();
    else shell.requestFullscreen?.();
  });

  progressWrap.addEventListener('pointerdown', event => {
    event.stopPropagation();
    scrubbing = true;
    progressWrap.classList.add('scrubbing');
    progressWrap.setPointerCapture?.(event.pointerId);
    seekFromPointer(event);
    showControls();
  });
  progressWrap.addEventListener('pointermove', event => {
    if (!scrubbing) return;
    seekFromPointer(event);
  });
  progressWrap.addEventListener('pointerup', event => {
    if (!scrubbing) return;
    seekFromPointer(event);
    scrubbing = false;
    progressWrap.classList.remove('scrubbing');
    showControls();
  });

  controls.addEventListener('click', event => event.stopPropagation());
  shell.addEventListener('click', event => {
    if (event.target === player || event.target === shell) togglePlay();
  });
  shell.addEventListener('pointermove', showControls);
  shell.addEventListener('pointerleave', () => {
    if (!player.paused && !scrubbing) shell.classList.add('controls-hidden');
  });

  player.addEventListener('play', () => { updatePlayState(); showControls(); });
  player.addEventListener('pause', () => { updatePlayState(); showControls(); });
  player.addEventListener('timeupdate', updateProgress);
  player.addEventListener('progress', updateProgress);
  player.addEventListener('loadedmetadata', updateProgress);
  player.addEventListener('durationchange', updateProgress);
  player.addEventListener('volumechange', updateVolumeState);

  document.addEventListener('fullscreenchange', showControls);

  document.addEventListener('keydown', event => {
    if (!state?.currentVideo) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

    if (event.code === 'Space' || event.key.toLowerCase() === 'k') {
      event.preventDefault();
      togglePlay();
    } else if (event.key === 'ArrowRight') {
      player.currentTime = Math.min(player.duration || Infinity, player.currentTime + 5);
    } else if (event.key === 'ArrowLeft') {
      player.currentTime = Math.max(0, player.currentTime - 5);
    } else if (event.key.toLowerCase() === 'm') {
      player.muted = !player.muted;
    } else if (event.key.toLowerCase() === 'f') {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else shell.requestFullscreen?.();
    }
  });

  updatePlayState();
  updateVolumeState();
  updateProgress();
})();
