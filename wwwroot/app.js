const state = {
  videos: [],
  config: null,
  category: 'All',
  query: '',
  currentVideo: null,
  lastProgressSave: 0
};

const els = {
  homeView: document.getElementById('homeView'),
  watchView: document.getElementById('watchView'),
  videoGrid: document.getElementById('videoGrid'),
  continueGrid: document.getElementById('continueGrid'),
  continueSection: document.getElementById('continueSection'),
  emptyState: document.getElementById('emptyState'),
  categoryChips: document.getElementById('categoryChips'),
  sidebarCategories: document.getElementById('sidebarCategories'),
  pageTitle: document.getElementById('pageTitle'),
  videoCount: document.getElementById('videoCount'),
  libraryStatus: document.getElementById('libraryStatus'),
  statusTitle: document.getElementById('statusTitle'),
  statusMessage: document.getElementById('statusMessage'),
  searchForm: document.getElementById('searchForm'),
  searchInput: document.getElementById('searchInput'),
  sidebar: document.getElementById('sidebar'),
  player: document.getElementById('player'),
  audioTrack: document.getElementById('audioTrack'),
  watchTitle: document.getElementById('watchTitle'),
  watchCategory: document.getElementById('watchCategory'),
  watchFileInfo: document.getElementById('watchFileInfo'),
  suggestionList: document.getElementById('suggestionList'),
  toast: document.getElementById('toast')
};

const PROGRESS_KEY = 'kidstube-progress-v1';

function dailyRefreshKey() {
  return new Date().toISOString().slice(0, 10);
}

