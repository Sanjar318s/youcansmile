/* ============================================================
   YouCanSmile — Yandex Maps helper (Tashkent)
   ============================================================ */
const YcsMaps = (() => {
  const TASHKENT = [41.2995, 69.2401];
  let loading = null;

  function loadApi(apiKey) {
    if (window.ymaps) return Promise.resolve(window.ymaps);
    if (loading) return loading;
    if (!apiKey) return Promise.reject(new Error('no-key'));
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
      s.async = true;
      s.onload = () => {
        window.ymaps.ready(() => resolve(window.ymaps));
      };
      s.onerror = () => reject(new Error('maps-load-failed'));
      document.head.appendChild(s);
    });
    return loading;
  }

  /**
   * @param {HTMLElement} el
   * @param {{ apiKey?: string, confirm?: boolean, confirmLabel?: string, onPick?: (data:{coords:number[],address:string})=>void, onPending?: (data:{coords:number[]})=>void, initial?: {coords?:number[],address?:string} }} opts
   */
  async function mount(el, opts = {}) {
    if (!el) return null;
    const onPick = opts.onPick || (() => {});
    const onPending = opts.onPending || (() => {});
    const initial = opts.initial || {};
    const confirm = opts.confirm === true;

    if (!opts.apiKey) {
      el.innerHTML = `<div class="map-fallback" data-i18n="map_no_key">${typeof I18n !== 'undefined' ? I18n.t('map_no_key') : 'Укажите ключ Яндекс.Карт в админке или введите адрес вручную.'}</div>`;
      return { destroy() {}, hasMap: false };
    }

    el.innerHTML = `<div class="map-loading">${typeof I18n !== 'undefined' ? I18n.t('map_loading') : 'Загрузка карты…'}</div>`;
    try {
      const ymaps = await loadApi(opts.apiKey);
      el.innerHTML = '';
      const mapNode = document.createElement('div');
      mapNode.className = 'ycs-map-canvas';
      el.appendChild(mapNode);

      let confirmBtn = null;
      let pendingCoords = null;
      if (confirm) {
        confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'map-confirm-btn';
        confirmBtn.textContent =
          opts.confirmLabel ||
          (typeof I18n !== 'undefined' ? I18n.t('map_confirm_addr') : 'Подтвердить адрес');
        confirmBtn.hidden = true;
        el.appendChild(confirmBtn);
      }

      const center = initial.coords && initial.coords.length === 2 ? initial.coords : TASHKENT;
      const map = new ymaps.Map(mapNode, {
        center,
        zoom: 12,
        controls: ['zoomControl', 'geolocationControl'],
      });
      let placemark = new ymaps.Placemark(center, {}, { draggable: true });
      map.geoObjects.add(placemark);

      async function geocode(coords) {
        try {
          const res = await ymaps.geocode(coords);
          const first = res.geoObjects.get(0);
          return first ? first.getAddressLine() : '';
        } catch (e) {
          return coords.map((n) => n.toFixed(5)).join(', ');
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
        // In confirm mode (or emitInitial:false) only preview the pin — user must confirm.
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
    } catch (e) {
      el.innerHTML = `<div class="map-fallback">${typeof I18n !== 'undefined' ? I18n.t('map_error') : 'Не удалось загрузить карту. Введите адрес вручную.'}</div>`;
      return { destroy() {}, hasMap: false };
    }
  }

  return { mount, TASHKENT };
})();
