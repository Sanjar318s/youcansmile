/* ============================================================
   Photo editor modal — crop/zoom + basic adjustments before upload
   ============================================================ */
const PhotoEditor = (() => {
  const EXPORT_EDGE = 1400;
  const PREVIEW = 360;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function t(key, fallback) {
    return typeof I18n !== 'undefined' ? I18n.t(key) : fallback;
  }

  function liftShadows(ctx, w, h, amount) {
    if (!amount) return;
    const lift = (amount / 100) * 0.55;
    const data = ctx.getImageData(0, 0, w, h);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      if (lum < 0.55) {
        const f = (0.55 - lum) * lift;
        d[i] = Math.min(255, d[i] + f * 255);
        d[i + 1] = Math.min(255, d[i + 1] + f * 255);
        d[i + 2] = Math.min(255, d[i + 2] + f * 255);
      }
    }
    ctx.putImageData(data, 0, 0);
  }

  function recoverHighlights(ctx, w, h, amount) {
    if (!amount) return;
    const amt = (amount / 100) * 0.35;
    const data = ctx.getImageData(0, 0, w, h);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      if (lum > 0.72) {
        const f = (lum - 0.72) * amt;
        d[i] = Math.max(0, d[i] - f * 255);
        d[i + 1] = Math.max(0, d[i + 1] - f * 255);
        d[i + 2] = Math.max(0, d[i + 2] - f * 255);
      }
    }
    ctx.putImageData(data, 0, 0);
  }

  function drawFrame(ctx, img, size, state) {
    const { zoom, panX, panY, brightness, contrast, saturate, exposure } = state;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const cover = Math.max(size / iw, size / ih);
    const scale = cover * (zoom / 100);
    const dw = iw * scale;
    const dh = ih * scale;
    const x = (size - dw) / 2 + panX;
    const y = (size - dh) / 2 + panY;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.clip();
    const b = (brightness / 100) * (exposure / 100);
    const c = contrast / 100;
    const s = saturate / 100;
    ctx.filter = `brightness(${b}) contrast(${c}) saturate(${s})`;
    ctx.drawImage(img, x, y, dw, dh);
    ctx.filter = 'none';
    ctx.restore();
  }

  function ensureModal() {
    let root = document.getElementById('photoEditorRoot');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'photoEditorRoot';
    root.className = 'photo-editor hidden';
    root.innerHTML = `
      <div class="photo-editor-backdrop" data-pe-close></div>
      <div class="photo-editor-panel" role="dialog" aria-modal="true" aria-labelledby="photoEditorTitle">
        <div class="photo-editor-head">
          <h3 id="photoEditorTitle">${t('photo_editor_title', 'Редактор фото')}</h3>
          <button type="button" class="photo-editor-close" data-pe-close aria-label="Close">✕</button>
        </div>
        <div class="photo-editor-body">
          <div class="photo-editor-preview-wrap">
            <canvas class="photo-editor-canvas" id="photoEditorCanvas" width="${PREVIEW}" height="${PREVIEW}"></canvas>
            <p class="photo-editor-hint">${t('photo_editor_drag_hint', 'Перетащите для смещения · колёсико или ползунок для масштаба')}</p>
          </div>
          <div class="photo-editor-controls" id="photoEditorControls"></div>
        </div>
        <div class="photo-editor-foot">
          <button type="button" class="btn btn-ghost" data-pe-cancel>${t('photo_editor_cancel', 'Отмена')}</button>
          <button type="button" class="btn btn-ghost" data-pe-reset>${t('photo_editor_reset', 'Сбросить')}</button>
          <button type="button" class="btn btn-primary" data-pe-apply>${t('photo_editor_apply', 'Применить')}</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    return root;
  }

  function defaultState() {
    return {
      zoom: 100,
      panX: 0,
      panY: 0,
      brightness: 100,
      contrast: 100,
      saturate: 100,
      exposure: 100,
      shadows: 0,
      highlights: 0,
      sharpness: 0,
    };
  }

  const SLIDERS = [
    { key: 'zoom', label: 'photo_editor_zoom', fb: 'Масштаб', min: 100, max: 280, step: 1 },
    { key: 'brightness', label: 'photo_editor_brightness', fb: 'Яркость', min: 60, max: 160, step: 1 },
    { key: 'contrast', label: 'photo_editor_contrast', fb: 'Контраст', min: 60, max: 160, step: 1 },
    { key: 'saturate', label: 'photo_editor_saturation', fb: 'Насыщенность', min: 0, max: 200, step: 1 },
    { key: 'exposure', label: 'photo_editor_exposure', fb: 'Экспозиция / свет', min: 70, max: 140, step: 1 },
    { key: 'shadows', label: 'photo_editor_shadows', fb: 'Тени', min: 0, max: 100, step: 1 },
    { key: 'highlights', label: 'photo_editor_highlights', fb: 'Светлые участки', min: 0, max: 100, step: 1 },
    { key: 'sharpness', label: 'photo_editor_sharpness', fb: 'Резкость', min: 0, max: 80, step: 1 },
  ];

  /**
   * @param {File|Blob|string} input
   * @returns {Promise<string|null>} data URL or null if cancelled
   */
  async function open(input) {
    const dataUrl = typeof input === 'string' ? input : await readFile(input);
    const img = await loadImage(dataUrl);
    const root = ensureModal();
    const canvas = root.querySelector('#photoEditorCanvas');
    const ctx = canvas.getContext('2d');
    const controls = root.querySelector('#photoEditorControls');
    let state = defaultState();
    let resolveDone;
    let dragging = false;
    let dragStart = { x: 0, y: 0, panX: 0, panY: 0 };

    controls.innerHTML = SLIDERS.map(
      (s) => `
      <label class="photo-editor-row">
        <span class="photo-editor-row-label">${t(s.label, s.fb)}</span>
        <input type="range" data-pe-key="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${state[s.key]}"/>
        <output data-pe-out="${s.key}">${state[s.key]}</output>
      </label>`
    ).join('');

    function paint() {
      drawFrame(ctx, img, PREVIEW, state);
    }

    function syncOutputs() {
      controls.querySelectorAll('[data-pe-out]').forEach((o) => {
        const k = o.dataset.peOut;
        o.textContent = state[k];
      });
    }

    function finish(result) {
      root.classList.add('hidden');
      document.body.classList.remove('photo-editor-open');
      cleanup();
      resolveDone(result);
    }

    function cleanup() {
      canvas.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      root.querySelectorAll('[data-pe-close], [data-pe-cancel]').forEach((b) => b.removeEventListener('click', onCancel));
      root.querySelector('[data-pe-reset]').removeEventListener('click', onReset);
      root.querySelector('[data-pe-apply]').removeEventListener('click', onApply);
      controls.querySelectorAll('input[type=range]').forEach((inp) => inp.removeEventListener('input', onSlider));
      canvas.removeEventListener('wheel', onWheel);
    }

    function onSlider(e) {
      const key = e.target.dataset.peKey;
      state[key] = Number(e.target.value);
      syncOutputs();
      paint();
    }

    function onDown(e) {
      dragging = true;
      dragStart = { x: e.clientX, y: e.clientY, panX: state.panX, panY: state.panY };
      canvas.setPointerCapture(e.pointerId);
    }

    function onMove(e) {
      if (!dragging) return;
      state.panX = dragStart.panX + (e.clientX - dragStart.x);
      state.panY = dragStart.panY + (e.clientY - dragStart.y);
      paint();
    }

    function onUp() {
      dragging = false;
    }

    function onWheel(e) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -4 : 4;
      state.zoom = Math.max(100, Math.min(280, state.zoom + delta));
      const inp = controls.querySelector('[data-pe-key="zoom"]');
      if (inp) inp.value = state.zoom;
      syncOutputs();
      paint();
    }

    function onReset() {
      state = defaultState();
      controls.querySelectorAll('input[type=range]').forEach((inp) => {
        inp.value = state[inp.dataset.peKey];
      });
      syncOutputs();
      paint();
    }

    function onCancel() {
      finish(null);
    }

    async function onApply() {
      const out = document.createElement('canvas');
      out.width = EXPORT_EDGE;
      out.height = EXPORT_EDGE;
      const octx = out.getContext('2d');
      drawFrame(octx, img, EXPORT_EDGE, state);
      if (state.shadows > 0) liftShadows(octx, EXPORT_EDGE, EXPORT_EDGE, state.shadows);
      if (state.highlights > 0) recoverHighlights(octx, EXPORT_EDGE, EXPORT_EDGE, state.highlights);
      if (state.sharpness > 0) {
        try {
          const sharp = document.createElement('canvas');
          sharp.width = EXPORT_EDGE;
          sharp.height = EXPORT_EDGE;
          const sctx = sharp.getContext('2d');
          sctx.filter = `contrast(${1 + state.sharpness / 200}) brightness(1.02)`;
          sctx.drawImage(out, 0, 0);
          sctx.filter = 'none';
          octx.globalAlpha = Math.min(0.45, state.sharpness / 180);
          octx.globalCompositeOperation = 'overlay';
          octx.drawImage(sharp, 0, 0);
          octx.globalAlpha = 1;
          octx.globalCompositeOperation = 'source-over';
        } catch (_) {}
      }
      let result = out.toDataURL('image/jpeg', 0.9);
      if (typeof ImageOptimize !== 'undefined') {
        try {
          const opt = await ImageOptimize.process(result, {
            maxEdge: EXPORT_EDGE,
            jpegQuality: 0.86,
            contrast: 1,
            saturate: 1,
            brightness: 1,
          });
          result = opt.dataUrl;
        } catch (_) {}
      }
      finish(result);
    }

    controls.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', onSlider));
    canvas.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    root.querySelectorAll('[data-pe-close], [data-pe-cancel]').forEach((b) => b.addEventListener('click', onCancel));
    root.querySelector('[data-pe-reset]').addEventListener('click', onReset);
    root.querySelector('[data-pe-apply]').addEventListener('click', onApply);

    syncOutputs();
    paint();
    root.querySelector('#photoEditorTitle').textContent = t('photo_editor_title', 'Редактор фото');
    root.querySelector('.photo-editor-hint').textContent = t(
      'photo_editor_drag_hint',
      'Перетащите для смещения · колёсико или ползунок для масштаба'
    );
    root.classList.remove('hidden');
    document.body.classList.add('photo-editor-open');

    return new Promise((resolve) => {
      resolveDone = resolve;
    });
  }

  return { open };
})();
