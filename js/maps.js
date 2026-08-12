/* ============================================================
   YouCanSmile — maps helper (Yandex when keyed, else Leaflet OSM)
   ============================================================ */
const YcsMaps = (() => {
  const TASHKENT = [41.2995, 69.2401];
  let yandexLoading = null;
  let leafletLoading = null;

  function loadYandexApi(apiKey) {
    if (window.ymaps) return Promise.resolve(window.ymaps);
    if (yandexLoading) return yandexLoading;
    if (!apiKey) return Promise.reject(new Error('no-key'));
    yandexLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
      s.async = true;
      s.onload = () => {
        window.ymaps.ready(() => resolve(window.ymaps));
      };
      s.onerror = () => reject(new Error('maps-load-failed'));
      document.head.appendChild(s);
    });
    return yandexLoading;
  }

  function ensureLeafletCss() {
    if (document.querySelector('link[data-ycs-leaflet]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzR8tDhmcAUIZA91vmFlbpI=';
    link.crossOrigin = '';
    link.dataset.ycsLeaflet = '1';
    document.head.appendChild(link);
  }

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletLoading) return leafletLoading;
    ensureLeafletCss();
    leafletLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
      s.crossOrigin = '';
      s.async = true;
      s.onload = () => resolve(window.L);
      s.onerror = () => reject(new Error('leaflet-load-failed'));
      document.head.appendChild(s);
    });
    return leafletLoading;
  }

  function appendConfirmBtn(el, opts, confirm) {
    if (!confirm) return null;
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'map-confirm-btn';
    confirmBtn.textContent =
      opts.confirmLabel ||
      (typeof I18n !== 'undefined' ? I18n.t('map_confirm_addr') : 'Подтвердить адрес');
    confirmBtn.hidden = true;
    el.appendChild(confirmBtn);
    return confirmBtn;
  }

  function coordsLabel(coords) {
    return coords.map((n) => Number(n).toFixed(5)).join(', ');
  }

  async function mountLeaflet(el, opts) {
    const L = await loadLeaflet();
    const onPick = opts.onPick || (() => {});
    const onPending = opts.onPending || (() => {});
    const initial = opts.initial || {};
    const confirm = opts.confirm === true;

    el.innerHTML = '';
    const mapNode = document.createElement('div');
    mapNode.className = 'ycs-map-canvas ycs-map-leaflet';
    el.appendChild(mapNode);
    const confirmBtn = appendConfirmBtn(el, opts, confirm);

    const center = initial.coords && initial.coords.length === 2 ? initial.coords : TASHKENT;
    // Leaflet uses [lat, lng] — same as our coords
    const map = L.map(mapNode, { zoomControl: true }).setView(center, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    let marker = L.marker(center, { draggable: true }).addTo(map);
    let pendingCoords = null;

    async function emit(coords) {
      onPick({ coords, address: coordsLabel(coords) });
    }

    function schedule(coords) {
      pendingCoords = coords.slice();
      if (confirmBtn) confirmBtn.hidden = false;
      onPending({ coords: pendingCoords });
    }

    async function confirmPick() {
      if (!pendingCoords) return;
      const coords = pendingCoords;
      pendingCoords = null;
      if (confirmBtn) confirmBtn.hidden = true;
      await emit(coords);
    }

    if (confirmBtn) confirmBtn.addEventListener('click', confirmPick);

    map.on('click', (e) => {
      const coords = [e.latlng.lat, e.latlng.lng];
      marker.setLatLng(coords);
      schedule(coords);
    });
    marker.on('dragend', () => {
      const ll = marker.getLatLng();
      schedule([ll.lat, ll.lng]);
    });

    if (initial.coords) {
      if (confirm || opts.emitInitial === false) {
        pendingCoords = initial.coords.slice();
        if (confirmBtn) confirmBtn.hidden = false;
        onPending({ coords: pendingCoords });
      } else {
        emit(initial.coords);
      }
    }

    // Leaflet needs a tick after becoming visible
    setTimeout(() => {
      try {
        map.invalidateSize();
      } catch (_) {}
    }, 80);

    return {
      hasMap: true,
      destroy() {
        try {
          map.remove();
        } catch (_) {}
      },
      setCenter(coords) {
        map.setView(coords, map.getZoom());
        marker.setLatLng(coords);
        schedule(coords.slice());
      },
    };
  }

  async function mountYandex(el, opts) {
    const onPick = opts.onPick || (() => {});
    const onPending = opts.onPending || (() => {});
    const initial = opts.initial || {};
    const confirm = opts.confirm === true;

    el.innerHTML = `<div class="map-loading">${typeof I18n !== 'undefined' ? I18n.t('map_loading') : 'Загрузка карты…'}</div>`;
    const ymaps = await loadYandexApi(opts.apiKey);
    el.innerHTML = '';
    const mapNode = document.createElement('div');
    mapNode.className = 'ycs-map-canvas';
    el.appendChild(mapNode);
    const confirmBtn = appendConfirmBtn(el, opts, confirm);

    const center = initial.coords && initial.coords.length === 2 ? initial.coords : TASHKENT;
    const map = new ymaps.Map(mapNode, {
      center,
      zoom: 12,
      controls: ['zoomControl', 'geolocationControl'],
    });
    let placemark = new ymaps.Placemark(center, {}, { draggable: true });
    map.geoObjects.add(placemark);

    let pendingCoords = null;

    async function geocode(coords) {
      try {
        const res = await ymaps.geocode(coords);
        const first = res.geoObjects.get(0);
        return first ? first.getAddressLine() : '';
      } catch (e) {
        return coordsLabel(coords);
      }
    }

    async function emit(coords) {
      const address = await geocode(coords);
      onPick({ coords, address });
    }

    function schedule(coords) {
      pendingCoords = coords;
      if (confirmBtn) confirmBtn.hidden = false;
      onPending({ coords });
    }

    async function confirmPick() {
      if (!pendingCoords) return;
      const coords = pendingCoords;
      pendingCoords = null;
      if (confirmBtn) confirmBtn.hidden = true;
      await emit(coords);
    }

    if (confirmBtn) confirmBtn.addEventListener('click', confirmPick);

    if (initial.coords) {
      if (confirm || opts.emitInitial === false) {
        pendingCoords = initial.coords.slice();
        if (confirmBtn) confirmBtn.hidden = false;
        onPending({ coords: pendingCoords });
      } else {
        emit(initial.coords);
      }
    }

    map.events.add('click', (e) => {
      const coords = e.get('coords');
      placemark.geometry.setCoordinates(coords);
      schedule(coords);
    });
    placemark.events.add('dragend', () => {
      schedule(placemark.geometry.getCoordinates());
    });

    return {
      hasMap: true,
      destroy() {
        try {
          map.destroy();
        } catch (e) {}
      },
      setCenter(coords) {
        map.setCenter(coords);
        placemark.geometry.setCoordinates(coords);
      },
    };
  }

  /**
   * @param {HTMLElement} el
   * @param {{ apiKey?: string, confirm?: boolean, confirmLabel?: string, onPick?: (data:{coords:number[],address:string})=>void, onPending?: (data:{coords:number[]})=>void, initial?: {coords?:number[],address?:string}, emitInitial?: boolean }} opts
   */
  async function mount(el, opts = {}) {
    if (!el) return null;
    el.innerHTML = `<div class="map-loading">${typeof I18n !== 'undefined' ? I18n.t('map_loading') : 'Загрузка карты…'}</div>`;

    if (opts.apiKey) {
      try {
        return await mountYandex(el, opts);
      } catch (_) {
        /* fall through to OSM */
      }
    }

    try {
      return await mountLeaflet(el, opts);
    } catch (_) {
      el.innerHTML = `<div class="map-fallback">${typeof I18n !== 'undefined' ? I18n.t('map_error') : 'Не удалось загрузить карту. Введите адрес вручную.'}</div>`;
      return { destroy() {}, hasMap: false };
    }
  }

  return { mount, TASHKENT };
})();