function dailyOrder(videos) {
  const day = dailyRefreshKey();
  return [...videos].sort((left, right) => {
    const leftKey = hashString(`${day}:${left.id}`);
    const rightKey = hashString(`${day}:${right.id}`);
    return leftKey - rightKey;
  });
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function api(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function loadLibrary() {
  try {
    const [config, videos] = await Promise.all([
      api('/api/config'),
      api('/api/videos')
    ]);

    state.config = config;
    state.videos = dailyOrder(videos);
    renderLibraryStatus();
    renderCategories();
    renderHome();
    routeFromUrl(false);
  } catch (error) {
    console.error(error);
    showToast('Could not load the local video library.');
    els.libraryStatus.classList.remove('hidden');
    els.statusTitle.textContent = 'KidsTube server error';
    els.statusMessage.textContent = 'Check the terminal window for details and refresh this page.';
  }
}

function renderLibraryStatus() {
  if (!state.config) return;

  if (!state.config.libraryExists) {
    els.libraryStatus.classList.remove('hidden');
    els.statusTitle.textContent = 'Video folder not found';
    els.statusMessage.textContent = `Create ${state.config.libraryPath} and copy your approved videos into it.`;
    return;
  }

  if (state.config.videoCount === 0) {
    els.libraryStatus.classList.remove('hidden');
    els.statusTitle.textContent = 'Your KidsTube folder is ready';
    els.statusMessage.textContent = `Copy MP4/WebM videos into ${state.config.libraryPath}. Subfolders automatically become categories.`;
    return;
  }

  els.libraryStatus.classList.add('hidden');
}

function categories() {
  return ['All', ...new Set(state.videos.map(v => v.category))];
}

function displayCategory(category) {
  const words = category.trim().split(/\s+/);
  return words.length > 2 ? `${words.slice(0, 2).join(' ')}...` : category;
}

function renderCategories() {
  els.categoryChips.innerHTML = '';
  els.sidebarCategories.innerHTML = '';

  for (const category of categories()) {
    const chip = document.createElement('button');
    chip.className = `chip${state.category === category ? ' active' : ''}`;
    chip.textContent = displayCategory(category);
    chip.addEventListener('click', () => selectCategory(category));
    els.categoryChips.appendChild(chip);

    if (category !== 'All') {
      const item = document.createElement('button');
      item.className = 'nav-item';
      item.innerHTML = '<span>▣</span>';
      item.append(document.createTextNode(displayCategory(category)));
      item.addEventListener('click', () => selectCategory(category));
      els.sidebarCategories.appendChild(item);
    }
  }
}

function selectCategory(category) {
  state.category = category;
  state.query = '';
  els.searchInput.value = '';
  showHome();
  renderCategories();
  renderHome();
  closeMobileSidebar();
}

function filteredVideos() {
  const query = state.query.trim().toLowerCase();
  return state.videos.filter(video => {
    const categoryMatch = state.category === 'All' || video.category === state.category;
    const queryMatch = !query || video.title.toLowerCase().includes(query) || video.category.toLowerCase().includes(query);
    return categoryMatch && queryMatch;
  });
}

function renderHome() {
  const videos = filteredVideos();
  els.videoGrid.innerHTML = '';

  for (const video of videos) {
    els.videoGrid.appendChild(createVideoCard(video));
  }

  els.pageTitle.textContent = state.query
    ? `Search results for “${state.query}”`
    : state.category === 'All' ? 'Home' : displayCategory(state.category);
  els.videoCount.textContent = `${videos.length} video${videos.length === 1 ? '' : 's'}`;
  els.emptyState.classList.toggle('hidden', videos.length !== 0);

  renderContinueWatching();
}

function createVideoCard(video, compact = false) {
  const card = document.createElement('article');
  card.className = 'video-card';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Play ${video.title}`);

  const thumbnail = createThumbnail(video);
  const progress = getProgress(video.id);
  if (progress && progress.duration > 0 && progress.time > 1) {
    const track = document.createElement('div');
    track.className = 'progress-track';
    const value = document.createElement('div');
    value.className = 'progress-value';
    value.style.width = `${Math.min(100, (progress.time / progress.duration) * 100)}%`;
    track.appendChild(value);
    thumbnail.appendChild(track);
  }

  const body = document.createElement('div');
  body.className = 'card-body';

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = video.title;

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  meta.textContent = `${displayCategory(video.category)} • ${formatSize(video.sizeBytes)}`;

  body.append(title, meta);
  card.append(thumbnail, body);

  const open = () => openVideo(video.id);
  card.addEventListener('click', open);
  card.addEventListener('keydown', event => {
    if (event.target !== card) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });

  return card;
}

function createThumbnail(video) {
  const wrapper = document.createElement('div');
  wrapper.className = 'thumbnail';
  wrapper.dataset.videoId = video.id;

  const placeholder = document.createElement('div');
  placeholder.className = 'thumbnail-placeholder';
  placeholder.textContent = '🎬';
  wrapper.appendChild(placeholder);

  const img = document.createElement('img');
  img.src = video.thumbnailUrl;
  img.alt = '';
  img.loading = 'lazy';
  img.addEventListener('load', () => placeholder.remove());
  img.addEventListener('error', () => img.remove());
  wrapper.appendChild(img);

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp';
  input.className = 'thumbnail-file-input';
  input.setAttribute('aria-label', `Choose a fixed thumbnail for ${video.title}`);
  input.addEventListener('click', event => event.stopPropagation());
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    const addButton = wrapper.querySelector('.thumbnail-add-button');
    if (addButton) addButton.disabled = true;
    try {
      const response = await fetch(`/api/videos/${encodeURIComponent(video.id)}/thumbnail`, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

      document.querySelectorAll('.thumbnail').forEach(thumbnail => {
        if (thumbnail.dataset.videoId !== video.id) return;
        thumbnail.dataset.fixedThumbnail = 'true';
        let image = thumbnail.querySelector('img');
        if (!image) {
          image = document.createElement('img');
          image.alt = '';
          image.addEventListener('load', () => thumbnail.querySelector('.thumbnail-placeholder')?.remove(), { once: true });
          thumbnail.appendChild(image);
        }
        image.classList.remove('generated-thumbnail');
        image.src = `${video.thumbnailUrl}?updated=${Date.now()}`;
      });
      showToast('Fixed thumbnail saved.');
    } catch (error) {
      console.error('Could not save fixed thumbnail', error);
      showToast('Could not save this thumbnail.');
    } finally {
      if (addButton) addButton.disabled = false;
      input.value = '';
    }
  });

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'thumbnail-add-button';
  addButton.textContent = '+';
  addButton.title = `Add a fixed thumbnail for ${video.title}`;
  addButton.setAttribute('aria-label', `Add a fixed thumbnail for ${video.title}`);
  addButton.addEventListener('click', event => {
    event.stopPropagation();
    input.click();
  });
  addButton.addEventListener('keydown', event => event.stopPropagation());
  wrapper.append(input, addButton);

  return wrapper;
}

function renderContinueWatching() {
  const progress = loadProgress();
  const videos = state.videos
    .filter(video => {
      const p = progress[video.id];
      return p && p.time > 5 && p.duration > 0 && p.time < p.duration - 5;
    })
    .sort((a, b) => (progress[b.id]?.updatedAt ?? 0) - (progress[a.id]?.updatedAt ?? 0))
    .slice(0, 4);

  els.continueGrid.innerHTML = '';
  videos.forEach(video => els.continueGrid.appendChild(createVideoCard(video, true)));
  els.continueSection.classList.toggle('hidden', videos.length === 0);
}

function openVideo(id, pushHistory = true) {
  const video = state.videos.find(v => v.id === id);
  if (!video) return;

  const startingWatchSession = !state.currentVideo;
  saveCurrentProgress();
  if (startingWatchSession) window.YouTubeWatchLimit?.reset?.();
  state.currentVideo = video;

  els.homeView.classList.add('hidden');
  els.watchView.classList.remove('hidden');
  els.sidebar.classList.add('watch-hidden');
  document.body.classList.add('watch-mode');

  els.watchTitle.textContent = video.title;
  els.watchCategory.textContent = displayCategory(video.category);
  els.watchFileInfo.textContent = `${formatSize(video.sizeBytes)} • Local video`;

  els.player.pause();
  els.player.src = video.streamUrl;
  els.player.load();
  els.audioTrack.pause();
  if (video.audioUrl) {
    els.audioTrack.src = video.audioUrl;
    els.audioTrack.load();
  } else {
    els.audioTrack.removeAttribute('src');
    els.audioTrack.load();
  }

  renderSuggestions(video);
  window.scrollTo({ top: 0, behavior: 'instant' });

  if (pushHistory) {
    const url = new URL(window.location.href);
    url.searchParams.set('v', video.id);
    history.pushState({ videoId: video.id }, '', url);
  }
}

function renderSuggestions(current) {
  const sameCategory = state.videos.filter(v => v.id !== current.id && v.category === current.category);
  const others = state.videos.filter(v => v.id !== current.id && v.category !== current.category);
  const suggestions = [...sameCategory, ...others].slice(0, 12);

  els.suggestionList.innerHTML = '';
  for (const video of suggestions) {
    const card = document.createElement('article');
    card.className = 'suggestion-card';
    card.appendChild(createThumbnail(video));

    const body = document.createElement('div');
    body.className = 'card-body';
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = video.title;
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.textContent = displayCategory(video.category);
    body.append(title, meta);
    card.appendChild(body);
    card.addEventListener('click', () => openVideo(video.id));
    els.suggestionList.appendChild(card);
  }
}

function showHome(pushHistory = true) {
  saveCurrentProgress();
  state.currentVideo = null;
  els.player.pause();
  els.player.removeAttribute('src');
  els.player.load();
  els.audioTrack.pause();
  els.audioTrack.removeAttribute('src');
  els.audioTrack.load();
  els.watchView.classList.add('hidden');
  els.homeView.classList.remove('hidden');
  els.sidebar.classList.remove('watch-hidden');
  document.body.classList.remove('watch-mode');

  if (pushHistory) {
    const url = new URL(window.location.href);
    url.searchParams.delete('v');
    history.pushState({}, '', url);
  }

  renderHome();
}

function routeFromUrl(pushHistory = false) {
  const id = new URL(window.location.href).searchParams.get('v');
  if (id && state.videos.some(v => v.id === id)) {
    openVideo(id, pushHistory);
  } else {
    showHome(pushHistory);
  }
}

function playRandom() {
  if (!state.videos.length) {
    showToast('Add some videos first.');
    return;
  }

  const candidates = state.currentVideo && state.videos.length > 1
    ? state.videos.filter(v => v.id !== state.currentVideo.id)
    : state.videos;
  const video = candidates[Math.floor(Math.random() * candidates.length)];
  openVideo(video.id);
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
  } catch {
    return {};
  }
}

function getProgress(id) {
  return loadProgress()[id];
}

function saveCurrentProgress(force = false) {
  if (!state.currentVideo || !Number.isFinite(els.player.currentTime) || !Number.isFinite(els.player.duration)) return;

  const now = Date.now();
  if (!force && now - state.lastProgressSave < 2000) return;
  state.lastProgressSave = now;

  const progress = loadProgress();
  progress[state.currentVideo.id] = {
    time: els.player.currentTime,
    duration: els.player.duration,
    updatedAt: now
  };
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function restoreProgress() {
  if (!state.currentVideo) return;
  const progress = getProgress(state.currentVideo.id);
  if (!progress || progress.time <= 5 || progress.time >= els.player.duration - 5) return;

  try {
    els.player.currentTime = progress.time;
  } catch {
    // Some browsers need another metadata event before seeking; safe to ignore.
  }
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Local file';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit >= 2 ? 1 : 0)} ${units[unit]}`;
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 2600);
}

function closeMobileSidebar() {
  els.sidebar.classList.remove('open');
}

els.searchForm.addEventListener('submit', event => {
  event.preventDefault();
  state.query = els.searchInput.value;
  state.category = 'All';
  showHome();
  renderCategories();
  renderHome();
});

els.searchInput.addEventListener('input', () => {
  state.query = els.searchInput.value;
  state.category = 'All';
  if (!els.homeView.classList.contains('hidden')) {
    renderCategories();
    renderHome();
  }
});

document.getElementById('menuButton').addEventListener('click', () => els.sidebar.classList.toggle('open'));
document.getElementById('logoButton').addEventListener('click', () => showHome());
document.getElementById('backHomeButton').addEventListener('click', () => showHome());
document.getElementById('randomButton').addEventListener('click', playRandom);
document.getElementById('restartButton').addEventListener('click', () => {
  els.player.currentTime = 0;
  els.player.play().catch(() => {});
});

document.getElementById('clearHistoryButton').addEventListener('click', () => {
  localStorage.removeItem(PROGRESS_KEY);
  renderHome();
  showToast('Watching progress cleared.');
});

document.getElementById('rescanButton').addEventListener('click', async () => {
  try {
    await api('/api/rescan', { method: 'POST' });
    const [config, videos] = await Promise.all([api('/api/config'), api('/api/videos')]);
    state.config = config;
    state.videos = dailyOrder(videos);
    renderLibraryStatus();
    renderCategories();
    renderHome();
    showToast(`Found ${videos.length} video${videos.length === 1 ? '' : 's'}.`);
  } catch (error) {
    console.error(error);
    showToast('Rescan failed.');
  }
});

function promptResetWatchLimit() {
  const currentMinutes = Number(window.YouTubeWatchLimit?.getLimitMinutes?.() ?? 60);
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="resetWatchLimitTitle">
      <h3 id="resetWatchLimitTitle">Reset watch limit</h3>
      <label for="resetWatchLimitSelect">Choose how many minutes to allow each day</label>
      <select id="resetWatchLimitSelect">
        ${Array.from({ length: 12 }, (_, index) => 5 + index * 5)
          .map(minutes => `<option value="${minutes}" ${minutes === currentMinutes ? 'selected' : ''}>${minutes} minutes</option>`)
          .join('')}
      </select>
      <div class="modal-actions">
        <button type="button" class="secondary-action" data-close="true">Cancel</button>
        <button type="button" class="primary-action" id="confirmResetWatchLimitButton">Reset</button>
      </div>
    </div>
  `;

  const close = () => backdrop.remove();
  const select = backdrop.querySelector('#resetWatchLimitSelect');

  backdrop.querySelector('[data-close="true"]').addEventListener('click', close);
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) close();
  });
  backdrop.querySelector('#confirmResetWatchLimitButton').addEventListener('click', () => {
    const minutes = Number(select.value);
    if (window.YouTubeWatchLimit?.reset) {
      window.YouTubeWatchLimit.reset(minutes);
      showToast(`Watch limit reset to ${minutes} minutes.`);
    } else {
      showToast('No watch limit is active.');
    }
    close();
  });

  document.body.appendChild(backdrop);
  select.focus();
}

document.getElementById('resetWatchLimitButton').addEventListener('click', promptResetWatchLimit);

document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'home') showHome();
    if (action === 'random') playRandom();
    if (action === 'continue') {
      showHome();
      setTimeout(() => els.continueSection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    }
    closeMobileSidebar();
  });
});

els.player.addEventListener('loadedmetadata', restoreProgress);
els.player.addEventListener('play', () => {
  if (!els.audioTrack.src) return;
  els.audioTrack.currentTime = els.player.currentTime;
  els.audioTrack.play().catch(() => showToast('The separate sound file could not be played.'));
});
els.player.addEventListener('pause', () => els.audioTrack.pause());
els.player.addEventListener('seeking', () => {
  if (els.audioTrack.src) els.audioTrack.currentTime = els.player.currentTime;
});
els.player.addEventListener('ratechange', () => {
  els.audioTrack.playbackRate = els.player.playbackRate;
});
els.player.addEventListener('timeupdate', () => {
  if (!els.audioTrack.src || !Number.isFinite(els.audioTrack.currentTime)) return;
  if (Math.abs(els.audioTrack.currentTime - els.player.currentTime) > 0.25) {
    els.audioTrack.currentTime = els.player.currentTime;
  }
});
els.player.addEventListener('ended', () => els.audioTrack.pause());
els.audioTrack.addEventListener('error', () => showToast('The separate sound file is not supported by this browser. Use AAC, M4A, MP3, Opus, or WAV.'));
els.player.addEventListener('timeupdate', () => saveCurrentProgress(false));
els.player.addEventListener('pause', () => saveCurrentProgress(true));
els.player.addEventListener('ended', () => {
  saveCurrentProgress(true);
  renderContinueWatching();
});

window.addEventListener('beforeunload', () => saveCurrentProgress(true));
window.addEventListener('popstate', () => routeFromUrl(false));
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.currentVideo) showHome();
});

loadLibrary();
