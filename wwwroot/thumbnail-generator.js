(() => {
  const thumbnailCache = new Map();
  const waitingWrappers = new Map();
  const queuedIds = new Set();
  const activeIds = new Set();
  const queue = [];
  const maxConcurrent = 2;
  let activeCount = 0;

  function videoIdFromThumbnailUrl(src) {
    try {
      const url = new URL(src, window.location.origin);
      const match = url.pathname.match(/^\/api\/videos\/([^/]+)\/thumbnail$/);
      return match ? decodeURIComponent(match[1]) : null;
    } catch {
      return null;
    }
  }

  function addGeneratedImage(wrapper, dataUrl) {
    if (!wrapper || !wrapper.isConnected || wrapper.querySelector('img')) return;

    const placeholder = wrapper.querySelector('.thumbnail-placeholder');
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = '';
    img.className = 'generated-thumbnail';
    img.addEventListener('load', () => placeholder?.remove(), { once: true });
    wrapper.appendChild(img);
  }

  function requestThumbnail(wrapper, id) {
    if (!wrapper || !id) return;

    const cached = thumbnailCache.get(id);
    if (cached) {
      addGeneratedImage(wrapper, cached);
      return;
    }

    if (!waitingWrappers.has(id)) waitingWrappers.set(id, new Set());
    waitingWrappers.get(id).add(wrapper);

    if (queuedIds.has(id) || activeIds.has(id)) return;
    queuedIds.add(id);
    queue.push(id);
    processQueue();
  }

  function processQueue() {
    while (activeCount < maxConcurrent && queue.length) {
      const id = queue.shift();
      queuedIds.delete(id);
      activeIds.add(id);
      activeCount++;

      generateThumbnail(id)
        .then(dataUrl => {
          if (!dataUrl) return;
          thumbnailCache.set(id, dataUrl);
          const wrappers = waitingWrappers.get(id) || [];
          wrappers.forEach(wrapper => addGeneratedImage(wrapper, dataUrl));
        })
        .catch(error => console.debug('Could not create video thumbnail', id, error))
        .finally(() => {
          waitingWrappers.delete(id);
          activeIds.delete(id);
          activeCount--;
          processQueue();
        });
    }
  }

  function once(target, eventName, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`${eventName} timed out`));
      }, timeoutMs);

      const onEvent = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(target.error || new Error(`Video ${eventName} failed`));
      };

      function cleanup() {
        clearTimeout(timer);
        target.removeEventListener(eventName, onEvent);
        target.removeEventListener('error', onError);
      }

      target.addEventListener(eventName, onEvent, { once: true });
      target.addEventListener('error', onError, { once: true });
    });
  }

  function drawCoverFrame(context, source, width, height) {
    const sourceWidth = source.videoWidth;
    const sourceHeight = source.videoHeight;
    if (!sourceWidth || !sourceHeight) return false;

    const targetRatio = width / height;
    const sourceRatio = sourceWidth / sourceHeight;

    let sx = 0;
    let sy = 0;
    let sw = sourceWidth;
    let sh = sourceHeight;

    if (sourceRatio > targetRatio) {
      sw = sourceHeight * targetRatio;
      sx = (sourceWidth - sw) / 2;
    } else if (sourceRatio < targetRatio) {
      sh = sourceWidth / targetRatio;
      sy = (sourceHeight - sh) / 2;
    }

    context.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
    return true;
  }

  async function waitForRenderedFrame(video) {
    if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
      await Promise.race([
        new Promise(resolve => video.requestVideoFrameCallback(() => resolve())),
        new Promise(resolve => setTimeout(resolve, 700))
      ]);
    } else {
      await new Promise(resolve => setTimeout(resolve, 180));
    }
  }

  async function generateThumbnail(id) {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = `/api/videos/${encodeURIComponent(id)}/stream`;

    try {
      video.load();
      await once(video, 'loadedmetadata');

      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const targetTime = duration > 1
        ? Math.min(Math.max(duration * 0.12, 1), 8, Math.max(0.1, duration - 0.25))
        : 0;

      if (targetTime > 0.05) {
        video.currentTime = targetTime;
        await once(video, 'seeked');
      } else if (video.readyState < 2) {
        await once(video, 'loadeddata');
      }

      await waitForRenderedFrame(video);

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context || !drawCoverFrame(context, video, canvas.width, canvas.height)) return null;

      return canvas.toDataURL('image/jpeg', 0.82);
    } finally {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const removedNode of record.removedNodes) {
        if (!(removedNode instanceof HTMLImageElement)) continue;

        const id = videoIdFromThumbnailUrl(removedNode.src);
        if (!id) continue;

        const wrapper = record.target instanceof HTMLElement
          ? record.target.closest('.thumbnail')
          : null;

        if (wrapper) requestThumbnail(wrapper, id);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
