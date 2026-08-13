/* ============================================================
   Product photo optimize: resize + mild enhance + compress
   ============================================================ */
const ImageOptimize = (() => {
  const PRODUCT = {
    maxEdge: 1400,
    jpegQuality: 0.84,
    webpQuality: 0.82,
    contrast: 1.07,
    saturate: 1.08,
    brightness: 1.015,
  };

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function canvas(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    return cv;
  }

  /** Step-down resize for sharper results than one big drawImage */
  function resizeHighQuality(img, tw, th) {
    let src = img;
    let sw = img.naturalWidth || img.width;
    let sh = img.naturalHeight || img.height;

    while (sw * 0.5 > tw && sh * 0.5 > th) {
      const nw = Math.max(tw, Math.round(sw * 0.5));
      const nh = Math.max(th, Math.round(sh * 0.5));
      const tmp = canvas(nw, nh);
      const ctx = tmp.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, nw, nh);
      src = tmp;
      sw = nw;
      sh = nh;
    }

    const out = canvas(tw, th);
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, tw, th);
    return out;
  }

  function applyEnhance(srcCanvas, opts) {
    const out = canvas(srcCanvas.width, srcCanvas.height);
    const ctx = out.getContext('2d');
    const contrast = opts.contrast ?? 1.07;
    const saturate = opts.saturate ?? 1.08;
    const brightness = opts.brightness ?? 1.015;
    ctx.filter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturate})`;
    ctx.drawImage(srcCanvas, 0, 0);
    ctx.filter = 'none';

    /* light unsharp: blend original edges */
    try {
      const sharp = canvas(srcCanvas.width, srcCanvas.height);
      const sctx = sharp.getContext('2d');
      sctx.filter = 'contrast(1.25) brightness(1.02)';
      sctx.drawImage(srcCanvas, 0, 0);
      sctx.filter = 'none';
      ctx.globalAlpha = 0.18;
      ctx.globalCompositeOperation = 'overlay';
      ctx.drawImage(sharp, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    } catch (_) {
      /* overlay may fail in older engines — enhanced pass is enough */
    }
    return out;
  }

  function exportBest(cv, jpegQ, webpQ) {
    const jpeg = cv.toDataURL('image/jpeg', jpegQ);
    let best = jpeg;
    let mime = 'image/jpeg';
    try {
      const webp = cv.toDataURL('image/webp', webpQ);
      if (webp.startsWith('data:image/webp') && webp.length < jpeg.length * 0.92) {
        best = webp;
        mime = 'image/webp';
      }
    } catch (_) {}
    return { dataUrl: best, mime };
  }

  /**
   * @param {File|Blob|string} input file or data URL
   * @param {object} [options]
   * @returns {Promise<{ dataUrl: string, mime: string, width: number, height: number }>}
   */
  async function process(input, options = {}) {
    const opts = Object.assign({}, PRODUCT, options);
    let dataUrl;
    if (typeof input === 'string') {
      dataUrl = input;
    } else {
      dataUrl = await readFileAsDataURL(input);
    }
    const img = await loadImage(dataUrl);
    const sw = img.naturalWidth || img.width;
    const sh = img.naturalHeight || img.height;
    if (!sw || !sh) throw new Error('bad_image');

    const scale = Math.min(1, opts.maxEdge / Math.max(sw, sh));
    const tw = Math.max(1, Math.round(sw * scale));
    const th = Math.max(1, Math.round(sh * scale));

    let sized = resizeHighQuality(img, tw, th);
    sized = applyEnhance(sized, opts);
    const exported = exportBest(sized, opts.jpegQuality, opts.webpQuality);
    return {
      dataUrl: exported.dataUrl,
      mime: exported.mime,
      width: tw,
      height: th,
    };
  }

  async function product(input) {
    return process(input, PRODUCT);
  }

  /** Lighter pass for backgrounds / non-product */
  async function light(input) {
    return process(input, {
      maxEdge: 1600,
      jpegQuality: 0.8,
      webpQuality: 0.78,
      contrast: 1.03,
      saturate: 1.04,
      brightness: 1.0,
    });
  }

  return { process, product, light };
})();
