(() => {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const HOVER_DELAY_MS = 650;
  const PREVIEW_LENGTH_SECONDS = 10;

  let hoverTimer = null;
  let activeWrapper = null;
  let activeVideo = null;
  let previewStart = 0;

  const style = document.createElement('style');
  style.textContent = `
    .thumbnail .hover-preview-video {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: #000;
      z-index: 2;
      pointer-events: none;
    }
    .thumbnail.preview-playing .progress-track {
      z-index: 3;
    }
  `;
  document.head.appendChild(style);

  function idFromUrl(src) {
    try {
      const url = new URL(src, window.location.origin);
      const match = url.pathname.match(/^\/api\/videos\/([^/]+)\/(?:thumbnail|stream)$/);
      return match ? decodeURIComponent(match[1]) : null;
    } catch {
      return null;
    }
  }

  function resolveVideoId(wrapper) {
    if (wrapper.dataset.videoId) return wrapper.dataset.videoId;

    for (const img of wrapper.querySelectorAll('img')) {
      const id = idFromUrl(img.src);
      if (id) {
        wrapper.dataset.videoId = id;
        return id;
      }
    }

    return null;
  }

  function clearPendingHover() {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  }

  function stopPreview() {
    clearPendingHover();

    if (activeVideo) {
      activeVideo.pause();
      activeVideo.removeAttribute('src');
      activeVideo.load();
      activeVideo.remove();
    }

    activeWrapper?.classList.remove('preview-playing');
    activeVideo = null;
    activeWrapper = null;
    previewStart = 0;
  }

  async function startPreview(wrapper) {
    const id = resolveVideoId(wrapper);
    if (!id || !wrapper.isConnected || !wrapper.matches(':hover')) return;

    stopPreview();
    activeWrapper = wrapper;

    const video = document.createElement('video');
    activeVideo = video;
    video.className = 'hover-preview-video';
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.disablePictureInPicture = true;
    video.setAttribute('aria-hidden', 'true');
    video.src = `/api/videos/${encodeURIComponent(id)}/stream`;

    wrapper.appendChild(video);

    const cleanupIfInactive = () => {
      if (activeVideo !== video || activeWrapper !== wrapper || !wrapper.matches(':hover')) {
        if (activeVideo === video) stopPreview();
        return true;
      }
      return false;
    };

    video.addEventListener('loadedmetadata', async () => {
      if (cleanupIfInactive()) return;

      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (duration > 1) {
        // Begin a little before the static 50% thumbnail so the preview visibly moves through it.
        previewStart = Math.min(
          Math.max(duration * 0.42, 0.5),
          Math.max(0.1, duration - 0.5)
        );

        try {
          video.currentTime = previewStart;
        } catch {
          previewStart = 0;
        }
      }

      wrapper.classList.add('preview-playing');

      try {
        await video.play();
      } catch (error) {
        console.debug('Hover preview could not autoplay', error);
      }
    }, { once: true });

    video.addEventListener('timeupdate', () => {
      if (!Number.isFinite(video.currentTime)) return;
      if (video.currentTime >= previewStart + PREVIEW_LENGTH_SECONDS) {
        try {
          video.currentTime = previewStart;
        } catch {
          // Ignore browsers that temporarily reject seeking while buffering.
        }
      }
    });

    video.addEventListener('ended', () => {
      if (activeVideo !== video) return;
      try {
        video.currentTime = previewStart;
        video.play().catch(() => {});
      } catch {
        // The pointer can leave while the media event is being processed.
      }
    });

    video.addEventListener('error', () => {
      if (activeVideo === video) stopPreview();
    });

    video.load();
  }

  document.addEventListener('pointerover', event => {
    const wrapper = event.target instanceof Element
      ? event.target.closest('.thumbnail')
      : null;

    if (!wrapper) return;
    if (event.relatedTarget instanceof Node && wrapper.contains(event.relatedTarget)) return;

    clearPendingHover();
    if (activeWrapper && activeWrapper !== wrapper) stopPreview();

    hoverTimer = setTimeout(() => {
      hoverTimer = null;
      startPreview(wrapper);
    }, HOVER_DELAY_MS);
  });

  document.addEventListener('pointerout', event => {
    const wrapper = event.target instanceof Element
      ? event.target.closest('.thumbnail')
      : null;

    if (!wrapper) return;
    if (event.relatedTarget instanceof Node && wrapper.contains(event.relatedTarget)) return;

    clearPendingHover();
    if (activeWrapper === wrapper) stopPreview();
  });

  // Preserve the video id when the missing server thumbnail is removed and
  // replaced by the generated midpoint thumbnail.
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (!(record.target instanceof Element)) continue;
      const wrapper = record.target.closest('.thumbnail');
      if (!wrapper || wrapper.dataset.videoId) continue;

      for (const removedNode of record.removedNodes) {
        if (!(removedNode instanceof HTMLImageElement)) continue;
        const id = idFromUrl(removedNode.src);
        if (id) {
          wrapper.dataset.videoId = id;
          break;
        }
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('blur', stopPreview);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopPreview();
  });
})();
